import {describe, expect, it} from "vitest"
import {Engine} from "../src/engine"
import {fromBytes} from "../src/serialize"

describe("Engine", () => {
  it("creates a project with an instrument track and notes, then exports decodable bytes", () => {
    const engine = new Engine()
    engine.createProject({name: "Beat", bpm: 90})
    const {trackId} = engine.addInstrumentTrack({instrument: "Vaporisateur", name: "Lead"})
    const {regionId} = engine.addNoteRegion({trackId, position: 0, duration: "4bar"})
    const {count} = engine.addNotes({regionId, notes: [
      {position: 0, pitch: "C4", duration: "1/8", velocity: 0.9},
      {position: "1/8", pitch: 64, duration: "1/8"}
    ]})
    expect(count).toBe(2)
    const info = engine.getProjectInfo()
    expect(info.bpm).toBe(90)
    expect(info.tracks).toHaveLength(1)
    expect(info.tracks[0].instrument).toBe("Vaporisateur")
    const bytes = engine.export()
    expect(fromBytes(bytes).boxGraph).toBeDefined()
  })

  it("sets mix, adds aux + send, and an effect", () => {
    const engine = new Engine()
    engine.createProject({name: "Mix"})
    const {trackId} = engine.addInstrumentTrack({instrument: "Vaporisateur"})
    engine.setTrackMix({trackId, volume: -6, panning: -0.5, mute: false})
    const {auxId} = engine.addAux({name: "Reverb Bus"})
    engine.addSend({fromTrackId: trackId, toId: auxId, amount: -12, mode: "post"})
    engine.addAudioEffect({trackId: auxId, type: "delay", params: {wet: 0.6}})
    expect(() => engine.export()).not.toThrow()
  })
})
