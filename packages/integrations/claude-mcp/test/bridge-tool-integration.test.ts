import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {WebSocket} from "ws"
import {McpClient} from "./helpers.js"

const PORT = 8795
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

type ToolResult = {type: "result", id: number, ok: boolean, value?: any, error?: string}

// Stands in for the studio's AiBridgeClient: sends tool calls over the bridge and
// awaits results; collects pushed projects.
class FakeStudio {
  readonly #socket: WebSocket
  readonly #pending = new Map<number, (msg: ToolResult) => void>()
  #id = 0
  readonly projects: Array<{type: string, name: string}> = []
  constructor(port: number) {
    this.#socket = new WebSocket(`ws://localhost:${port}`)
    this.#socket.on("message", raw => {
      const message = JSON.parse(raw.toString())
      if (message.type === "result" && this.#pending.has(message.id)) { this.#pending.get(message.id)!(message); this.#pending.delete(message.id) }
      if (message.type === "project") { this.projects.push(message) }
    })
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.on("open", () => resolve())
      this.#socket.on("error", reject)
      setTimeout(() => reject(new Error(`ws never connected to :${PORT}`)), 8000)
    })
  }
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const id = ++this.#id
    return new Promise<ToolResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`tool ${name} timed out`)), 8000)
      this.#pending.set(id, message => { clearTimeout(timer); resolve(message) })
      this.#socket.send(JSON.stringify({type: "tool", id, name, args}))
    })
  }
  listTools(): Promise<ToolResult> {
    const id = ++this.#id
    return new Promise<ToolResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("list_tools timed out")), 8000)
      this.#pending.set(id, message => { clearTimeout(timer); resolve(message) })
      this.#socket.send(JSON.stringify({type: "list_tools", id}))
    })
  }
  close(): void { this.#socket.close() }
}

describe("A2 bidirectional bridge (studio → MCP tool calls)", () => {
  let client: McpClient
  let studio: FakeStudio
  beforeAll(async () => {
    client = new McpClient(["--bridge", "--port", String(PORT)])
    await wait(1200)
    studio = new FakeStudio(PORT)
    await studio.open()
    await client.init()
  }, 120000)
  afterAll(() => { studio?.close(); client?.kill() })

  it("executes tool calls and returns structured results", async () => {
    expect((await studio.callTool("create_project", {name: "Bi", bpm: 90})).ok).toBe(true)
    const track = await studio.callTool("add_instrument_track", {instrument: "Vaporisateur"})
    expect(track.ok).toBe(true)
    expect(track.value.trackId).toBe("track_1")
    await studio.callTool("add_note_region", {trackId: "track_1", position: 0, duration: "1bar"})
    const notes = await studio.callTool("add_notes", {regionId: "region_1", notes: [{position: 0, pitch: "C4"}]})
    expect(notes.value.count).toBe(1)
  })

  it("returns ok:false for tool errors and unknown tools (no crash)", async () => {
    expect((await studio.callTool("add_notes", {regionId: "nope", notes: []})).ok).toBe(false)
    const unknown = await studio.callTool("does_not_exist", {})
    expect(unknown.ok).toBe(false)
    expect(unknown.error).toMatch(/Unknown tool/)
  })

  it("lists tool specs (name + input_schema) for the model", async () => {
    const result = await studio.listTools()
    expect(result.ok).toBe(true)
    const specs = result.value as Array<{name: string, input_schema: unknown}>
    expect(specs).toHaveLength(20)
    expect(specs.map(spec => spec.name)).toContain("create_project")
    expect(specs[0]).toHaveProperty("input_schema")
  })

  it("refreshes the studio with open_in_studio (project push)", async () => {
    studio.projects.length = 0
    const result = await studio.callTool("open_in_studio", {})
    expect(result.ok).toBe(true)
    await wait(300)
    expect(studio.projects.find(message => message.type === "project")).toBeDefined()
  })
})
