# claude-opendaw MCP (Phase A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A model-agnostic, stdio MCP server that lets an LLM build openDAW projects (instruments, MIDI, mix, routing) and export a `.od` file, fully unit-tested in Node.

**Architecture:** A backend-agnostic **Engine** wraps openDAW's `@opendaw/studio-scripting` `ApiImpl` (pure, headless) and a friendly **IdRegistry**. An **MCP server** layer exposes Engine operations as zod-validated tools over stdio. Serialization uses `ProjectConverter.toSkeleton(project)` → `ProjectSkeleton.encode(boxGraph)`. The same Engine will later back the A2 live bridge.

**Tech Stack:** TypeScript (ESM), `@modelcontextprotocol/sdk`, `zod`, vitest, openDAW workspace packages (`@opendaw/studio-scripting`, `@opendaw/studio-adapters`, `@opendaw/lib-dsp`, `@opendaw/lib-std`). Repo uses npm workspaces + tsc. Built in the fork at `~/Desktop/opendaw`.

**Conventions:** Follow the fork `CLAUDE.md` — `@opendaw/lib-std` types, no `as any`, no `try/catch` (use `tryCatch`), compact methods. Use `Edit` for existing files, `Write` only for new files.

**Verified facts (current checkout `289ca78c`):**
- `ApiImpl` ctor: `new ApiImpl(protocol: ScriptHostProtocol)`. `newProject(name?)` → `new ProjectImpl(this, name)` — pure, no protocol use.
- `ScriptHostProtocol` = `{ openProject(buffer, name?): void; fetchProject(): Promise<{buffer,name}>; addSample(data,name): Promise<Sample> }`.
- Builder: `project.addInstrumentUnit("Vaporisateur").addNoteTrack().addRegion({duration, loopDuration?}).addEvents([{position, pitch, duration?, velocity?}])`. `project.bpm`, `project.timeSignature = {numerator, denominator}`, `project.output.volume`. `addAuxUnit(props?)`, `addGroupUnit(props?)`.
- `ProjectConverter.toSkeleton(project: ProjectImpl): ProjectSkeleton` — NOT exported by `scripting/src/index.ts` (Task 1 fixes). Validates NaN + overlapping regions.
- `ProjectSkeleton` (from `@opendaw/studio-adapters`) has `.empty(...)`, `.encode(boxGraph)`, `.decode(buffer)`; skeleton exposes `.boxGraph`.
- Instruments: `Vaporisateur | Playfield | Nano | Soundfont | Tape | MIDIOutput`. Time in PPQN (`@opendaw/lib-dsp` `PPQN.Bar/Quarter/Eighth/SemiQuaver`). Pitch 0–127.

---

## File Structure

```
packages/integrations/claude-mcp/
  package.json                 — pkg manifest, deps, scripts
  tsconfig.json                — extends @opendaw/typescript-config
  src/
    headless.ts                — makeApi(): ApiImpl with a no-op/throwing protocol stub
    serialize.ts               — toBytes(project) / fromBytes(buffer) via ProjectConverter+ProjectSkeleton
    ids.ts                     — IdRegistry (friendly id <-> object)
    time.ts                    — parsePPQN("1/8"|"2bar"|number), parsePitch("C4"|60)
    engine.ts                  — Engine: backend-agnostic ops over a live ProjectImpl + IdRegistry
    catalog.ts                 — instrument/effect catalog (names, params) for resources
    tools.ts                   — zod schemas + tool defs mapping to Engine methods
    server.ts                  — MCP stdio server wiring tools/resources/prompts
    index.ts                   — entry: start server
  test/
    serialize.test.ts
    engine.test.ts
    time.test.ts
    tools.test.ts
  README.md                    — usage + Claude config
  .mcp.json.example            — Claude Code / Desktop config snippet
docs/                          — (in fork) any contributed docs
```

One-line modification in the fork: `packages/studio/scripting/src/index.ts` (export ProjectConverter).

---

## Task 0: Scaffold package + green sanity test

