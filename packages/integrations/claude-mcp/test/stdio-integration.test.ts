import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {ChildProcessWithoutNullStreams, execFileSync, spawn} from "node:child_process"
import {fileURLToPath} from "node:url"
import {dirname, join} from "node:path"

type RpcResponse = {id?: number, result?: Record<string, any>, error?: unknown}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..", "..", "..")
const bundle = join(here, "..", "dist", "index.js")

class Client {
  readonly #proc: ChildProcessWithoutNullStreams
  #buffer = ""
  readonly #pending = new Map<number, (msg: RpcResponse) => void>()
  #id = 100
  constructor() {
    execFileSync("npm", ["run", "build", "-w", "@opendaw/claude-mcp"], {cwd: repoRoot, stdio: "ignore"})
    this.#proc = spawn("node", [bundle], {stdio: ["pipe", "pipe", "pipe"]})
    this.#proc.stdout.on("data", chunk => {
      this.#buffer += chunk.toString()
      let index
      while ((index = this.#buffer.indexOf("\n")) >= 0) {
        const line = this.#buffer.slice(0, index).trim()
        this.#buffer = this.#buffer.slice(index + 1)
        if (!line.startsWith("{")) continue
        const message = JSON.parse(line) as RpcResponse
        if (typeof message.id === "number" && this.#pending.has(message.id)) {
          this.#pending.get(message.id)!(message); this.#pending.delete(message.id)
        }
      }
    })
  }
  #send(method: string, params?: unknown, id?: number): Promise<RpcResponse> {
    const message: Record<string, unknown> = {jsonrpc: "2.0", method}
    if (params !== undefined) message.params = params
    if (id === undefined) { this.#proc.stdin.write(JSON.stringify(message) + "\n"); return Promise.resolve({}) }
    message.id = id
    return new Promise(resolve => { this.#pending.set(id, resolve); this.#proc.stdin.write(JSON.stringify(message) + "\n") })
  }
  async init(): Promise<void> {
    await this.#send("initialize", {protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {name: "itest", version: "0"}}, 1)
    await this.#send("notifications/initialized")
  }
  async call(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
    return (await this.#send("tools/call", {name, arguments: args}, ++this.#id)).result ?? {}
  }
  async list(method: string): Promise<Record<string, any>> { return (await this.#send(method, {}, ++this.#id)).result ?? {} }
  text(result: Record<string, any>): Record<string, any> { return JSON.parse(result.content[0].text) }
  isError(result: Record<string, any>): boolean { return result.isError === true }
  kill(): void { this.#proc.kill() }
}

describe("stdio integration (real MCP protocol)", () => {
  let client: Client
  beforeAll(async () => { client = new Client(); await client.init() }, 120000)
  afterAll(() => client.kill())

  it("lists 14 tools, 2 resources, 1 prompt", async () => {
    expect((await client.list("tools/list")).tools).toHaveLength(14)
    expect((await client.list("resources/list")).resources).toHaveLength(2)
    expect((await client.list("prompts/list")).prompts).toHaveLength(1)
  })

  it("builds a full project across mutating tools", async () => {
    expect(client.text(await client.call("create_project", {name: "IT", bpm: 96})).ok).toBe(true)
    client.text(await client.call("set_time_signature", {numerator: 3, denominator: 4}))
    const track = client.text(await client.call("add_instrument_track", {instrument: "Vaporisateur", name: "Lead"}))
    expect(track.trackId).toBe("track_1")
    const region = client.text(await client.call("add_note_region", {trackId: "track_1", position: 0, duration: "2bar"}))
    expect(region.regionId).toBe("region_1")
    expect(client.text(await client.call("add_notes", {regionId: "region_1", notes: [{position: 0, pitch: "C4"}, {position: "1/4", pitch: 67, duration: "1/8", velocity: 0.7}]})).count).toBe(2)
    client.text(await client.call("set_track_mix", {trackId: "track_1", volume: -5, panning: 0.2}))
    client.text(await client.call("add_midi_effect", {trackId: "track_1", type: "pitch", params: {semiTones: 7}}))
    const aux = client.text(await client.call("add_aux", {name: "FX"}))
    client.text(await client.call("add_send", {fromTrackId: "track_1", toId: aux.auxId, amount: -10}))
    client.text(await client.call("add_audio_effect", {trackId: aux.auxId, type: "delay", params: {wet: 0.5}}))
    const info = client.text(await client.call("get_project_info", {}))
    expect(info.bpm).toBe(96)
    expect(info.timeSignature).toEqual({numerator: 3, denominator: 4})
    expect(info.tracks).toHaveLength(1)
  })

  it("returns a tool error (not a crash) for an unknown id", async () => {
    await client.call("create_project", {name: "Err"})
    expect(client.isError(await client.call("add_notes", {regionId: "region_999", notes: [{position: 0, pitch: 60}]}))).toBe(true)
  })

  it("rejects an invalid instrument via schema validation", async () => {
    await client.call("create_project", {name: "Bad"})
    expect(client.isError(await client.call("add_instrument_track", {instrument: "NotARealSynth"}))).toBe(true)
  })
})
