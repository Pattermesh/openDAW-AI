import {writeFileSync} from "node:fs"
import {
  ApiImpl, AudioEffects, AuxAudioUnit, GroupAudioUnit,
  InstrumentAudioUnit, Instruments, NoteRegion, NoteTrack, ProjectImpl
} from "@opendaw/studio-scripting"
import {makeApi} from "./headless"
import {toBytes} from "./serialize"
import {parsePPQN, parsePitch} from "./time"
import {IdRegistry} from "./ids"

export type InstrumentName = keyof Instruments
type AnyUnit = InstrumentAudioUnit | AuxAudioUnit | GroupAudioUnit
type TrackEntry = {unit: InstrumentAudioUnit, track: NoteTrack, name: string, instrument: InstrumentName}
type UnitEntry = {unit: AnyUnit}

type NoteInput = {position: number | string, pitch: number | string, duration?: number | string, velocity?: number}
type TimeSig = {numerator: number, denominator: number}
type TrackSummary = {id: string, name: string, instrument: InstrumentName, regions: number}

export class Engine {
  #api: ApiImpl = makeApi()
  #project: ProjectImpl = new ProjectImpl(this.#api, "Untitled")
  #ids = new IdRegistry()
  #tracks: Array<TrackSummary> = []

  createProject(input: {name: string, bpm?: number, timeSignature?: TimeSig}): {ok: true} {
    this.#api = makeApi()
    this.#project = new ProjectImpl(this.#api, input.name)
    this.#ids.clear()
    this.#tracks = []
    if (input.bpm !== undefined) this.#project.bpm = input.bpm
    if (input.timeSignature !== undefined) this.#project.timeSignature = input.timeSignature
    return {ok: true}
  }

  setTempo(bpm: number): {ok: true} { this.#project.bpm = bpm; return {ok: true} }

  setTimeSignature(numerator: number, denominator: number): {ok: true} {
    this.#project.timeSignature = {numerator, denominator}
    return {ok: true}
  }

  addInstrumentTrack(input: {instrument: InstrumentName, name?: string}): {trackId: string} {
    const unit = this.#project.addInstrumentUnit(input.instrument)
    const track = unit.addNoteTrack()
    const name = input.name ?? input.instrument
    const id = this.#ids.add("track", {unit, track, name, instrument: input.instrument} satisfies TrackEntry)
    this.#tracks.push({id, name, instrument: input.instrument, regions: 0})
    return {trackId: id}
  }

  addNoteRegion(input: {trackId: string, position: number | string, duration: number | string, label?: string}): {regionId: string} {
    const entry = this.#ids.get<TrackEntry>(input.trackId)
    const region = entry.track.addRegion({position: parsePPQN(input.position), duration: parsePPQN(input.duration)})
    if (input.label !== undefined) region.label = input.label
    const summary = this.#tracks.find(track => track.id === input.trackId)
    if (summary !== undefined) summary.regions++
    return {regionId: this.#ids.add("region", region)}
  }

  addNotes(input: {regionId: string, notes: ReadonlyArray<NoteInput>}): {count: number} {
    const region = this.#ids.get<NoteRegion>(input.regionId)
    const events = input.notes.map(note => ({
      position: parsePPQN(note.position),
      pitch: parsePitch(note.pitch),
      duration: note.duration === undefined ? undefined : parsePPQN(note.duration),
      velocity: note.velocity
    }))
    region.addEvents(events)
    return {count: events.length}
  }

  setTrackMix(input: {trackId: string, volume?: number, panning?: number, mute?: boolean, solo?: boolean}): {ok: true} {
    const unit = this.#resolveUnit(input.trackId)
    if (input.volume !== undefined) unit.volume = input.volume
    if (input.panning !== undefined) unit.panning = input.panning
    if (input.mute !== undefined) unit.mute = input.mute
    if (input.solo !== undefined) unit.solo = input.solo
    return {ok: true}
  }

  addAux(input: {name?: string}): {auxId: string} {
    const aux = this.#project.addAuxUnit(input.name === undefined ? undefined : {label: input.name})
    return {auxId: this.#ids.add("aux", {unit: aux} satisfies UnitEntry)}
  }

  addGroup(input: {name?: string}): {groupId: string} {
    const group = this.#project.addGroupUnit(input.name === undefined ? undefined : {label: input.name})
    return {groupId: this.#ids.add("group", {unit: group} satisfies UnitEntry)}
  }

  addSend(input: {fromTrackId: string, toId: string, amount: number, mode?: "pre" | "post"}): {ok: true} {
    const from = this.#resolveUnit(input.fromTrackId)
    const target = this.#resolveUnit(input.toId)
    from.addSend(target as AuxAudioUnit | GroupAudioUnit, {amount: input.amount, mode: input.mode ?? "post"})
    return {ok: true}
  }

  addAudioEffect<T extends keyof AudioEffects>(input: {trackId: string, type: T, params?: Partial<AudioEffects[T]>}): {ok: true} {
    this.#resolveUnit(input.trackId).addAudioEffect(input.type, input.params)
    return {ok: true}
  }

  getProjectInfo(): {name: string, bpm: number, timeSignature: TimeSig, tracks: ReadonlyArray<TrackSummary>} {
    return {name: this.#project.name, bpm: this.#project.bpm, timeSignature: this.#project.timeSignature, tracks: this.#tracks}
  }

  export(): ArrayBufferLike { return toBytes(this.#project) }

  exportToFile(path: string): {path: string, bytes: number} {
    const data = new Uint8Array(this.export())
    writeFileSync(path, data)
    return {path, bytes: data.byteLength}
  }

  #resolveUnit(id: string): AnyUnit {
    return this.#ids.get<UnitEntry>(id).unit
  }
}
