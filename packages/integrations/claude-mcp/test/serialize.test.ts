import {describe, expect, it} from "vitest"
import {makeApi} from "../src/headless"
import {toBytes, fromBytes} from "../src/serialize"

describe("serialize", () => {
  it("builds an empty project, encodes and decodes it", () => {
    const project = makeApi().newProject("Test")
    project.bpm = 128
    const bytes = toBytes(project)
    expect(bytes.byteLength).toBeGreaterThan(0)
    const skeleton = fromBytes(bytes)
    expect(skeleton.boxGraph).toBeDefined()
  })
})
