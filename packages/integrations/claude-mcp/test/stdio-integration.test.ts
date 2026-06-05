import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {McpClient} from "./helpers.js"

describe("stdio integration (real MCP protocol)", () => {
  let client: McpClient
  beforeAll(async () => { client = new McpClient(); await client.init() }, 120000)
  afterAll(() => client.kill())

  it("lists 20 tools, 2 resources, 1 prompt", async () => {
    expect((await client.list("tools/list")).tools).toHaveLength(20)
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
    client.text(await client.call("set_region_loop", {regionId: "region_1", loopDuration: "1bar"}))
    client.text(await client.call("set_track_mix", {trackId: "track_1", volume: -5, panning: 0.2}))
    client.text(await client.call("add_midi_effect", {trackId: "track_1", type: "pitch", params: {semiTones: 7}}))
    client.text(await client.call("add_automation", {trackId: "track_1", param: "panning", points: [{position: 0, value: 0.2}, {position: "1bar", value: 0.8}]}))
    const group = client.text(await client.call("add_group", {name: "Bus"}))
    client.text(await client.call("route_output", {fromId: "track_1", toGroupId: group.groupId}))
    const aux = client.text(await client.call("add_aux", {name: "FX"}))
    const send = client.text(await client.call("add_send", {fromTrackId: "track_1", toId: aux.auxId, amount: -10}))
    expect(send.sendId).toBeDefined()
    client.text(await client.call("add_audio_effect", {trackId: aux.auxId, type: "delay", params: {wet: 0.5}}))
    client.text(await client.call("remove_send", {sendId: send.sendId}))
    const info = client.text(await client.call("get_project_info", {}))
    expect(info.bpm).toBe(96)
    expect(info.timeSignature).toEqual({numerator: 3, denominator: 4})
    expect(info.tracks).toHaveLength(1)
  })

  it("list_devices returns the catalog", async () => {
    const catalog = client.text(await client.call("list_devices", {}))
    expect(catalog.instruments.map((entry: {name: string}) => entry.name)).toContain("Vaporisateur")
  })

  it("returns a tool error (not a crash) for an unknown id", async () => {
    await client.call("create_project", {name: "Err"})
    expect(client.isError(await client.call("add_notes", {regionId: "region_999", notes: [{position: 0, pitch: 60}]}))).toBe(true)
  })

  it("rejects an invalid instrument via schema validation", async () => {
    await client.call("create_project", {name: "Bad"})
    expect(client.isError(await client.call("add_instrument_track", {instrument: "NotARealSynth"}))).toBe(true)
  })

  it("errors when sending to a track instead of an aux/group", async () => {
    await client.call("create_project", {name: "Send"})
    const a = client.text(await client.call("add_instrument_track", {instrument: "Nano"}))
    const b = client.text(await client.call("add_instrument_track", {instrument: "Nano"}))
    expect(client.isError(await client.call("add_send", {fromTrackId: a.trackId, toId: b.trackId, amount: -6}))).toBe(true)
  })
})
