import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {ChildProcessWithoutNullStreams, execFileSync, spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import {dirname, join} from "node:path"
import {WebSocket} from "ws"
import {fromBytes} from "../src/serialize.js"

type RpcResponse = {id?: number, result?: Record<string, any>}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..", "..", "..")
const bundle = join(here, "..", "dist", "index.js")
const PORT = 8791

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe("A2 live bridge (server-side, over real WebSocket)", () => {
  let proc: ChildProcessWithoutNullStreams
  let socket: WebSocket
  const received: Array<{type: string, name: string, data: string}> = []
  const pending = new Map<number, (msg: RpcResponse) => void>()
  let buffer = ""
  let id = 100

  const send = (method: string, params?: unknown, rpcId?: number): Promise<RpcResponse> => {
    const message: Record<string, unknown> = {jsonrpc: "2.0", method}
    if (params !== undefined) message.params = params
    if (rpcId === undefined) { proc.stdin.write(JSON.stringify(message) + "\n"); return Promise.resolve({}) }
    message.id = rpcId
    return new Promise(resolve => { pending.set(rpcId, resolve); proc.stdin.write(JSON.stringify(message) + "\n") })
  }
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, any>> =>
    JSON.parse((await send("tools/call", {name, arguments: args}, ++id)).result!.content[0].text)

  beforeAll(async () => {
    execFileSync("npm", ["run", "build", "-w", "@opendaw/claude-mcp"], {cwd: repoRoot, stdio: "ignore"})
    proc = spawn("node", [bundle, "--bridge", "--port", String(PORT)], {stdio: ["pipe", "pipe", "pipe"]})
    proc.stdout.on("data", chunk => {
      buffer += chunk.toString()
      let index
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1)
        if (!line.startsWith("{")) continue
        const message = JSON.parse(line) as RpcResponse
        if (typeof message.id === "number" && pending.has(message.id)) { pending.get(message.id)!(message); pending.delete(message.id) }
      }
    })
    await wait(1500)
    socket = new WebSocket(`ws://localhost:${PORT}`)
    socket.on("message", raw => received.push(JSON.parse(raw.toString())))
    await new Promise<void>((resolve, reject) => { socket.on("open", () => resolve()); socket.on("error", reject) })
    await send("initialize", {protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {name: "b", version: "0"}}, 1)
    await send("notifications/initialized")
  }, 120000)

  afterAll(() => { socket?.close(); proc?.kill() })

  it("pushes a decodable project to a connected studio via open_in_studio", async () => {
    await call("create_project", {name: "Bridged", bpm: 84})
    const track = await call("add_instrument_track", {instrument: "Vaporisateur"})
    const region = await call("add_note_region", {trackId: track.trackId, position: 0, duration: "1bar"})
    await call("add_notes", {regionId: region.regionId, notes: [{position: 0, pitch: "C3"}]})
    const result = await call("open_in_studio", {})
    expect(result.ok).toBe(true)
    expect(result.clients).toBe(1)
    await wait(300)
    const projectMessage = received.find(message => message.type === "project")
    expect(projectMessage).toBeDefined()
    expect(projectMessage!.name).toBe("Bridged")
    const bytes = Buffer.from(projectMessage!.data, "base64")
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    expect(fromBytes(arrayBuffer).boxGraph).toBeDefined()
  })

  it("reports no studio when none connected (after close)", async () => {
    socket.close()
    await wait(300)
    const result = await call("open_in_studio", {})
    expect(result.clients).toBe(0)
  })
})
