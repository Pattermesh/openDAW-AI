# openDAW Programmatic Control Surface

**Verdict: openDAW has a clean, UI-free, composable API for building projects in code.**
This is the foundation the MCP will call.

## Packages

| Package | Path | Role |
|---------|------|------|
| `@opendaw/studio-scripting` | `packages/studio/scripting` | The public scripting `Api` (primary target) |
| `@opendaw/studio-sdk` | `packages/studio/sdk` | Meta-package bundling the libs for convenience |

Key files:
- `packages/studio/scripting/src/Api.ts` — the complete public API interface
- `packages/studio/scripting/src/impl/ApiImpl.ts` — implementation
- `packages/studio/scripting/src/ScriptRunner.ts` — runs scripts in an isolated context
- `packages/studio/scripting/src/ScriptHostProtocol.ts` — host ↔ script protocol

## Worked examples (gold)

`packages/app/studio/src/ui/pages/code-editor/examples/`:
- `simple.ts` — synth + MIDI notes + open
- `retro.ts` — multi-track, effects, panning automation, routing
- `stress-test.ts` — odd time signatures, groups, MIDI-effect chains
- `nano-wavetable.ts` — generate wavetables, create samples, parameterize
- `create-sample.ts` — generate audio data, add as sample

## API shape

```ts
const project = openDAW.newProject("Retro Game")
project.bpm = 125.0                      // 30–1000
project.timeSignature = {numerator, denominator}
project.output.volume = -6.0             // master out (read-only unit)
```

### Instruments (5)
`addInstrumentUnit(name, constructor?)` where name ∈
`Vaporisateur` (subtractive synth), `Playfield` (sampler), `Nano` (minimal synth/sample),
`Soundfont` (.sf2), `MIDIOutput`, `Tape` (audio playback).

```ts
const synth = project.addInstrumentUnit("Vaporisateur")
const nano  = project.addInstrumentUnit("Nano", x => x.sample = sample)
```

### Tracks & regions
| Track | Add | Region | Content |
|-------|-----|--------|---------|
| Note/MIDI | `unit.addNoteTrack()` | `addRegion(props?)` | `addEvents([{position, pitch, duration, velocity}])` |
| Audio | `unit.addAudioTrack()` | `addRegion(sample, props)` | sample playback |
| Automation | `unit.addValueTrack(device, param)` | `addRegion()` | `addEvents([{position, value, interpolation}])` |

```ts
const region = synth.addNoteTrack().addRegion({duration: PPQN.Bar * 4})
region.addEvents([
  {position: 0, pitch: 72, duration: PPQN.Bar/8, velocity: 0.85},
  {position: PPQN.Bar/8, pitch: 74, duration: PPQN.SemiQuaver, velocity: 0.75}
])
```

### Effects, sends, routing
```ts
const delay = project.addAuxUnit({label: "Delay"})
delay.addAudioEffect("delay", {delay: 6, feedback: 0.6, wet: 0.8})
const bass = project.addInstrumentUnit("Vaporisateur")
bass.addMIDIEffect("pitch", {octaves: -2})
bass.addSend(delay, {amount: -12.0, mode: "post"})
const group = project.addGroupUnit({label: "Master Bus"}); bass.output = group
```

### Mix params (all audio units)
`volume` (dB), `panning` (bipolar −1..1), `mute`, `solo`, `enabled`.

### Samples
```ts
const sample = await openDAW.addSample(audioData, "Chirp")   // AudioData.create(rate, frames, ch)
unit.addAudioTrack().addRegion(sample, {playback: AudioPlayback.NoWarp})
```

### Transport / engine
```ts
project.engine.play(); project.engine.stop(reset?)
project.engine.setPosition(ppqn)
project.engine.startRecording(countIn?); project.engine.stopRecording()
// observables: isPlaying, isRecording, position, bpm, cpuLoad
```

### Materialize / serialize
```ts
project.openInStudio()                  // open in the UI
const buf = project.toArrayBuffer()     // binary .od
Project.load(env, arrayBuffer)          // deserialize
```

## Globals injected by `ScriptRunner`
`openDAW: Api`, `AudioData`, `AudioPlayback`, `midiToHz`, `PPQN`, `FFT`, `Chord`,
`Interpolation`, `dbToGain`, `gainToDb`, `ClassicWaveform`, `VoicingMode`, `sampleRate`.

## Data flow
```
script (TS) ─ScriptRunner.run─▶ ApiImpl.newProject ─▶ ProjectImpl (in-memory tree)
   ─project.openInStudio─▶ ProjectConverter.toSkeleton ─▶ box graph ─▶ ArrayBuffer ─▶ Studio / file
```

## Top operations for the MCP
1. `newProject(name)`  2. `addInstrumentUnit(type, ctor?)`
3. `addNoteTrack().addRegion().addEvents(notes)`  4. `addValueTrack(...).addRegion().addEvents(automation)`
5. `addAudioEffect/addMIDIEffect(type, params)`  6. `addSend(target, {amount, pan, mode})`
7. `addAuxUnit()/addGroupUnit()`  8. `volume/panning/mute/solo`
9. `addSample(data) + addAudioTrack().addRegion(sample)`  10. `engine.play/stop/setPosition` + `openInStudio`
