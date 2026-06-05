import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {WebSocket} from "ws"
import {fromBytes} from "../src/serialize.js"
import {McpClient} from "./helpers.js"

const PORT = 8791
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

describe("A2 live bridge (server-side, over real WebSocket)", () => {
  let client: McpClient
  let socket: WebSocket
  const received: Array<{type: string, name: string, data: string}> = []

  beforeAll(async () => {
    client = new McpClient(["--bridge", "--port", String(PORT)])
    await wait(1200)
    socket = new WebSocket(`ws://localhost:${PORT}`)
    socket.on("message", raw => received.push(JSON.parse(raw.toString())))
    await new Promise<void>((resolve, reject) => {
      socket.on("open", () => resolve())
      socket.on("error", reject)
      setTimeout(() => reject(new Error(`ws never connected to :${PORT}`)), 10000)
    })
    await client.init()
  }, 120000)

  afterAll(() => { socket?.close(); client?.kill() })

  it("pushes a decodable project to a connected studio via open_in_studio", async () => {
    await client.call("create_project", {name: "Bridged", bpm: 84})
    const track = client.text(await client.call("add_instrument_track", {instrument: "Vaporisateur"}))
    const region = client.text(await client.call("add_note_region", {trackId: track.trackId, position: 0, duration: "1bar"}))
    await client.call("add_notes", {regionId: region.regionId, notes: [{position: 0, pitch: "C3"}]})
    const result = client.text(await client.call("open_in_studio", {}))
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
    expect(client.text(await client.call("open_in_studio", {})).clients).toBe(0)
  })
})
