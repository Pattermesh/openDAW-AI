// Engine — the single source of truth for the in-progress project. Wraps openDAW's
// headless builder (@opendaw/studio-scripting) and a friendly id registry so a stateless
// MCP/tool protocol can build and edit a project across independent calls. Every mode
// (offline export, live bridge, in-studio sidebar) drives THIS object. See
// opendaw-contributions/docs/code-walkthrough.md §4.
import {writeFileSync} from "node:fs"
import {homedir} from "node:os"
import {resolve, sep} from "node:path"
import {
  ApiImpl, AudioEffects, AuxAudioUnit, GroupAudioUnit,
  InstrumentAudioUnit, Instruments, MIDIEffects, NoteRegion, NoteTrack, ProjectImpl, Send
} from "@opendaw/studio-scripting"
import {Interpolation, PPQN} from "@opendaw/lib-dsp"
import {makeApi} from "./headless.js"
import {toBytes} from "./serialize.js"
import {parsePPQN, parsePitch} from "./time.js"
import {IdRegistry} from "./ids.js"

export type InstrumentName = keyof Instruments
type AnyUnit = InstrumentAudioUnit | AuxAudioUnit | GroupAudioUnit
// Discriminated union keyed by `kind`: lets tools (a) validate intent — e.g. a send must
// target an aux/group, output must route to a group — and (b) recover the precisely-typed
// unit from a string id without unsafe casts. (Replaced an `as Aux|Group` cast that hid a
// mis-routing bug.)
type TrackEntry = {kind: "track", unit: InstrumentAudioUnit, track: NoteTrack, name: string, instrument: InstrumentName}
type AuxEntry = {kind: "aux", unit: AuxAudioUnit}
type GroupEntry = {kind: "group", unit: GroupAudioUnit}
type Entry = TrackEntry | AuxEntry | GroupEntry

