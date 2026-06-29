# Code Walkthrough — claude-opendaw (for review)

A verbose, human-readable explanation of **how the code works, why each data structure and algorithm
was chosen, and how it bolts onto Andrei's openDAW** (`andremichelle/openDAW`). Written for review by
someone who hasn't been in the weeds. Pair this with the source — file paths are exact.

- Code: `~/Desktop/opendaw/packages/integrations/claude-mcp` (the MCP) + a few files in
  `packages/app/studio` (the in-studio sidebar).
- Companion docs: `architecture/*` (study of openDAW), `design/ai-music-studio.md` (vision),
  `specs/…` (the approved spec), `plans/…` (the TDD plan).

---

## 1. What this is, in one paragraph

openDAW is a browser DAW whose project (tracks, notes, devices, mix) is a **graph of "boxes"**. Andrei
also ships a clean, UI-free **scripting API** (`@opendaw/studio-scripting`) that builds that graph in
code. We wrap that API in an **MCP server** so an AI (Claude, or any MCP host) can build music by
calling tools. Three ways to use it: **offline** (write a `.od` file), **live bridge** (push/drive a
running studio over WebSocket), and an **in-studio chat sidebar** (chat inside openDAW). Everything is
plain data transformation + a couple of network hops — no audio DSP on our side.

## 2. Three modes, schematically

```
OFFLINE (Phase A)
  Claude ──stdio(MCP)──▶ MCP server ──Engine──▶ ProjectImpl ──serialize──▶ project.od ──▶ open in openDAW

LIVE BRIDGE (Phase A2)
  Claude ──stdio──▶ MCP server ──Engine──▶ ProjectImpl
                         │                       │ serialize (base64)
                         └── StudioBridge (WebSocket :8765) ──"project"──▶ studio AiBridgeClient
                                                                              │ deserialize
                                                                              ▼ Project.fromSkeleton → setProject (live)

IN-STUDIO SIDEBAR (Phase B)
  user types in ChatPanel ──▶ AnthropicProvider (browser fetch, tool-calling loop)
       ▲ text/results              │ tool_use
       │                           ▼
  AiBridgeClient ──"tool"(ws)──▶ StudioBridge ──executor──▶ Engine tool ──result──▶ back to the loop
       │ after the turn: callTool("open_in_studio") ──"project"──▶ AiBridgeClient opens it live
```

The key insight that makes all three share one codebase: **the same `Engine` (and the same tool
definitions) is the single source of truth.** Offline serializes it; the bridge executes tools on it
and pushes it; the sidebar drives those same tools over the bridge.

## 3. How it bolts onto Andrei's openDAW

We depend on his packages and touch his code in exactly **two tiny, justified places**.

**Packages we consume (read-only dependency):**
- `@opendaw/studio-scripting` — the builder API. We use `ApiImpl`, `ProjectImpl`, `ScriptHostProtocol`,
  and `ProjectConverter`.
- `@opendaw/studio-adapters` — `ProjectSkeleton` (the `.od` binary encode/decode + the box graph).
- `@opendaw/lib-dsp` — `PPQN`, `Interpolation` (musical time + automation curves).
- `@opendaw/lib-std` — `tryCatch`, `Optional`, etc. (his std lib; we follow his idioms).
- (studio side) `@opendaw/lib-box`, `@opendaw/studio-boxes`, `@opendaw/studio-core` — to deserialize a
  pushed project and set it live, reusing his `Project.fromSkeleton` + `projectProfileService`.

**The two changes we made to his source (both on `feat/claude-mcp`):**
1. `packages/studio/scripting/src/index.ts` — added one line: `export * from "./ProjectConverter"`.
   *Why:* `ProjectConverter.toSkeleton(project)` is how you turn the in-memory builder result into the
   serializable box graph, but it wasn't re-exported, so it's unreachable for headless use. One-line,
   additive, safe.
2. `packages/studio/scripting/src/impl/NoteEventImpl.ts` — a **bug fix**: the file imported the lowercase
   type `ppqn` but used the uppercase `PPQN` namespace for a default, so **any note without an explicit
   duration threw `ReferenceError: PPQN is not defined`**. We added the missing import. This is a real
   upstream bug (issue #6) worth its own PR to Andrei.

**The contribution boundary / why it's mergeable:** all *our* code lives in a new, isolated package
`packages/integrations/claude-mcp` (and a self-contained studio sidebar). We follow his conventions
(`CLAUDE.md`: `lib-std` types, no `as any`, no `try/catch`, small diffs). The studio sidebar is **opt-in**
(`?ai-bridge` query flag; no-op otherwise), so it can't affect normal users.

## 4. File-by-file (the MCP — `packages/integrations/claude-mcp/src`)

Think of it as four layers: **headless plumbing → Engine (state) → tools (schema) → server/bridge (I/O).**

### `headless.ts` — run the builder API outside the browser
`ApiImpl` needs a `ScriptHostProtocol` (its bridge to the studio worker for `openProject`/`addSample`).
Headless, there's no worker, and we never call those. So we pass a **stub protocol whose methods
`panic()`** if ever called. `makeApi()` returns a usable `ApiImpl` for pure building.
*Why this works:* building a project (`newProject`, `addInstrumentUnit`, …) never touches the protocol —
it's just object construction. Only playback/open/sample-import would, and we don't do those headlessly.

### `serialize.ts` — the only path to a `.od`
`toBytes(project)` = `ProjectConverter.toSkeleton(project)` → `ProjectSkeleton.encode(boxGraph)`.
`fromBytes(buffer)` = `ProjectSkeleton.decode(buffer)` (used by tests + the studio).
*Why:* `toSkeleton` walks the in-memory `ProjectImpl` and emits Andrei's box graph (with built-in NaN +
overlapping-region validation); `encode` adds the `OPEN` magic header + version. This is exactly the
format his studio loads, so our files are first-class.

