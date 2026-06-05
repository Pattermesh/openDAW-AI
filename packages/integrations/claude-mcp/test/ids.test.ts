import {describe, expect, it} from "vitest"
import {IdRegistry} from "../src/ids"

describe("IdRegistry", () => {
  it("assigns prefixed ids and resolves them", () => {
    const reg = new IdRegistry()
    const id = reg.add("track", {name: "x"})
    expect(id).toBe("track_1")
    expect(reg.get<{name: string}>(id).name).toBe("x")
    expect(reg.add("track", {})).toBe("track_2")
  })
  it("throws on unknown id", () => {
    expect(() => new IdRegistry().get("track_9")).toThrow()
  })
})