type NoteInput = {position: number | string, pitch: number | string, duration?: number | string, velocity?: number}
type TimeSig = {numerator: number, denominator: number}
type TrackSummary = {
  id: string, name: string, instrument: InstrumentName, regions: number,
  audioEffects: Array<string>, midiEffects: Array<string>, sends: number, automation: Array<string>
}

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))

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
    const id = this.#ids.add("track", {kind: "track", unit, track, name, instrument: input.instrument} satisfies TrackEntry)
    this.#tracks.push({id, name, instrument: input.instrument, regions: 0, audioEffects: [], midiEffects: [], sends: 0, automation: []})
    return {trackId: id}
  }

  addNoteRegion(input: {trackId: string, position: number | string, duration: number | string, label?: string}): {regionId: string} {
    const entry = this.#track(input.trackId)
    const region = entry.track.addRegion({position: Math.max(0, parsePPQN(input.position)), duration: Math.max(0, parsePPQN(input.duration))})
    if (input.label !== undefined) region.label = input.label
    const summary = this.#tracks.find(track => track.id === input.trackId)
    if (summary !== undefined) summary.regions++
    return {regionId: this.#ids.add("region", region)}
  }

  addNotes(input: {regionId: string, notes: ReadonlyArray<NoteInput>}): {count: number} {
    const region = this.#ids.get<NoteRegion>(input.regionId)
    // Clamp to the box model's valid ranges: a model might send MIDI-style 0-127 velocities
    // or out-of-range pitches/positions; we coerce rather than emit an invalid project.
    const events = input.notes.map(note => ({
      position: Math.max(0, parsePPQN(note.position)),
      pitch: Math.max(0, Math.min(127, Math.round(parsePitch(note.pitch)))),
      duration: note.duration === undefined ? undefined : Math.max(0, parsePPQN(note.duration)),
      velocity: note.velocity === undefined ? undefined : clampUnit(note.velocity)
    }))
    region.addEvents(events)
    return {count: events.length}
  }

  setTrackMix(input: {trackId: string, volume?: number, panning?: number, mute?: boolean, solo?: boolean}): {ok: true} {
    const unit = this.#unit(input.trackId)
    if (input.volume !== undefined) unit.volume = input.volume
    if (input.panning !== undefined) unit.panning = Math.max(-1, Math.min(1, input.panning))
    if (input.mute !== undefined) unit.mute = input.mute
    if (input.solo !== undefined) unit.solo = input.solo
    return {ok: true}
  }

  addAux(input: {name?: string}): {auxId: string} {
    const aux = this.#project.addAuxUnit(input.name === undefined ? undefined : {label: input.name})
    return {auxId: this.#ids.add("aux", {kind: "aux", unit: aux} satisfies AuxEntry)}
  }

  addGroup(input: {name?: string}): {groupId: string} {
    const group = this.#project.addGroupUnit(input.name === undefined ? undefined : {label: input.name})
    return {groupId: this.#ids.add("group", {kind: "group", unit: group} satisfies GroupEntry)}
  }

  addSend(input: {fromTrackId: string, toId: string, amount: number, mode?: "pre" | "post"}): {sendId: string} {
    const from = this.#unit(input.fromTrackId)
    const target = this.#ids.get<Entry>(input.toId)
    if (target.kind === "track") throw new Error(`Send target ${input.toId} is a track; sends must target an aux or group`)
    const send = from.addSend(target.unit, {amount: input.amount, mode: input.mode ?? "post"})
    this.#onSummary(input.fromTrackId, summary => summary.sends++)
    return {sendId: this.#ids.add("send", {send, from})}
  }

  removeSend(input: {sendId: string}): {ok: true} {
    const entry = this.#ids.get<{send: Send, from: AnyUnit}>(input.sendId)
    entry.from.removeSend(entry.send)
    return {ok: true}
  }

  routeOutput(input: {fromId: string, toGroupId: string}): {ok: true} {
    const from = this.#unit(input.fromId)
    const target = this.#ids.get<Entry>(input.toGroupId)
    if (target.kind !== "group") throw new Error(`Output target ${input.toGroupId} must be a group`)
    from.output = target.unit
    return {ok: true}
  }

  setRegionLoop(input: {regionId: string, loopDuration: number | string, loopOffset?: number | string}): {ok: true} {
    const region = this.#ids.get<NoteRegion>(input.regionId)
    region.loopDuration = Math.max(0, parsePPQN(input.loopDuration))
    if (input.loopOffset !== undefined) region.loopOffset = Math.max(0, parsePPQN(input.loopOffset))
    return {ok: true}
  }

  addAudioEffect<T extends keyof AudioEffects>(input: {trackId: string, type: T, params?: Partial<AudioEffects[T]>}): {ok: true} {
    this.#unit(input.trackId).addAudioEffect(input.type, input.params)
    this.#onSummary(input.trackId, summary => summary.audioEffects.push(String(input.type)))
    return {ok: true}
  }

  addMidiEffect<T extends keyof MIDIEffects>(input: {trackId: string, type: T, params?: Partial<MIDIEffects[T]>}): {ok: true} {
    this.#unit(input.trackId).addMIDIEffect(input.type, input.params)
    this.#onSummary(input.trackId, summary => summary.midiEffects.push(String(input.type)))
    return {ok: true}
  }

  addAutomation(input: {trackId: string, param: "volume" | "panning",
    points: ReadonlyArray<{position: number | string, value: number, interpolation?: "linear" | "step"}>}): {regionId: string, count: number} {
    const unit = this.#unit(input.trackId)
    const track = unit.addValueTrack(unit, input.param)
    // The automation region must be long enough to contain every point, so size it to the
    // last point's position plus one bar of headroom.
    const positions = input.points.map(point => parsePPQN(point.position))
    const region = track.addRegion({position: 0, duration: Math.max(0, ...positions) + PPQN.Bar})
    region.addEvents(input.points.map(point => ({
      position: parsePPQN(point.position),
      value: Math.max(0, Math.min(1, point.value)),
      interpolation: point.interpolation === "step" ? Interpolation.None : Interpolation.Linear
    })))
    this.#onSummary(input.trackId, summary => summary.automation.push(input.param))
    return {regionId: this.#ids.add("automation", region), count: input.points.length}
  }

  getProjectInfo(): {name: string, bpm: number, timeSignature: TimeSig, tracks: ReadonlyArray<TrackSummary>} {
    return {name: this.#project.name, bpm: this.#project.bpm, timeSignature: this.#project.timeSignature, tracks: this.#tracks}
  }

  export(): ArrayBufferLike { return toBytes(this.#project) }

  exportToFile(target: string): {path: string, bytes: number} {
    // Security: an LLM-driven tool must not write arbitrary files. Confine writes to an
    // allowed root ($HOME or OPENDAW_MCP_OUT_DIR) and to the .od extension; reject traversal.
    const root = resolve(process.env.OPENDAW_MCP_OUT_DIR ?? homedir())
    const abs = resolve(target)
    if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`Refusing to write outside ${root}: ${abs}`)
    if (!abs.endsWith(".od")) throw new Error(`Output path must end in .od: ${abs}`)
    const data = new Uint8Array(this.export())
    writeFileSync(abs, data)
    return {path: abs, bytes: data.byteLength}
  }

  // Maintain the human/AI-readable per-track summary (effects/sends/automation) that
  // get_project_info returns, so the model can SEE the session it is editing.
  #onSummary(id: string, mutate: (summary: TrackSummary) => void): void {
    const summary = this.#tracks.find(track => track.id === id)
    if (summary !== undefined) {mutate(summary)}
  }

  #unit(id: string): AnyUnit { return this.#ids.get<Entry>(id).unit }

  #track(id: string): TrackEntry {
    const entry = this.#ids.get<Entry>(id)
    if (entry.kind !== "track") throw new Error(`${id} is not an instrument track`)
    return entry
  }
}
