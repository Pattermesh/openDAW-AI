import {describe, expect, it} from "vitest"
import {Engine} from "../src/engine"
import {fromBytes} from "../src/serialize"

describe("e2e lo-fi beat", () => {
  it("creates bass + keys, mixes, and exports decodable bytes", () => {
    const engine = new Engine()
    engine.createProject({name: "Lo-Fi", bpm: 72})
    const bass = engine.addInstrumentTrack({instrument: "Vaporisateur", name: "Bass"})
    engine.setTrackMix({trackId: bass.trackId, volume: -4, panning: 0})
    const bassRegion = engine.addNoteRegion({trackId: bass.trackId, position: 0, duration: "4bar"})
    engine.addNotes({regionId: bassRegion.regionId, notes: Array.from({length: 8}, (_, index) => ({
      position: `${index}/2`, pitch: 36 + (index % 2) * 5, duration: "1/2", velocity: 0.8
    }))})
    const keys = engine.addInstrumentTrack({instrument: "Nano", name: "Keys"})
    const keysRegion = engine.addNoteRegion({trackId: keys.trackId, position: 0, duration: "4bar"})
    engine.addNotes({regionId: keysRegion.regionId, notes: [
      {position: 0, pitch: "C4"}, {position: 0, pitch: "E4"}, {position: 0, pitch: "G4"}
    ]})
    const info = engine.getProjectInfo()
    expect(info.bpm).toBe(72)
    expect(info.tracks).toHaveLength(2)
    expect(info.tracks.map(track => track.name)).toEqual(["Bass", "Keys"])
    const skeleton = fromBytes(engine.export())
    expect(skeleton.boxGraph).toBeDefined()
    expect(skeleton.boxGraph.boxes().length).toBeGreaterThan(5)
  })
})