**Files:**
- Create: `packages/integrations/claude-mcp/package.json`, `tsconfig.json`, `src/index.ts`, `test/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@opendaw/claude-mcp",
  "version": "0.0.1",
  "license": "AGPL-3.0-or-later",
  "type": "module",
  "private": true,
  "bin": { "claude-opendaw-mcp": "./dist/index.js" },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "npx tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"**/*.ts\""
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@opendaw/lib-dsp": "^0.0.84",
    "@opendaw/lib-std": "^0.0.78",
    "@opendaw/studio-adapters": "^0.0.114",
    "@opendaw/studio-scripting": "^0.0.67",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@opendaw/typescript-config": "^0.0.32",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "@opendaw/typescript-config/tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "moduleResolution": "Bundler", "module": "ESNext", "target": "ES2022" },
  "include": ["src"]
}
```
If `extends` path errors, inspect a sibling package's `tsconfig.json` (e.g. `packages/lib/box/tsconfig.json`) and copy its `extends`/options exactly.

- [ ] **Step 3: Create `src/index.ts` placeholder**

```ts
export const VERSION = "0.0.1"
```

- [ ] **Step 4: Create `test/sanity.test.ts`**

```ts
import {describe, expect, it} from "vitest"
import {VERSION} from "../src/index"

describe("sanity", () => {
  it("exports a version", () => { expect(VERSION).toBe("0.0.1") })
})
```

- [ ] **Step 5: Install workspace deps**

Run (repo root): `cd ~/Desktop/opendaw && npm install`
Expected: installs `@modelcontextprotocol/sdk`, `zod`, `tsx`; links workspace `@opendaw/*`. If the MCP SDK version errors, run `npm view @modelcontextprotocol/sdk version` and pin the latest `^` major.

- [ ] **Step 6: Run sanity test**

Run: `cd ~/Desktop/opendaw && npx vitest run packages/integrations/claude-mcp`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/opendaw && git checkout -b feat/claude-mcp
git add packages/integrations/claude-mcp package-lock.json
git commit -m "feat(claude-mcp): scaffold package + sanity test"
```

---

## Task 1: Export ProjectConverter + headless serialize (the linchpin)

**Files:**
- Modify: `packages/studio/scripting/src/index.ts` (add export)
- Create: `packages/integrations/claude-mcp/src/headless.ts`, `src/serialize.ts`, `test/serialize.test.ts`

- [ ] **Step 1: Write the failing test** (`test/serialize.test.ts`)

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Desktop/opendaw && npx vitest run packages/integrations/claude-mcp/test/serialize.test.ts`
Expected: FAIL — cannot find `../src/headless`.

- [ ] **Step 3: Export ProjectConverter from scripting** — Edit `packages/studio/scripting/src/index.ts`, add after the existing exports:

```ts
export * from "./ProjectConverter"
```

- [ ] **Step 4: Create `src/headless.ts`**

```ts
import {panic} from "@opendaw/lib-std"
import {ApiImpl, ScriptHostProtocol} from "@opendaw/studio-scripting"

const headlessProtocol: ScriptHostProtocol = {
  openProject: () => panic("openProject is unavailable in headless mode"),
  fetchProject: () => panic("fetchProject is unavailable in headless mode"),
  addSample: () => panic("addSample is unavailable in headless mode (no samples in v1)")
}

export const makeApi = (): ApiImpl => new ApiImpl(headlessProtocol)
```
If `panic` is not exported by `@opendaw/lib-std`, use `throw new Error(...)` only here (boundary stub) — verify with `grep -r "export const panic" ~/Desktop/opendaw/packages/lib/std/src`.

- [ ] **Step 5: Create `src/serialize.ts`**

```ts
import {ProjectImpl, ProjectConverter} from "@opendaw/studio-scripting"
import {ProjectSkeleton} from "@opendaw/studio-adapters"

export const toBytes = (project: ProjectImpl): ArrayBuffer => {
  const skeleton = ProjectConverter.toSkeleton(project)
  return ProjectSkeleton.encode(skeleton.boxGraph)
}

export const fromBytes = (buffer: ArrayBufferLike): ProjectSkeleton => ProjectSkeleton.decode(buffer)
```
Verify `ProjectSkeleton.encode`/`decode` signatures: `grep -n "encode\|decode" ~/Desktop/opendaw/packages/studio/adapters/src/project/ProjectSkeleton.ts`. Adjust call/return to match (e.g. if `decode` returns `{boxGraph, mandatoryBoxes}`).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/integrations/claude-mcp/test/serialize.test.ts`
Expected: PASS. If `toSkeleton` throws on an empty project (needs ≥1 audio unit), add one instrument first inside the test and re-run; note the constraint in `engine.ts` later.

- [ ] **Step 7: Commit**

```bash
git add packages/studio/scripting/src/index.ts packages/integrations/claude-mcp
git commit -m "feat(claude-mcp): headless api + project serialization (export ProjectConverter)"
```

---

## Task 2: time + pitch helpers

**Files:** Create `src/time.ts`, `test/time.test.ts`

- [ ] **Step 1: Failing test** (`test/time.test.ts`)

```ts
import {describe, expect, it} from "vitest"
import {PPQN} from "@opendaw/lib-dsp"
import {parsePPQN, parsePitch} from "../src/time"

