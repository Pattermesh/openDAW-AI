# Contributing — claude-opendaw (AI for openDAW)

This is an **open, free-to-contribute** effort from Pattermesh toward [openDAW](https://github.com/andremichelle/openDAW):
an MCP server + an in-studio AI chat sidebar that let anyone make music by talking to an AI — and a
**toolbox** for artists to design their own synths, sounds, sequencers, tones, and (soon) score video.

Everything here is AGPL, like openDAW. No CLA, no gatekeeping — pick something and open a PR.

## What exists today (build on it)

- **`claude-opendaw` MCP** (`packages/integrations/claude-mcp`): 20 tools that build openDAW projects
  (tracks, MIDI, mix, routing, effects, automation), `.od` export, resources + a `compose` prompt.
- **A2 live bridge**: the MCP pushes/edits a **running** studio over WebSocket (`--bridge` + `?ai-bridge`).
- **In-studio AI chat sidebar**: the "AI" workspace screen — chat that runs a tool-calling loop and
  builds music live.

Run + test: see [`README.md`](README.md) and [`LIVE_DEMO.md`](LIVE_DEMO.md).
Architecture & vision: `opendaw-contributions/docs/design/ai-music-studio.md`.

## How to contribute

1. **Pick an issue** — scoped, ready-to-build work. See the repo Issues tab (toolbox features:
   custom synth designer, sequencer toolbox, tone/preset library, production notes; plus providers,
   live-edits, the upstream `NoteEventImpl` fix).
2. **Adopt a draft** — bigger open ideas in [`drafts/`](drafts/) (visualizer tags, score-to-video,
   vocals + lyrics, video channel). Comment with a plan and we'll turn it into an issue.
3. **Pitch your own** — open an issue or drop a draft PR under `drafts/`.

## Ground rules (so PRs merge fast)

- **No advertising without features.** If the catalog/guide/tooltips mention a capability, a working,
  tested tool must back it. Roadmap goes in issues/drafts, not in user-facing surfaces.
- **Tests + lint green.** `npm test -w @opendaw/claude-mcp`, `npm run lint -w @opendaw/claude-mcp`,
  and the studio `tsc` must pass. Add tests for new tools (see `test/helpers.ts`).
- **Follow openDAW conventions** (`CLAUDE.md`): `@opendaw/lib-std` types, no `as any`, no `try/catch`
  (use `tryCatch`), small diffs via `Edit`.
- **Keep tools small and musical**; resolve units (PPQN, note names, dB) server-side.

## Good first contributions

- Add an instrument/effect parameter to the catalog **and** a tool that sets it (see #synth-designer).
- A new error-path test in `test/`.
- A provider in `ModelProvider` (#providers): OpenAI or Ollama.
- Improve `get_project_info` to report more of the live session.

Thank you — let's give openDAW a solid hand. 🎛️
