import {describe, expect, it} from "vitest"
import {CATALOG} from "../src/catalog"

describe("catalog", () => {
  it("lists the 6 instruments", () => {
    expect(CATALOG.instruments.map(entry => entry.name)).toContain("Vaporisateur")
    expect(CATALOG.instruments).toHaveLength(6)
  })
  it("lists delay + pitch effects", () => {
    expect(CATALOG.audioEffects.map(entry => entry.name)).toEqual(["delay"])
    expect(CATALOG.midiEffects.map(entry => entry.name)).toEqual(["pitch"])
  })
})
