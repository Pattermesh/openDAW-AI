import {describe, expect, it} from "vitest"
import {mkdtempSync, readFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Engine} from "../src/engine"
import {fromBytes} from "../src/serialize"

describe("export to file", () => {
  it("writes a .od file that decodes", () => {
    const engine = new Engine()
    engine.createProject({name: "File"})
    engine.addInstrumentTrack({instrument: "Nano"})
    const path = join(mkdtempSync(join(tmpdir(), "od-")), "out.od")
    const result = engine.exportToFile(path)
    expect(result.path).toBe(path)
    expect(result.bytes).toBeGreaterThan(0)
    const buffer = readFileSync(path)
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    expect(fromBytes(arrayBuffer).boxGraph).toBeDefined()
  })
})
