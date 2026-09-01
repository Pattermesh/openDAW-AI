import {ChildProcessWithoutNullStreams, execFileSync, spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import {dirname, join} from "node:path"
import {Engine} from "../src/engine.js"

const here = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(here, "..", "..", "..", "..")
export const bundlePath = join(here, "..", "dist", "index.js")

let built = false
// Build the single-file server bundle once per test run (idempotent).
export const buildBundle = (): void => {
  if (built) {return}
  execFileSync("npm", ["run", "build", "-w", "@opendaw/claude-mcp"], {cwd: repoRoot, stdio: "ignore"})
  built = true
}

type RpcResponse = {id?: number, result?: Record<string, any>, error?: {message?: string}}
type Pending = {resolve: (msg: RpcResponse) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>}

// A small, defensive JSON-RPC-over-stdio client for the built MCP server.
// Error handling: every request has a timeout; a crash/non-zero exit rejects all
// in-flight requests with the captured stderr so failures are diagnosable, not hangs.
export class McpClient {
  readonly #proc: ChildProcessWithoutNullStreams
  readonly #pending = new Map<number, Pending>()
  #buffer = ""
  #stderr = ""
  #id = 100

  constructor(args: ReadonlyArray<string> = []) {
    buildBundle()
    this.#proc = spawn("node", [bundlePath, ...args], {stdio: ["pipe", "pipe", "pipe"]})
    this.#proc.stderr.on("data", chunk => { this.#stderr += chunk.toString() })
    this.#proc.on("error", error => this.#rejectAll(`spawn failed: ${error.message}`))
    this.#proc.on("exit", code => { if (code !== 0 && code !== null) {this.#rejectAll(`server exited ${code}\n${this.#stderr}`)} })
    this.#proc.stdout.on("data", chunk => {
      this.#buffer += chunk.toString()
      let index
      while ((index = this.#buffer.indexOf("\n")) >= 0) {
        const line = this.#buffer.slice(0, index).trim()
        this.#buffer = this.#buffer.slice(index + 1)
        if (!line.startsWith("{")) {continue}
        let message: RpcResponse
        try { message = JSON.parse(line) } catch { continue }
        if (typeof message.id === "number") {
          const pending = this.#pending.get(message.id)
          if (pending !== undefined) { clearTimeout(pending.timer); this.#pending.delete(message.id); pending.resolve(message) }
        }
      }
    })
  }

  #rejectAll(message: string): void {
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)) }
    this.#pending.clear()
  }

  #send(method: string, params?: unknown, id?: number, timeoutMs = 20000): Promise<RpcResponse> {
    const message: Record<string, unknown> = {jsonrpc: "2.0", method}
    if (params !== undefined) {message.params = params}
    if (id === undefined) { this.#proc.stdin.write(JSON.stringify(message) + "\n"); return Promise.resolve({}) }
    message.id = id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms. stderr tail:\n${this.#stderr.slice(-600)}`))
      }, timeoutMs)
      this.#pending.set(id, {resolve, reject, timer})
      this.#proc.stdin.write(JSON.stringify(message) + "\n")
    })
  }

  async init(): Promise<void> {
    await this.#send("initialize", {protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {name: "test", version: "0"}}, 1)
    await this.#send("notifications/initialized")
  }

  async call(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
    const response = await this.#send("tools/call", {name, arguments: args}, ++this.#id)
    if (response.result === undefined) {throw new Error(`tools/call ${name} returned no result: ${JSON.stringify(response)}`)}
    return response.result
  }

  async list(method: string): Promise<Record<string, any>> {
    const response = await this.#send(method, {}, ++this.#id)
    return response.result ?? {}
  }

  text(result: Record<string, any>): Record<string, any> { return JSON.parse(result.content[0].text) }
  isError(result: Record<string, any>): boolean { return result.isError === true }
  kill(): void { this.#proc.kill() }
}

// Engine helper: a fresh Engine with a created project.
export const engineWithProject = (input: {name?: string, bpm?: number} = {}): Engine => {
  const engine = new Engine()
  engine.createProject({name: input.name ?? "Test", bpm: input.bpm})
  return engine
}