### `ids.ts` — `IdRegistry` (friendly handles for a stateless protocol)
**Data structure:** two `Map`s — `items: Map<string, unknown>` and `counters: Map<string, number>`.
**Why:** MCP tool calls are independent JSON messages; the model can't hold object references. So when
we create a track we return a stable string id (`"track_1"`) and stash the real object. Later calls
("add a region to `track_1`") resolve through the registry. Monotonic per-prefix counters give readable,
collision-free ids; `clear()` resets on a new project. *Algorithmic note:* O(1) create/lookup.

### `time.ts` — musical input → PPQN / MIDI
**Algorithms:** `parsePPQN` accepts ints or strings (`"1bar"`, `"1/8"`) via two regexes and multiplies
`PPQN.Bar`. `parsePitch` accepts ints or note names (`"C4"`) via a regex + a 12-tone lookup table
(`(octave+1)*12 + semitone`). **Why:** models speak musically; resolving units **server-side** keeps the
tool surface forgiving and the model prompts simple. Pure functions → trivially testable.

### `engine.ts` — the heart: project state + every operation
**Data structure — the discriminated `Entry` union + `IdRegistry`:**
```
type Entry = {kind:"track", unit, track, name, instrument}
           | {kind:"aux",   unit}
           | {kind:"group", unit}
```
**Why a discriminated union?** Several tools take an id that could be a track, aux, or group. Tagging by
`kind` lets us (a) validate intent — e.g. `add_send` rejects a *track* as a send target, `route_output`
requires a *group* — and (b) recover the precisely-typed unit **without unsafe casts**. This replaced an
earlier `as AuxAudioUnit | GroupAudioUnit` cast (a real bug: it silently allowed mis-routing).
**Other state:** a parallel `#tracks: TrackSummary[]` that records name/instrument/regions/effects/sends/
automation as you build — this powers `get_project_info` so the model can *see* the session it's editing
(granular visibility), without re-walking the box graph.
**Algorithms of note:**
- `addNotes`: maps each note through `parsePPQN`/`parsePitch` and **clamps** velocity→[0,1], pitch→[0,127]
  int, positions≥0 (defends against the model sending MIDI-style 0–127 velocities or junk).
- `addAutomation`: `unit.addValueTrack(unit, param)` → a region sized to `max(point positions)+1 bar` →
  `addEvents` with `Interpolation.Linear|None`. Sizing the region to the events is the non-obvious bit.
- `exportToFile`: **security** — resolves the path and refuses anything outside `$HOME`/`OPENDAW_MCP_OUT_DIR`
  or not ending in `.od` (an LLM-driven tool must not write arbitrary files).

### `catalog.ts` — the honest capability list
A frozen object listing the instruments (6) and effects (delay, pitch) we *actually* support. Surfaced as
the `opendaw://catalog` resource and the `list_devices` tool. **Rule:** nothing is listed unless a tool
backs it ("no advertising without features").

### `tools.ts` — zod schemas ↔ Engine
Each tool = `{name, description, inputSchema (zod), run}`. `makeTools(engine, bridge?)` builds the array;
each `run` parses its args with zod (defense-in-depth) then calls the Engine. **Why zod:** one schema
gives us runtime validation, the MCP `inputSchema` (`.shape`), *and* the model's tool definition
(`z.toJSONSchema`) — no drift. Boundary casts (`as Partial<AudioEffects["delay"]>`) are confined here, at
the validated-IO seam; the Engine stays strictly typed.

### `server.ts` — the MCP host
Builds the `McpServer`, registers each tool (wrapping `run` in `tryCatch` so a thrown error becomes a
structured `{isError:true}` result instead of crashing the protocol), the two resources, and the
`compose` prompt. If a bridge is present, wires the bridge's executor + tool specs to the same tools.

