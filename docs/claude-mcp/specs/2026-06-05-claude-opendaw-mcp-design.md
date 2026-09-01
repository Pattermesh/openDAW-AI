# Spec: `claude-opendaw` MCP

**Date:** 2026-06-05
**Status:** Approved (design) — implementing
**Context:** AI hackathon. Win condition = a working, testable demo in one day: an AI composes
real openDAW projects through an MCP, opened/played in openDAW, with a path to live in-studio use.

Reference docs: [`../docs/architecture/control-surface.md`](../docs/architecture/control-surface.md),
[`../docs/architecture/data-model.md`](../docs/architecture/data-model.md),
[`../docs/architecture/studio-ui.md`](../docs/architecture/studio-ui.md),
[`../docs/reference/ableton-mcp-analysis.md`](../docs/reference/ableton-mcp-analysis.md).

## Goal

A model-agnostic MCP server that lets an LLM build openDAW projects by calling tools, plus an
in-studio chat sidebar that drives the same tools live. Modeled on `ableton-mcp`, adapted for a
browser DAW. Built to openDAW's conventions so it can be contributed upstream.

## Win-condition tiers (1-day scope)

| Tier | Deliverable | Why |
|------|-------------|-----|
| **MVP (must-have)** | A1 offline MCP generator: stdio server, full tool surface, builds `.od`, vitest golden tests; wired to **Claude** via MCP config. Demo: "make a lo-fi beat" → `.od` → open in openDAW. | Reliable, testable, demos in hours. |
| **Stretch 1** | A2 live WebSocket bridge: same tools mutate a *running* studio via `ScriptHost`. | The "wow" — AI editing the live DAW. |
| **Stretch 2** | B: in-studio chat sidebar panel, provider-pluggable (Anthropic → OpenAI → Ollama). | Self-contained product demo. |
| **Later** | D: VOYCE-DAW theming. | Out of hackathon scope. |

## Architecture (staged hybrid 1→2)

```
                         ┌──────────────────────────── MVP (A1) ───────────────────────────┐
  MCP host (Claude       │  stdio   ┌───────────────────────────┐   ProjectConverter        │
  Desktop / Claude Code) │ ───────► │ claude-opendaw MCP server  │   + ProjectSkeleton.encode│
  or sidebar (Stretch 2) │ ◄─────── │ (Node/bun, @opendaw/* libs)│ ─────────► project.od ────┼──► open in openDAW
                         │          │  in-memory Project + IdReg │                            │
                         └──────────┴───────────────┬───────────┴────────────────────────────┘
                                                     │ Stretch 1 (A2): --bridge mode
                                                     ▼  WebSocket (same tool schema)
                                          ┌───────────────────────┐
                                          │ studio bridge handler  │  executes via ScriptHost
                                          │ (in packages/app/studio│  against live service.project
                                          └───────────────────────┘
```

- **Package:** `packages/integrations/claude-mcp` in the fork (`Pattermesh/openDAW-AI`), workspace
  `@opendaw/*` deps, bun + tsc, ESM, `"type":"module"`. Publishable standalone later.
- **Transport:** stdio first (spawnable by any MCP host). `--bridge` adds a WebSocket server for A2.
- **SDK:** `@modelcontextprotocol/sdk` (TypeScript).
- **Headless build path (verified):** build via `@opendaw/studio-scripting` `Api`; serialize via
  `ProjectConverter.toSkeleton(project)` → `ProjectSkeleton.encode(boxGraph)` → write file. Requires
  a one-line export of `ProjectConverter` from the scripting package `index.ts` (small upstream change).
  Only `.od` (no sample bundles) in v1. Node ≥23 (have 24).

## State model (A1)

The server holds **one in-memory `Project`** that accumulates across tool calls. An **IdRegistry**
maps stable friendly IDs (`track_1`, `region_2`, `aux_1`) → live objects so later calls reference
earlier ones. `create_project` resets state; `export_project` serializes. (Mirrors ableton-mcp's
implicit session, but explicit and deterministic for testing.)

## Tool surface

All tools validate inputs with zod and return a small JSON result (ids + summary). Instrument names
and effect types come from the **fixed catalog** (no machine-specific URIs — ableton-mcp's main
fragility is gone).