describe("time", () => {
  it("parses musical durations to PPQN", () => {
    expect(parsePPQN("1bar")).toBe(PPQN.Bar)
    expect(parsePPQN("1/8")).toBe(PPQN.Bar / 8)
    expect(parsePPQN(480)).toBe(480)
  })
  it("parses note names to MIDI pitch", () => {
    expect(parsePitch("C4")).toBe(60)
    expect(parsePitch(72)).toBe(72)
  })
})
```

- [ ] **Step 2: Verify fail** — Run: `npx vitest run packages/integrations/claude-mcp/test/time.test.ts` → FAIL (no `../src/time`).

- [ ] **Step 3: Implement `src/time.ts`**

```ts
import {PPQN} from "@opendaw/lib-dsp"

export const parsePPQN = (value: number | string): number => {
  if (typeof value === "number") return value
  const text = value.trim().toLowerCase()
  const bars = text.match(/^(\d+(?:\.\d+)?)\s*bar(?:s)?$/)
  if (bars !== null) return Math.round(PPQN.Bar * parseFloat(bars[1]))
  const frac = text.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac !== null) return Math.round(PPQN.Bar * (parseInt(frac[1]) / parseInt(frac[2])))
  const num = Number(text)
  if (!Number.isNaN(num)) return num
  throw new Error(`Cannot parse PPQN from "${value}"`)
}

const NOTE_INDEX: Record<string, number> = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11}