### `bridge.ts` — `StudioBridge` (the A2 WebSocket server)
**Protocol (JSON over ws):** studio→MCP `{type:"tool"|"list_tools", id, name?, args?}`; MCP→studio
`{type:"result", id, ok, value?|error?}` and `{type:"project", name, data(base64)}`.
**Algorithm — request/response correlation by `id`:** the studio assigns a monotonic id; the bridge
echoes it on the result; the studio resolves the matching pending promise. Same pattern as JSON-RPC.
**Why a separate ws (not reuse his yjs/collab):** the AI bridge is a simple request/response control
channel; piggybacking on the CRDT collab doc would entangle concerns. A tiny dedicated socket is easier
to reason about and test.

### `index.ts` — entry
Parses `--bridge`/`--port`, constructs the bridge if asked, starts the stdio transport. The
`process.argv[1]` guard means importing the module (in tests) doesn't boot a server.

### `build.mjs` — why we bundle
openDAW's compiled packages use **extensionless ESM imports** (`export * from "./Api"`), which Node's ESM
loader rejects when run directly. esbuild bundles everything into one file; a `createRequire` banner lets
the bundled CommonJS `ws` use `require` inside the ESM output. Result: a single `dist/index.js` any MCP
host can spawn.

## 5. The studio sidebar (`packages/app/studio`)

### `service/AiBridgeClient.ts` — the studio end of the bridge
Bidirectional: **receives** `project` pushes (decodes base64 → `BoxGraph.fromArrayBuffer` →
`Project.fromSkeleton` → `projectProfileService.setProject` → `switchScreen` — *the exact flow Andrei's
code-editor uses*, so it's proven) and **sends** `tool`/`list_tools` requests via `#request`, correlating
replies by id with a timeout + not-connected guard. Auto-reconnect with backoff. A static `#current` lets
the panel grab the active client.

### `ui/chat-panel/ModelProvider.ts` — the Claude tool-calling loop
`AnthropicProvider.run` POSTs to `api.anthropic.com/v1/messages` (raw fetch + the
`anthropic-dangerous-direct-browser-access` header, no SDK). **Algorithm (the agentic loop):** send
messages+tools → read `content` blocks (emit text, collect `tool_use`) → if `stop_reason==="tool_use"`,
execute each tool via the caller's `exec` (which forwards to the bridge), append `tool_result` blocks,
loop; else return. Capped at 16 steps. Tool failures come back as `is_error` results so the model can
recover.

### `ui/chat-panel/ChatPanel.tsx` — the UI
openDAW's custom JSX (not React) + observable/lifecycle idioms (mirrors `NotePadPanel`). Holds the
conversation, renders turns, persists key/model in `localStorage`, and on send runs the provider with
`exec = bridge.callTool`, then calls `open_in_studio` to refresh. Errors (no bridge, no key, API/tool
failures) are appended to the chat, never thrown into the void.

### Registration (`workspace/PanelType.ts`, `PanelFactory.tsx`, `Default.ts`, `header/Header.tsx`)
A new `PanelType.AiChat`, a factory case, and a new **"AI" workspace screen** (timeline + devices +
chat sidebar) following Andrei's existing screen pattern. The Header map needed the new screen key.

## 6. Methods considered (and why we chose what we did)

- **How does an MCP reach a browser DAW?** Three options: (1) offline file-gen, (2) live ws bridge,
  (3) fully in-browser. We chose a **staged hybrid: 1 → 2 → 3**. Offline first proved feasibility and is
  CI-testable; the bridge added "live"; the sidebar reused both. (See `specs/…`.)
- **Live updates: rebuild-and-reopen vs. incremental box-graph edits.** v1 **rebuilds** the project and
  re-opens it on each `open_in_studio` (simple, reuses the proven open path; resets undo). Incremental
  live edits via `editing.modify` are the better long-term answer — tracked as issue #3.
- **Tool execution location for the sidebar.** The browser can't reach the stdio MCP, so the sidebar
  forwards tool calls **over the bridge** to the one Engine — rather than re-implementing tools in-browser.
  One source of truth, less drift.
- **Why bundle instead of ship raw ESM** — see `build.mjs` above.

## 7. Ideas & roadmap (where contributors come in)

- **Issues (scoped):** #8 synth designer (`set_device_param` + param catalog), #9 sequencer toolbox,
  #10 tone/preset library, #11 production notes; #5 multi-provider (OpenAI/Ollama), #3 live-edits, #6
  upstream `NoteEventImpl` PR.
- **Drafts (open ideas):** visualizer tags, score-to-video, vocals+lyrics, video channel — see
  `packages/integrations/claude-mcp/drafts/`.
- **The bigger vision** (context store, parametric action library, session read/teach, tutorial
  curriculum) is in `design/ai-music-studio.md`.

## 8. How we verify (so review can trust it)
- **Unit/golden:** every tool builds → exports → decodes → asserts on the box graph (33 tests).
- **Integration:** real stdio + real WebSocket round-trips (a `FakeStudio` ws client drives tools).
- **Compile-in-context:** the whole studio app `tsc` passes with the sidebar wired (`=0` errors).
- **Lint + conventions:** clean against Andrei's `CLAUDE.md`.
- The one thing not machine-verified: the live Anthropic call (needs an API key + browser).
