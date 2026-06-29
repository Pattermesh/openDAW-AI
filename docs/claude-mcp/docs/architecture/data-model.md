# openDAW Data Model — the Box Graph

openDAW represents an entire project as a **graph of "boxes"**. The high-level scripting
`Api` (see [control-surface.md](control-surface.md)) is the ergonomic front door; underneath,
everything resolves to boxes and pointers. The MCP can mostly stay at the `Api` layer, but
understanding boxes matters for advanced edits and for reading project state back out.

## What is a box?
- The atomic unit of the model — a track, region, device, note, parameter, etc.
- Identified by a **UUID** (`UUID.Bytes`); fields addressed via `Address` (UUID + field keys).
- **Transactional**: all mutations happen inside `editing.modify(() => …)`.
- **Serializable**: every box field knows how to read/write itself to binary.
- Compiled from schemas by **BoxForge** (`packages/lib/box-forge`, `packages/studio/forge-boxes`).

Core files:
- `packages/lib/box/src/box.ts`, `address.ts`, `graph.ts`, `editing.ts`, `pointer.ts`, `field.ts`, `serializer.ts`
- Schemas: `packages/studio/forge-boxes/src/schema/...`
- Read `docs/graph.md` in the openDAW repo for transaction/cascade semantics.

## Project graph
`BoxGraph<BoxIO.TypeMap>` rooted at **RootBox**:
- `timeline → TimelineBox` (tempo-track, signature-track, marker-track, `durationInPulses`, `bpm`)
- `audio-units → AudioUnitBox[]`
- `audio-busses → AudioBusBox[]`
- `output-device → AudioUnitBox` (output type)
- `groove → GrooveShuffleBox`

## Key entities (selected fields)
- **TrackBox**: `tracks`(→collection), `target`(→automation/device), `regions`, `clips`,
  `index`, `type` (0 Master, 1 Audio, 2 Notes, 3 Aux), `enabled`.
- **NoteRegionBox**: `regions`, `events`(→NoteEventCollection), `position`(PPQN), `duration`(PPQN),
  `mute`, `label`, `hue`.
- **AudioRegionBox**: `regions`, `file`(→AudioFile), `events`(automation), `waveform-offset`,
  `play-mode`, `position`, `duration`, `gain`(dB), `fading{in,out,in-slope,out-slope}`, …
- **NoteEventBox** (a MIDI note): `position`(PPQN), `duration`(PPQN, default SemiQuaver),
  `pitch`(0–127), `velocity`(0–1), `play-count`, `play-curve`, `cent`(−50..50), `chance`(0–100).
- **AudioUnitBox**: `type` (instrument|bus|aux|output), `volume`(dB), `panning`(bipolar),
  `mute`, `solo`, `tracks`, `midi-effects`, `input` (instrument/output, exclusive),
  `audio-effects`, `aux-sends`, `output`(→AudioOutput), `capture`.
- **Devices** (via `DeviceFactory`): instruments — `VaporisateurDeviceBox`, `SoundfontDeviceBox`,
  `TapeDeviceBox`, `PlayfieldDeviceBox`, `ApparatDeviceBox`; effects — `ReverbDeviceBox`,
  `DelayDeviceBox`, `CompressorDeviceBox`, `GateDeviceBox`, `WaveshaperDeviceBox`, …
- **Collections**: `NoteEventCollectionBox`, `ValueEventCollectionBox` aggregate child items and
  hold back-references; marked `shared` so UUIDs remap on copy.
- **ValueEventBox** (automation point): `position`(PPQN), `index`, `interpolation` (0 step, 1 linear), `value`.

## Pointers (the edges)
- **Pointer field** (`type:"pointer"`): mandatory edge; deletion cascades. Has a `pointerType`
  from the `Pointers` enum (`packages/studio/enums/src/Pointers.ts`, ~50 types:
  `TrackCollection`, `RegionCollection`, `NoteEventCollection`, `AudioUnit`, `Device`,
  `InstrumentHost`, `AudioEffectHost`, `MIDIEffectHost`, …).
- **Field with `pointerRules`**: a slot that *accepts* incoming pointers (collections/hosts).
- **ParameterPointerRules** on numeric fields enable automation lanes for any parameter.

## Serialization
Binary. `ProjectSkeleton.encode/decode`
(`packages/studio/adapters/src/project/ProjectSkeleton.ts`):
magic `OPEN` (0x4F50454E) + format version `2` + length-prefixed box-graph chunk.
Each box: magic `FLDS` + per-field length-prefixed blobs.

## Editing model
```ts
editing.modify(() => {
  const track = TrackBox.create(boxGraph, uuid, box => {
    box.tracks.refer(trackCollection); box.target.refer(audioUnit)
  })
  NoteRegionBox.create(boxGraph, uuid, r => { r.regions.refer(track.regions); r.events.refer(coll) })
})            // pointer notifications fire in order on commit
editing.undo(); editing.redo()
```
Adapters (`packages/studio/adapters`, e.g. `TrackBoxAdapter`, `AudioUnitFactory`) wrap boxes with
observable, UI-friendly views.

## Mental model: a synth track playing MIDI notes
1. **AudioUnitBox** (type instrument) → `collection.refer(root.audioUnits)`, `output.refer(bus.input)`.
2. Attach a device, e.g. **SoundfontDeviceBox** → `host.refer(audioUnit.input)`.
3. **TrackBox** (type Notes) → `tracks.refer(collection)`, `target.refer(audioUnit)`.
4. **NoteRegionBox** → `regions.refer(track.regions)`, `events.refer(noteEventCollection)`, set position/duration.
5. **NoteEventBox** per note → `events.refer(collection.events)`, set pitch/velocity/duration/position.
6. All inside one `editing.modify()` transaction.

**Implication for the MCP:** prefer the high-level `Api` (it does this wiring for us). Drop to boxes
only for reads or operations the `Api` doesn't cover.