export const parsePitch = (value: number | string): number => {
  if (typeof value === "number") return value
  const match = value.trim().toLowerCase().match(/^([a-g])(#|b)?(-?\d+)$/)
  if (match === null) throw new Error(`Cannot parse pitch from "${value}"`)
  const [, letter, accidental, octave] = match
  const semis = NOTE_INDEX[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0)
  return (parseInt(octave) + 1) * 12 + semis
}
```

- [ ] **Step 4: Verify pass** — Run the test → PASS. (If `PPQN.Bar` differs so `C4`≠60, adjust the `+1` octave offset to match openDAW's convention; check `grep -rn "middle" ~/Desktop/opendaw/packages/lib/dsp/src`.)

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/claude-mcp/src/time.ts packages/integrations/claude-mcp/test/time.test.ts
git commit -m "feat(claude-mcp): PPQN + pitch parsing helpers"
```

---

## Task 3: IdRegistry

**Files:** Create `src/ids.ts` (covered via engine tests; add a focused test too)

- [ ] **Step 1: Failing test** — add `test/ids.test.ts`

```ts
import {describe, expect, it} from "vitest"
import {IdRegistry} from "../src/ids"

describe("IdRegistry", () => {
  it("assigns prefixed ids and resolves them", () => {
    const reg = new IdRegistry()
    const id = reg.add("track", {name: "x"})
    expect(id).toBe("track_1")
    expect(reg.get<{name: string}>(id).name).toBe("x")
    expect(reg.add("track", {})).toBe("track_2")
  })
  it("throws on unknown id", () => {
    expect(() => new IdRegistry().get("track_9")).toThrow()
  })
})
```

- [ ] **Step 2: Verify fail** → FAIL (no `../src/ids`).

- [ ] **Step 3: Implement `src/ids.ts`**

```ts
export class IdRegistry {
  readonly #items = new Map<string, unknown>()
  readonly #counters = new Map<string, number>()
  add(prefix: string, value: unknown): string {
    const next = (this.#counters.get(prefix) ?? 0) + 1
    this.#counters.set(prefix, next)
    const id = `${prefix}_${next}`
    this.#items.set(id, value)
    return id
  }
  get<T>(id: string): T {
    const value = this.#items.get(id)
    if (value === undefined) throw new Error(`Unknown id: ${id}`)
    return value as T
  }
  clear(): void { this.#items.clear(); this.#counters.clear() }
}
```
(`as T` here is a generic-container idiom at the registry boundary; acceptable for this internal util.)

- [ ] **Step 4: Verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(claude-mcp): IdRegistry"`

---

## Task 4: Engine — core build ops (the heart)

**Files:** Create `src/engine.ts`, `test/engine.test.ts`

- [ ] **Step 1: Failing test** (`test/engine.test.ts`)

```ts
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
})
```

- [ ] **Step 2: Verify fail** → FAIL (no `../src/engine`).

- [ ] **Step 3: Implement `src/engine.ts`**

```ts
import {makeApi} from "./headless"
import {toBytes} from "./serialize"
import {parsePPQN, parsePitch} from "./time"
import {IdRegistry} from "./ids"
import {ApiImpl, InstrumentAudioUnit, NoteRegion, NoteTrack, Project} from "@opendaw/studio-scripting"

export type Instrument = "Vaporisateur" | "Playfield" | "Nano" | "Soundfont" | "Tape" | "MIDIOutput"
type TrackEntry = {unit: InstrumentAudioUnit, track: NoteTrack, name: string, instrument: Instrument}

export class Engine {
  #api: ApiImpl = makeApi()
  #project: Project = this.#api.newProject("Untitled")
  #ids = new IdRegistry()
  #tracks: Array<{id: string, name: string, instrument: Instrument, regions: number}> = []

  createProject(input: {name: string, bpm?: number, timeSignature?: {numerator: number, denominator: number}}): {ok: true} {
    this.#api = makeApi()
    this.#project = this.#api.newProject(input.name)
    this.#ids.clear()
    this.#tracks = []
    if (input.bpm !== undefined) this.#project.bpm = input.bpm
    if (input.timeSignature !== undefined) this.#project.timeSignature = input.timeSignature
    return {ok: true}
  }
  setTempo(bpm: number): {ok: true} { this.#project.bpm = bpm; return {ok: true} }
  setTimeSignature(numerator: number, denominator: number): {ok: true} {
    this.#project.timeSignature = {numerator, denominator}; return {ok: true}
  }
  addInstrumentTrack(input: {instrument: Instrument, name?: string}): {trackId: string} {
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
    const summary = this.#tracks.find(track => track.id === input.trackId)
    if (summary !== undefined) summary.regions++
    return {regionId: this.#ids.add("region", region)}
  }
  addNotes(input: {regionId: string, notes: Array<{position: number | string, pitch: number | string, duration?: number | string, velocity?: number}>}): {count: number} {
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
  getProjectInfo(): {name: string, bpm: number, timeSignature: {numerator: number, denominator: number}, tracks: ReadonlyArray<{id: string, name: string, instrument: Instrument, regions: number}>} {
    return {name: this.#project.name, bpm: this.#project.bpm, timeSignature: this.#project.timeSignature, tracks: this.#tracks}
  }
  export(): ArrayBuffer { return toBytes(this.#project as never) }
}
```
Notes for the implementer:
- Verify exact type names exported (`InstrumentAudioUnit`, `NoteTrack`, `NoteRegion`, `Project`) via `grep -n "export" ~/Desktop/opendaw/packages/studio/scripting/src/Api.ts`. Adjust imports to the real names; do not invent.
- `toBytes` takes a `ProjectImpl`. `Project` (interface) is the same instance; if the type complains, import `ProjectImpl` and type `#project` as `ProjectImpl` (it's what `newProject` returns at runtime). Prefer the precise type over `as never` — replace the cast once verified.
- `addRegion`/`addEvents` field names (`position`, `duration`, `velocity`, `loopDuration`) confirmed from `simple.ts` + Api; verify optional fields in `Api.ts` and drop any the type rejects.

- [ ] **Step 4: Verify pass** → Run the engine test → PASS. Fix type names per the notes until green.
- [ ] **Step 5: Commit** — `git commit -am "feat(claude-mcp): Engine core ops (project/track/region/notes/export)"`

---

## Task 5: Engine — mix, routing, effects (Wave 2)

**Files:** Modify `src/engine.ts`; add cases to `test/engine.test.ts`

- [ ] **Step 1: Failing test** — append:

```ts
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
```

- [ ] **Step 2: Verify fail** → FAIL (methods undefined).

- [ ] **Step 3: Inspect the real Api surface first**

Run: `grep -nE "addAudioEffect|addMIDIEffect|addSend|addAuxUnit|addGroupUnit|volume|panning|mute|solo|AudioEffects|MIDIEffects" ~/Desktop/opendaw/packages/studio/scripting/src/Api.ts`
Read the returned signatures. Implement the methods below to match EXACTLY (names/enums from `Api.ts` — adjust if they differ).

- [ ] **Step 4: Implement** — add to `Engine` (store aux/group/effect objects in IdRegistry, mirror Task 4 patterns):

```ts
setTrackMix(input: {trackId: string, volume?: number, panning?: number, mute?: boolean, solo?: boolean}): {ok: true} {
  const {unit} = this.#ids.get<{unit: InstrumentAudioUnit}>(input.trackId)
  if (input.volume !== undefined) unit.volume = input.volume
  if (input.panning !== undefined) unit.panning = input.panning
  if (input.mute !== undefined) unit.mute = input.mute
  if (input.solo !== undefined) unit.solo = input.solo
  return {ok: true}
}
addAux(input: {name?: string}): {auxId: string} {
  const aux = this.#project.addAuxUnit(input.name === undefined ? undefined : {label: input.name})
  return {auxId: this.#ids.add("aux", aux)}
}
addGroup(input: {name?: string}): {groupId: string} {
  const group = this.#project.addGroupUnit(input.name === undefined ? undefined : {label: input.name})
  return {groupId: this.#ids.add("group", group)}
}
addSend(input: {fromTrackId: string, toId: string, amount: number, mode?: "pre" | "post"}): {ok: true} {
  const {unit} = this.#ids.get<{unit: InstrumentAudioUnit}>(input.fromTrackId)
  const target = this.#ids.get(input.toId)
  unit.addSend(target as never, {amount: input.amount, mode: input.mode ?? "post"})
  return {ok: true}
}
addAudioEffect(input: {trackId: string, type: string, params?: Record<string, unknown>}): {ok: true} {
  const {unit} = this.#ids.get<{unit: InstrumentAudioUnit}>(input.trackId)
  unit.addAudioEffect(input.type as never, input.params as never)
  return {ok: true}
}
```
Replace each `as never` with the real parameter type from `Api.ts` (e.g. `keyof AudioEffects`) once read — the cast is a placeholder to keep the step runnable, not the final code. `addSend` target type: read `Api.ts` `addSend(target: ...)` and type accordingly. If aux objects aren't valid `setTrackMix` targets (different impl), add an overload that resolves any unit type via a shared `resolveUnit(id)` helper.

- [ ] **Step 5: Verify pass** → PASS. Remove all `as never`; `npm run typecheck` (`tsc --noEmit`) must be clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(claude-mcp): mix, aux/group, send, audio effect ops"`

---

## Task 6: export to .od file

**Files:** Modify `src/engine.ts` (add `exportToFile`); add `test/export-file.test.ts`

- [ ] **Step 1: Failing test** (`test/export-file.test.ts`)

```ts
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
    expect(fromBytes(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)).boxGraph).toBeDefined()
  })
})
```

- [ ] **Step 2: Verify fail** → FAIL (`exportToFile` undefined).
- [ ] **Step 3: Implement** — add to `Engine`:

```ts
exportToFile(path: string): {path: string, bytes: number} {
  const data = new Uint8Array(this.export())
  writeFileSync(path, data)
  return {path, bytes: data.byteLength}
}
```
Add `import {writeFileSync} from "node:fs"` at the top of `engine.ts`.

- [ ] **Step 4: Verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(claude-mcp): export project to .od file"`

---

## Task 7: catalog (for resources)

**Files:** Create `src/catalog.ts`, `test/catalog.test.ts`

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from "vitest"
import {CATALOG} from "../src/catalog"

describe("catalog", () => {
  it("lists the 6 instruments", () => {
    expect(CATALOG.instruments.map(i => i.name)).toContain("Vaporisateur")
    expect(CATALOG.instruments).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Verify fail** → FAIL.
- [ ] **Step 3: Implement `src/catalog.ts`**

```ts
export const CATALOG = {
  instruments: [
    {name: "Vaporisateur", kind: "synth", description: "Subtractive synth (filters, LFO, unison, envelope)"},
    {name: "Playfield", kind: "sampler", description: "Sample-based MIDI playback"},
    {name: "Nano", kind: "synth", description: "Minimal synth / single sample"},
    {name: "Soundfont", kind: "sampler", description: "SoundFont (.sf2) player"},
    {name: "Tape", kind: "audio", description: "Sample-based audio playback"},
    {name: "MIDIOutput", kind: "midi", description: "External hardware MIDI out"}
  ],
  audioEffects: [{name: "delay", description: "Delay/echo with feedback + filter"}],
  midiEffects: [{name: "pitch", description: "Transpose by octaves/semitones/cents"}]
} as const
```
Cross-check effect names against `grep -n "AudioEffects\|MIDIEffects" ~/Desktop/opendaw/packages/studio/scripting/src/Api.ts` and extend the lists to all available.

- [ ] **Step 4: Verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(claude-mcp): device catalog"`

---

## Task 8: tools layer (zod schemas → Engine)

**Files:** Create `src/tools.ts`, `test/tools.test.ts`

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from "vitest"
import {Engine} from "../src/engine"
import {makeTools} from "../src/tools"

describe("tools", () => {
  it("exposes named tools that drive the engine", async () => {
    const tools = makeTools(new Engine())
    const names = tools.map(tool => tool.name)
    expect(names).toContain("create_project")
    expect(names).toContain("add_instrument_track")
    const create = tools.find(tool => tool.name === "create_project")!
    const result = await create.handler({name: "T", bpm: 100})
    expect(result.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Verify fail** → FAIL.
- [ ] **Step 3: Implement `src/tools.ts`** (each tool = `{name, description, schema (zod), handler}`)

```ts
import {z} from "zod"
import {Engine, Instrument} from "./engine"

export type Tool = {name: string, description: string, schema: z.ZodTypeAny, handler: (args: any) => unknown}

const INSTRUMENTS = ["Vaporisateur", "Playfield", "Nano", "Soundfont", "Tape", "MIDIOutput"] as const
const time = z.union([z.number(), z.string()])

export const makeTools = (engine: Engine): ReadonlyArray<Tool> => [
  {name: "create_project", description: "Create/replace the working project.",
   schema: z.object({name: z.string(), bpm: z.number().optional(),
     timeSignature: z.object({numerator: z.number(), denominator: z.number()}).optional()}),
   handler: args => engine.createProject(args)},
  {name: "set_tempo", description: "Set BPM.", schema: z.object({bpm: z.number()}),
   handler: args => engine.setTempo(args.bpm)},
  {name: "set_time_signature", description: "Set time signature.",
   schema: z.object({numerator: z.number(), denominator: z.number()}),
   handler: args => engine.setTimeSignature(args.numerator, args.denominator)},
  {name: "add_instrument_track", description: "Add an instrument track. instrument ∈ catalog.",
   schema: z.object({instrument: z.enum(INSTRUMENTS), name: z.string().optional()}),
   handler: args => engine.addInstrumentTrack(args as {instrument: Instrument, name?: string})},
  {name: "add_note_region", description: "Add a MIDI region to a track (PPQN or '1bar'/'1/8').",
   schema: z.object({trackId: z.string(), position: time, duration: time, label: z.string().optional()}),
   handler: args => engine.addNoteRegion(args)},
  {name: "add_notes", description: "Add notes to a region. pitch as MIDI int or 'C4'.",
   schema: z.object({regionId: z.string(), notes: z.array(z.object({
     position: time, pitch: z.union([z.number(), z.string()]), duration: time.optional(), velocity: z.number().optional()}))}),
   handler: args => engine.addNotes(args)},
  {name: "set_track_mix", description: "Set volume(dB)/panning(-1..1)/mute/solo.",
   schema: z.object({trackId: z.string(), volume: z.number().optional(), panning: z.number().optional(),
     mute: z.boolean().optional(), solo: z.boolean().optional()}),
   handler: args => engine.setTrackMix(args)},
  {name: "add_aux", description: "Add an aux (send) bus.", schema: z.object({name: z.string().optional()}),
   handler: args => engine.addAux(args)},
  {name: "add_group", description: "Add a group bus.", schema: z.object({name: z.string().optional()}),
   handler: args => engine.addGroup(args)},
  {name: "add_send", description: "Send from a track to an aux/group.",
   schema: z.object({fromTrackId: z.string(), toId: z.string(), amount: z.number(), mode: z.enum(["pre", "post"]).optional()}),
   handler: args => engine.addSend(args)},
  {name: "add_audio_effect", description: "Add an audio effect to a track/aux. type ∈ catalog.",
   schema: z.object({trackId: z.string(), type: z.string(), params: z.record(z.unknown()).optional()}),
   handler: args => engine.addAudioEffect(args)},
  {name: "get_project_info", description: "Summarize the working project.", schema: z.object({}),
   handler: () => engine.getProjectInfo()},
  {name: "export_project", description: "Write the project to a .od file. Returns path + bytes.",
   schema: z.object({path: z.string()}), handler: args => engine.exportToFile(args.path)}
]
```
(`args: any` in the `Tool` handler type is the validated-output boundary; zod has already parsed it. This is acceptable at the schema/runtime seam. The repo's `no as any` rule targets type-suppression in domain code — keep domain code in `engine.ts` strict.)

- [ ] **Step 4: Verify pass** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(claude-mcp): zod tool definitions over engine"`

---

## Task 9: MCP stdio server + resources + prompt

**Files:** Create `src/server.ts`; modify `src/index.ts`

- [ ] **Step 1: Read the MCP SDK API shape**

Run: `ls ~/Desktop/opendaw/node_modules/@modelcontextprotocol/sdk/dist/esm/server/` and open `mcp.js`/`index.js` `.d.ts` to confirm `McpServer`, `registerTool`/`tool`, `registerResource`, `registerPrompt`, and `StdioServerTransport` import paths for the installed version.

- [ ] **Step 2: Implement `src/server.ts`** (adapt names to the installed SDK version found in Step 1)

```ts
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {z} from "zod"
import {Engine} from "./engine"
import {makeTools} from "./tools"
import {CATALOG} from "./catalog"

export const createServer = (): McpServer => {
  const engine = new Engine()
  const server = new McpServer({name: "claude-opendaw", version: "0.0.1"})
  for (const tool of makeTools(engine)) {
    server.registerTool(tool.name,
      {description: tool.description, inputSchema: (tool.schema as z.ZodObject<any>).shape},
      async (args: unknown) => {
        const result = tool.handler(tool.schema.parse(args))
        return {content: [{type: "text", text: JSON.stringify(result)}]}
      })
  }
  server.registerResource("catalog", "opendaw://catalog", {description: "openDAW instruments & effects"},
    async uri => ({contents: [{uri: uri.href, mimeType: "application/json", text: JSON.stringify(CATALOG, null, 2)}]}))
  server.registerResource("guide", "opendaw://guide", {description: "How to make music in openDAW"},
    async uri => ({contents: [{uri: uri.href, mimeType: "text/markdown", text: GUIDE}]}))
  server.registerPrompt("compose", {description: "Plan a piece, then call tools to build it.",
    argsSchema: {style: z.string(), bars: z.string(), key: z.string().optional(), bpm: z.string().optional()}},
    ({style, bars, key, bpm}) => ({messages: [{role: "user", content: {type: "text",
      text: `Compose a ${style} piece, ${bars} bars${key ? `, key ${key}` : ""}${bpm ? `, ${bpm} BPM` : ""}. `
        + `First call create_project, then add_instrument_track, add_note_region and add_notes (positions in PPQN; PPQN.Bar=quarter*4). `
        + `Use get_project_info to check, then export_project. Read opendaw://catalog and opendaw://guide first.`}}]}))
  return server
}

const GUIDE = `# Making music in openDAW via MCP
- Time is in PPQN. Use '1bar', '1/8', '1/16' strings or raw ints. A bar = 4 quarter notes.
- Pitch is MIDI 0-127 or names like 'C4' (=60).
- Flow: create_project -> add_instrument_track -> add_note_region(trackId,...) -> add_notes(regionId,...) -> export_project.
- Mix with set_track_mix (volume dB, panning -1..1). Buses via add_aux/add_group + add_send.
- Instruments: Vaporisateur (synth), Nano, Playfield/Soundfont/Tape (samplers), MIDIOutput.`
```

- [ ] **Step 3: Implement `src/index.ts`**

```ts
#!/usr/bin/env node
import {createServer} from "./server"
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"

export const VERSION = "0.0.1"

const main = async () => {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}
if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) { void main() }
```
Keep the `sanity.test.ts` passing (`VERSION` still exported).

- [ ] **Step 4: Build + smoke test**

Run: `cd ~/Desktop/opendaw/packages/integrations/claude-mcp && npm run build 2>&1 | tail -20`
Expected: clean tsc. Then list tools over stdio:
```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js | tail -5
```
Expected: a JSON line listing `create_project`, `add_instrument_track`, …, `export_project`. If the SDK method names differ, fix per Step 1 and rebuild.

- [ ] **Step 5: Commit** — `git commit -am "feat(claude-mcp): MCP stdio server with tools, resources, compose prompt"`

---

## Task 10: end-to-end demo + Claude wiring + verify

**Files:** Create `README.md`, `.mcp.json.example`; add `test/e2e.test.ts`

- [ ] **Step 1: E2E test — build a non-trivial beat in code** (`test/e2e.test.ts`)

```ts
import {describe, expect, it} from "vitest"
import {Engine} from "../src/engine"
import {fromBytes} from "../src/serialize"

describe("e2e lo-fi beat", () => {
  it("creates drums + bass + chords and exports", () => {
    const engine = new Engine()
    engine.createProject({name: "Lo-Fi", bpm: 72})
    const bass = engine.addInstrumentTrack({instrument: "Vaporisateur", name: "Bass"})
    const bassR = engine.addNoteRegion({trackId: bass.trackId, position: 0, duration: "4bar"})
    engine.addNotes({regionId: bassR.regionId, notes: Array.from({length: 8}, (_, i) => ({position: `${i}/2`, pitch: 36 + (i % 2) * 5, duration: "1/2", velocity: 0.8}))})
    const keys = engine.addInstrumentTrack({instrument: "Nano", name: "Keys"})
    const keysR = engine.addNoteRegion({trackId: keys.trackId, position: 0, duration: "4bar"})
    engine.addNotes({regionId: keysR.regionId, notes: [{position: 0, pitch: "C4"}, {position: 0, pitch: "E4"}, {position: 0, pitch: "G4"}]})
    const info = engine.getProjectInfo()
    expect(info.tracks).toHaveLength(2)
    expect(fromBytes(engine.export()).boxGraph).toBeDefined()
  })
})
```
- [ ] **Step 2: Verify pass** → run full suite `cd ~/Desktop/opendaw && npx vitest run packages/integrations/claude-mcp` → all green.
- [ ] **Step 3: Verify the .od opens in openDAW** — generate a file (`npx tsx -e "import('./src/engine').then(async m=>{const e=new m.Engine();e.createProject({name:'Demo',bpm:72});const t=e.addInstrumentTrack({instrument:'Vaporisateur'});const r=e.addNoteRegion({trackId:t.trackId,position:0,duration:'2bar'});e.addNotes({regionId:r.regionId,notes:[{position:0,pitch:'C4',duration:'1/4'}]});console.log(e.exportToFile('/tmp/demo.od'))})"`). Then start the studio (`cd ~/Desktop/opendaw && npm run dev:studio`) and load `/tmp/demo.od`. If the studio's open dialog only accepts `.odb` bundles, document that the reliable path is the **A2 live bridge** (`openProject(buffer)`) and note it in README "Limitations"; do not block the MVP on file-open.
- [ ] **Step 4: Write `.mcp.json.example`**

```json
{
  "mcpServers": {
    "opendaw": { "command": "node", "args": ["~/Desktop/opendaw/packages/integrations/claude-mcp/dist/index.js"] }
  }
}
```
- [ ] **Step 5: Write `README.md`** — quickstart: `npm install` (root), `npm run build` (pkg), add the `.mcp.json` to Claude Desktop/Claude Code, then prompt "use the compose prompt to make a lo-fi beat and export to /tmp/lofi.od". List tools, resources, the PPQN/pitch conventions, and limitations (no samples in v1; `.od` open path).
- [ ] **Step 6: Final typecheck + commit**

```bash
cd ~/Desktop/opendaw/packages/integrations/claude-mcp && npm run typecheck && cd ~/Desktop/opendaw
git add packages/integrations/claude-mcp && git commit -m "feat(claude-mcp): e2e beat test, Claude config, README"
```

---

## Self-Review

- **Spec coverage:** project/tempo/timesig/export ✅(T1,4,6), instrument track + notes ✅(T4), mix/aux/group/send/effect ✅(T5), catalog resource ✅(T7,9), guide+compose prompt ✅(T9), stdio server ✅(T9), Claude wiring ✅(T10), vitest golden/roundtrip ✅(T1,4,6,10), headless export of `ProjectConverter` ✅(T1). Automation (`add_automation`) and `add_midi_effect` are in the spec but deferred from this A1 plan to keep the 1-day MVP tight — **noted gap**, add post-demo by mirroring Task 5 against `addValueTrack`/`addMIDIEffect` in `Api.ts`.
- **Placeholders:** `as never`/`as any` appear only as explicitly-flagged runtime-boundary casts with instructions to replace via `Api.ts`; engine domain code is strict. No TBDs.
- **Type consistency:** `Engine` method names match `tools.ts` handlers and tests; `toBytes`/`fromBytes`, `parsePPQN`/`parsePitch`, `IdRegistry.add/get/clear` consistent across tasks.
- **A2/sidebar:** out of this plan by design (separate plans once A1 demos).
