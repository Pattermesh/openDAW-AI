# AI Music Studio — design & roadmap

How the `claude-opendaw` MCP grows from "build a project" into **an AI that understands openDAW,
reads/teaches a session, and tutors a beginner from scratch** — and the frontend/backend/UX/context
machinery to get there. Grounded in openDAW's real surface (see `../architecture/`). Phases tie to
the open issues on `Pattermesh/openDAW-AI`.

> Status legend: ✅ shipped (A/A2) · 🟡 scaffolded/issued · ⬜ designed, not started.

## 0. The shape in one diagram

```
            ┌─────────────────────────── model context ───────────────────────────┐
            │  opendaw://catalog (devices+params, ranges)   opendaw://guide        │
            │  opendaw://session (live read)   compose / lesson prompts            │
            └──────────────────────────────────────────────────────────────────────┘
 user ──► chat (terminal ✅ | in-studio sidebar 🟡) ──► ModelProvider (Claude/OpenAI/Ollama)
            │                                              │  tool-calling loop
            │                                              ▼
            │                                   claude-opendaw MCP (tools) ✅
            │                                              │
            │                          offline .od ✅  ──┐ │ ┌── live bridge ✅ (open_in_studio)
            ▼                                            ▼ ▼ ▼
        context store (intents, history, lesson state) ⬜      openDAW project (box graph)
```

## 1. Backend

- **MCP server** ✅ — stateful `Engine` over `@opendaw/studio-scripting`; 15 tools; resources + `compose` prompt; stdio; `--bridge` WebSocket.
- **Live bridge** ✅ — pushes the project to a running studio (`open_in_studio` → `AiBridgeClient`). v2 ⬜: incremental live edits via `editing.modify` (#A2-v2).
- **Provider layer** ⬜ (#4) — `ModelProvider{stream(messages, tools)}` so Claude/OpenAI/Ollama drive the same tools.
- **Context store** ⬜ — a sidecar per project (`<project>.ai.json`): user intents, decisions ("make it darker"), tool history, lesson progress. Lets the model resume "where we were" and explain *why* the project is shaped as it is. Stored next to the `.od`; never inside the AGPL engine state.

## 2. The parametric action library (the key idea)

Today's `opendaw://catalog` lists devices + a few params. The full vision: **every tunable, defined
parametrically, so the model can tune any detail of even a finished file.**

- **Source of truth = the scripting `Api` types**, machine-generated into a catalog so it can't drift:
  for each instrument/effect/unit, emit `{param, type, min, max, default, unit, enum?, doc}` (the
  `Api.ts` JSDoc already carries ranges, e.g. Vaporisateur cutoff/resonance, Delay feedback/wet).
- Exposed as **`opendaw://catalog` (expanded)** + a queryable tool `describe(target)` so the model can
  ask "what can I change on this track's instrument?" before changing it.
- Backed by real mutation tools: `set_param(trackId, device, param, value)` ⬜ and `add_automation`
  🟡(#3) for time-varying params (via `addValueTrack`). **No param is advertised unless a tool can set it.**
- This is also what powers **tooltips & cheat-sheets** (§4): the same parametric records render as
  in-UI hints ("cutoff: 20–20000 Hz, default 12k") and as a model-readable cheat sheet.

## 3. How the model gets, translates, and stores context

- **Gets** (read): `get_project_info` ✅ (tracks/devices/regions summary) → grow into
  **`opendaw://session`** ⬜ = a structured, model-friendly snapshot of the live box graph (read via
  the bridge's `fetchProject` path), so the model can reason about an *existing* file, not just ones it built.
- **Translates** (intent → actions): the model maps natural language ("warmer, slower, add swing") to
  tool sequences. The catalog + guide + session snapshot are the grounding; the `compose`/`lesson`
  prompts are the scaffolds. Musical units (PPQN, note names, dB) are resolved server-side ✅.
- **Stores/saves**: the project itself persists as `.od` ✅. The **context store** (§1) persists the
  conversation-level intent + history so sessions are resumable and explainable. Save points align with
  `export_project` / `open_in_studio`.

## 4. Frontend & UX

- **Chat sidebar** 🟡(#2) — `ChatPanel` (scaffolded) in the studio: messages + input, streams the
  provider, shows tool calls as they execute, project updates live.
- **Granular visibility** — a "what can I tweak?" affordance: the parametric library (§2) surfaced as
  **tooltips** on devices/params and a **cheat-sheet panel** (searchable list of every command/param the
  AI can drive). Same data feeds the model and the human → they share a vocabulary.
- **Lesson panel** ⬜ — renders the active tutorial step, "show me" (AI demonstrates by calling tools),
  "your turn" (user does it; AI checks the resulting graph).
- **Fun prompty entry** ✅ — the `compose` prompt ("lo-fi, 8 bars, 72 BPM") is the low-floor on-ramp.

## 5. Session reading & teaching

- **Read a session** ⬜: `opendaw://session` + an `analyze` tool → the model summarizes structure,
  detects issues (clashing keys, muddy low-end via too many overlapping bass regions), suggests moves.
- **Teach that session** ⬜: a `teach` flow turns the current project into a guided explanation
  ("here's why this bassline works; try changing the cutoff") — generated from the parametric library +
  session snapshot, so lessons are specific to *the user's* file.

## 6. Tutorial curriculum — learn music production from scratch with AI

A staged series; each lesson is backed by concrete MCP tool sequences the AI can demonstrate and verify.

1. **Sound & transport** — make one note play; tempo; the bar/PPQN grid.
2. **Melody & rhythm** — build a riff; velocity/duration; swing.
3. **Layering** — add a chord track; instruments from the catalog.
4. **Mixing basics** — volume/pan/mute/solo; why headroom.
5. **Space & motion** — sends, an aux with delay; automation (#3) for movement.
6. **Arrangement** — sections, repetition, tension/release.
7. **Finishing** — export, listen, iterate.

Each lesson = `{goal, concept, demo (tool calls), exercise, check}`. The "give your AI the ability to
learn openDAW" angle: lessons + the parametric library are versioned data in this repo, so the model's
competence improves by improving the data, not by guessing.

## 7. Build order (and where it lives)

| Phase | Item | Status | Issue |
|------|------|--------|-------|
| A | offline MCP | ✅ | — |
| A2 | live bridge | ✅ | — |
| A2-v2 | incremental live edits | ⬜ | live-edits |
| B | chat sidebar UI | 🟡 | #2 |
| B | provider abstraction | ⬜ | #4 |
| C | expanded parametric catalog + `set_param`/`describe` | ⬜ | (new) |
| C | `opendaw://session` + `analyze`/`teach` | ⬜ | (new) |
| C | tutorial curriculum data + lesson panel | ⬜ | (new) |
| D | VOYCE-DAW theming | ⬜ | (new) |

**Principle throughout:** no capability is advertised (catalog/guide/tooltips/lessons) unless a tool
backs it. New surface ships as feature + test + (if not finished) issue + branch.
