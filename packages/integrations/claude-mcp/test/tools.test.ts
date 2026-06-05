import {describe, expect, it} from "vitest"
import {Engine} from "../src/engine"
import {makeTools} from "../src/tools"

describe("tools", () => {
  it("exposes named tools that drive the engine", () => {
    const tools = makeTools(new Engine())
    const names = tools.map(tool => tool.name)
    expect(names).toContain("create_project")
    expect(names).toContain("add_instrument_track")
    expect(names).toContain("export_project")
    const create = tools.find(tool => tool.name === "create_project")
    expect(create).toBeDefined()
    const result = create!.run({name: "T", bpm: 100}) as {ok: boolean}
    expect(result.ok).toBe(true)
  })
  it("runs a full build through the tool layer", () => {
    const engine = new Engine()
    const tools = makeTools(engine)
    const run = (name: string, args: unknown) => tools.find(tool => tool.name === name)!.run(args)
    run("create_project", {name: "ToolBeat", bpm: 100})
    const {trackId} = run("add_instrument_track", {instrument: "Nano"}) as {trackId: string}
    const {regionId} = run("add_note_region", {trackId, position: 0, duration: "2bar"}) as {regionId: string}
    const {count} = run("add_notes", {regionId, notes: [{position: 0, pitch: "C4"}]}) as {count: number}
    expect(count).toBe(1)
    const info = run("get_project_info", {}) as {tracks: ReadonlyArray<unknown>}
    expect(info.tracks).toHaveLength(1)
  })
})