| Group | Tool | Params (→ result) |
|-------|------|-------------------|
| Project | `create_project` | `name, bpm?=120, timeSignature?={num,den}` → `{ok}` |
| | `get_project_info` | — → `{name,bpm,timeSignature,tracks:[{id,name,type,instrument,regions,effects}]}` |
| | `set_tempo` | `bpm` |
| | `set_time_signature` | `numerator, denominator` |
| | `export_project` | `path?` → `{path, bytes}` (writes `.od`) |
| Tracks | `add_instrument_track` | `instrument∈{Vaporisateur,Playfield,Nano,Soundfont,Tape,MIDIOutput}, name?, params?` → `{trackId}` |
| | `add_audio_track` | `name?` → `{trackId}` |
| | `set_track_mix` | `trackId, {volume?,panning?,mute?,solo?}` |
| Content | `add_note_region` | `trackId, position, duration, label?` → `{regionId}` |
| | `add_notes` | `regionId, notes:[{position,pitch,duration,velocity}]` → `{count}` |
| Devices | `add_audio_effect` | `trackId, type, params?` → `{effectId}` |
| | `add_midi_effect` | `trackId, type, params?` → `{effectId}` |
| Routing | `add_aux` | `name?` → `{auxId}` |
| | `add_group` | `name?` → `{groupId}` |
| | `add_send` | `fromTrackId, toId, {amount,mode}` |
| Automation | `add_automation` | `trackId, param, points:[{position,value,interpolation}]` |

Time is in **PPQN**; helpers accept musical strings too (`"1/8"`, `"1bar"`) resolved to PPQN.
Pitch is MIDI 0–127 (helper accepts `"C4"`). All resolved server-side.

## MCP resources & prompts (the differentiator)

Static, version-pinned, so the model learns openDAW without trial-and-error:
- **`opendaw://catalog`** — every instrument & effect with parameters, ranges, defaults (generated
  from the scripting `Api` types so it can't drift).
- **`opendaw://guide`** — PPQN/timing primer, how to structure a song, idioms, examples.
- **Prompt `compose`** — args `{style, bars, key?, bpm?}`; expands into a structured plan instructing
  the model which tools to call. Enables one-line "make a lo-fi beat in 8 bars".

## Model integration

- **Claude (primary):** ship `claude_desktop_config.json` / `.mcp.json` snippets pointing at the
  built server (`bun run`/`node dist`). No code — MCP is model-agnostic.
- **OpenAI / Ollama:** documented as MCP-host configs where supported; full provider-pluggability is
  realized in the **sidebar** (Stretch 2) via a `ModelProvider` interface (`anthropic` first, then
  `openai`, `ollama`) wrapping a tool-calling loop over the same MCP tool schema.

## A2 live bridge (Stretch 1)

- `claude-mcp --bridge --port <n>` starts a WebSocket server alongside (or instead of) stdio.
- A **studio bridge handler** (new file in `packages/app/studio`) connects on load (opt-in), receives
  tool calls, and executes them against the live `service.project` inside `editing.modify()` via the
  same builder logic — reusing the `ScriptHost`/CodeEditor execution path documented in studio-ui.md.
- **Shared tool definitions:** one `tools/*.ts` module defines schema + a backend-agnostic executor;
  the offline server applies it to its in-memory `Project`, the bridge applies it to the live one.

## Sidebar (Stretch 2)

- New panel `PanelType.ChatPanel` + `ui/chat-panel/ChatPanel.tsx` (+ `.sass`), following the
  `NotePadPanel` template and openDAW JSX/observable/lifecycle conventions ("same design system as
  André"). Registered in `PanelFactory.tsx` and `Default.ts`.
- Chat loop: user message → `ModelProvider` (Anthropic default) with the MCP tool schema → tool calls
  → bridge executor → results streamed back → DAW updates live.

## Testing & verification

- **Unit/golden (CI):** vitest. For each tool: build → `export_project` → decode with
  `ProjectSkeleton.decode` → assert box-graph contents (track count/types, region positions, note
  pitches, effect presence, bpm). Golden `.od` snapshots for representative songs.
- **Catalog test:** assert `opendaw://catalog` matches the scripting `Api` (no drift).
- **Integration:** a generated `.od` opens in openDAW without error (manual + scripted load test).
- **A2 (if reached):** a test harness sends tool calls over WS to a stubbed handler and asserts
  resulting mutations.
- **Demo script:** `compose`-driven "lo-fi beat" produces a non-trivial `.od` that plays in studio.

## Conventions (must match upstream)

Follow the fork's `CLAUDE.md`: `@opendaw/lib-std` types (`Optional`, `Option`, `isDefined`), no
`as any`, no `try/catch` (use `tryCatch`), `.hidden` class for visibility, compact style. Use `Edit`
for existing files. Type-check with `--noEmit`.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Scripting `Api` headless edge cases post-sync | TDD first tool end-to-end before fanning out; verify against current checkout. |
| `ProjectConverter` not exported | Add a one-line export in fork; isolated, upstream-friendly. |
| `.od` won't open in studio | Decode-roundtrip test + early manual open of the first generated file. |
| Time runs out | Tiered scope: A1+Claude is the committed MVP; A2/sidebar are stretch. |
| Sample/audio import complexity | Out of v1 (no `.odb`); instruments + MIDI only for the demo. |

## Out of scope (v1)

Audio sample import/bundles (`.odb`), real-time collaboration, VOYCE-DAW theming, publishing to npm.
