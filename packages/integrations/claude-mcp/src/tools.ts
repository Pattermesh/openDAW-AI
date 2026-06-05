import {z} from "zod"
import {AudioEffects, MIDIEffects} from "@opendaw/studio-scripting"
import {Engine, InstrumentName} from "./engine.js"
import {StudioBridge} from "./bridge.js"

export type Tool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  run: (args: unknown) => unknown
}

const INSTRUMENTS = ["Vaporisateur", "Playfield", "Nano", "Soundfont", "Tape", "MIDIOutput"] as const satisfies ReadonlyArray<InstrumentName>
const time = z.union([z.number(), z.string()])
const pitch = z.union([z.number(), z.string()])

export const makeTools = (engine: Engine, bridge?: StudioBridge): ReadonlyArray<Tool> => {
  const createProject = z.object({
    name: z.string(),
    bpm: z.number().optional(),
    timeSignature: z.object({numerator: z.number(), denominator: z.number()}).optional()
  })
  const setTempo = z.object({bpm: z.number()})
  const setTimeSignature = z.object({numerator: z.number(), denominator: z.number()})
  const addInstrumentTrack = z.object({instrument: z.enum(INSTRUMENTS), name: z.string().optional()})
  const addNoteRegion = z.object({trackId: z.string(), position: time, duration: time, label: z.string().optional()})
  const addNotes = z.object({
    regionId: z.string(),
    notes: z.array(z.object({position: time, pitch, duration: time.optional(), velocity: z.number().optional()}))
  })
  const setTrackMix = z.object({
    trackId: z.string(), volume: z.number().optional(), panning: z.number().optional(),
    mute: z.boolean().optional(), solo: z.boolean().optional()
  })
  const addAux = z.object({name: z.string().optional()})
  const addGroup = z.object({name: z.string().optional()})
  const addSend = z.object({fromTrackId: z.string(), toId: z.string(), amount: z.number(), mode: z.enum(["pre", "post"]).optional()})
  const addAudioEffect = z.object({trackId: z.string(), type: z.enum(["delay"]), params: z.record(z.string(), z.number()).optional()})
  const addMidiEffect = z.object({trackId: z.string(), type: z.enum(["pitch"]), params: z.record(z.string(), z.number()).optional()})
  const addAutomation = z.object({trackId: z.string(), param: z.enum(["volume", "panning"]),
    points: z.array(z.object({position: time, value: z.number(), interpolation: z.enum(["linear", "step"]).optional()}))})
  const exportProject = z.object({path: z.string()})
  const empty = z.object({})
  return [
    {name: "create_project", description: "Create/replace the working project.", inputSchema: createProject,
     run: args => engine.createProject(createProject.parse(args))},
    {name: "set_tempo", description: "Set BPM (30-1000).", inputSchema: setTempo,
     run: args => engine.setTempo(setTempo.parse(args).bpm)},
    {name: "set_time_signature", description: "Set time signature.", inputSchema: setTimeSignature,
     run: args => { const value = setTimeSignature.parse(args); return engine.setTimeSignature(value.numerator, value.denominator) }},
    {name: "add_instrument_track", description: "Add an instrument track (instrument from opendaw://catalog). Returns trackId.",
     inputSchema: addInstrumentTrack,
     run: args => engine.addInstrumentTrack(addInstrumentTrack.parse(args))},
    {name: "add_note_region", description: "Add a MIDI region to a track. Position/duration are PPQN ints or '1bar'/'1/8'. Returns regionId.",
     inputSchema: addNoteRegion, run: args => engine.addNoteRegion(addNoteRegion.parse(args))},
    {name: "add_notes", description: "Add notes to a region. pitch is MIDI int or note name like 'C4'.",
     inputSchema: addNotes, run: args => engine.addNotes(addNotes.parse(args))},
    {name: "set_track_mix", description: "Set volume (dB), panning (-1..1), mute, solo on a track/aux/group.",
     inputSchema: setTrackMix, run: args => engine.setTrackMix(setTrackMix.parse(args))},
    {name: "add_aux", description: "Add an aux (send/effect) bus. Returns auxId.", inputSchema: addAux,
     run: args => engine.addAux(addAux.parse(args))},
    {name: "add_group", description: "Add a group bus. Returns groupId.", inputSchema: addGroup,
     run: args => engine.addGroup(addGroup.parse(args))},
    {name: "add_send", description: "Send audio from a track to an aux/group (amount in dB).", inputSchema: addSend,
     run: args => engine.addSend(addSend.parse(args))},
    {name: "add_audio_effect", description: "Add an audio effect (currently 'delay') to a track/aux. params are numbers (e.g. {wet:0.6}).",
     inputSchema: addAudioEffect,
     run: args => { const value = addAudioEffect.parse(args)
       return engine.addAudioEffect({trackId: value.trackId, type: value.type, params: value.params as Partial<AudioEffects["delay"]>}) }},
    {name: "add_midi_effect", description: "Add a MIDI effect ('pitch') to a track. params are numbers (octaves, semiTones, cents).",
     inputSchema: addMidiEffect,
     run: args => { const value = addMidiEffect.parse(args)
       return engine.addMidiEffect({trackId: value.trackId, type: value.type, params: value.params as Partial<MIDIEffects["pitch"]>}) }},
    {name: "add_automation", description: "Automate a track's volume or panning over time. points: [{position (PPQN or '1bar'/'1/8'), value 0..1, interpolation? 'linear'|'step'}].",
     inputSchema: addAutomation, run: args => engine.addAutomation(addAutomation.parse(args))},
    {name: "get_project_info", description: "Summarize the working project (name, bpm, tracks).", inputSchema: empty,
     run: () => engine.getProjectInfo()},
    {name: "export_project", description: "Write the project to a .od file. Returns {path, bytes}.", inputSchema: exportProject,
     run: args => engine.exportToFile(exportProject.parse(args).path)},
    {name: "open_in_studio", description: "Push the current project to a running openDAW studio connected via the live bridge (requires the server started with --bridge). Returns how many studios received it.",
     inputSchema: empty,
     run: () => {
       if (bridge === undefined) return {ok: false, message: "Live bridge is not enabled. Start the server with --bridge."}
       const clients = bridge.push(engine.export(), engine.getProjectInfo().name)
       return {ok: clients > 0, clients, message: clients > 0 ? `Opened in ${clients} studio(s)` : "No studio connected to the bridge yet"}
     }}
  ]
}
