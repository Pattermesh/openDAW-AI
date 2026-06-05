import {describe, expect, it} from "vitest"
import {Engine} from "../src/engine"
import {fromBytes} from "../src/serialize"
import {engineWithProject} from "./helpers.js"

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

  it("adds a midi effect and rejects sends that target a track", () => {
    const engine = new Engine()
    engine.createProject({name: "Guard"})
    const a = engine.addInstrumentTrack({instrument: "Vaporisateur"})
    const b = engine.addInstrumentTrack({instrument: "Nano"})
    engine.addMidiEffect({trackId: a.trackId, type: "pitch", params: {octaves: -1}})
    expect(() => engine.addSend({fromTrackId: a.trackId, toId: b.trackId, amount: -6})).toThrow(/aux or group/)
  })

  it("automates a track's volume over time", () => {
    const engine = new Engine()
    engine.createProject({name: "Auto"})
    const {trackId} = engine.addInstrumentTrack({instrument: "Vaporisateur"})
    const {count} = engine.addAutomation({trackId, param: "volume", points: [
      {position: 0, value: 0.2}, {position: "1bar", value: 0.9, interpolation: "linear"}
    ]})
    expect(count).toBe(2)
    expect(() => engine.export()).not.toThrow()
  })

  it("refuses to export outside the allowed root or to a non-.od path", () => {
    const engine = new Engine()
    engine.createProject({name: "Safe"})
    engine.addInstrumentTrack({instrument: "Nano"})
    expect(() => engine.exportToFile("/etc/passwd")).toThrow(/outside|\.od/)
    expect(() => engine.exportToFile(`${process.env.HOME}/x.txt`)).toThrow(/\.od/)
  })

  it("routes a track to a group, sends to an aux, then removes the send", () => {
    const engine = engineWithProject({name: "Route"})
    const {trackId} = engine.addInstrumentTrack({instrument: "Vaporisateur"})
    const {groupId} = engine.addGroup({name: "Bus"})
    engine.routeOutput({fromId: trackId, toGroupId: groupId})
    const {auxId} = engine.addAux({name: "FX"})
    const {sendId} = engine.addSend({fromTrackId: trackId, toId: auxId, amount: -8})
    engine.removeSend({sendId})
    expect(() => engine.export()).not.toThrow()
  })

  it("rejects routing output to a non-group target", () => {
    const engine = engineWithProject()
    const a = engine.addInstrumentTrack({instrument: "Nano"})
    const b = engine.addInstrumentTrack({instrument: "Nano"})
    expect(() => engine.routeOutput({fromId: a.trackId, toGroupId: b.trackId})).toThrow(/must be a group/)
  })

  it("sets a region loop", () => {
    const engine = engineWithProject()
    const {trackId} = engine.addInstrumentTrack({instrument: "Nano"})
    const {regionId} = engine.addNoteRegion({trackId, position: 0, duration: "4bar"})
    engine.setRegionLoop({regionId, loopDuration: "1bar", loopOffset: 0})
    expect(() => engine.export()).not.toThrow()
  })
})
