# @opendaw/claude-mcp

A model-agnostic [MCP](https://modelcontextprotocol.io) server that lets an LLM compose
[openDAW](https://github.com/andremichelle/openDAW) projects — create tracks, write MIDI, set the
mix, add effects/sends — and export a `.od` project file. Inspired by `ableton-mcp`, adapted for
openDAW's browser-based, headless-capable scripting API.

> **Phase A1 (this package):** an offline generator — the model builds a project through tool calls,
> then `export_project` writes a `.od` you open in openDAW. A live in-studio bridge + chat sidebar
> are the next phases.

## Quickstart

```bash
# from the monorepo root (builds the @opendaw dependency chain, then this package)
npm install
npx turbo run build --filter=@opendaw/claude-mcp^...   # build deps once
npm run build -w @opendaw/claude-mcp                   # bundle the server -> dist/index.js
```

Then point an MCP host at it. The server speaks MCP over **stdio**, so any MCP-capable host works —
**Claude** (Claude Desktop / Claude Code) is the primary, recommended client.

### Claude Code / Claude Desktop

Copy `.mcp.json.example` to your project as `.mcp.json` (Claude Code) or merge into
`claude_desktop_config.json` (Claude Desktop), fixing the absolute path:

```json
{
  "mcpServers": {
    "opendaw": { "command": "node", "args": ["<abs-path>/packages/integrations/claude-mcp/dist/index.js"] }
  }
}
```

Then ask Claude:

> Use the `compose` prompt to make a lo-fi beat in 8 bars at 72 BPM, then export it to `/tmp/lofi.od`.

### Other models (OpenAI / Ollama)

The server is model-agnostic — any host implementing MCP can drive it. Live, provider-pluggable use
(Anthropic / OpenAI / Ollama) is delivered by the in-studio **chat sidebar** (a later phase) that
wraps a tool-calling loop over this same tool schema.

## Tools

| Tool | Purpose |
|------|---------|
| `create_project` | Start/replace the working project (`name`, `bpm?`, `timeSignature?`) |
| `set_tempo` / `set_time_signature` | Global tempo / meter |
| `add_instrument_track` | Add an instrument track → `trackId` |
| `add_note_region` | Add a MIDI region to a track → `regionId` |
| `add_notes` | Add notes to a region |
| `set_track_mix` | volume (dB), panning (−1..1), mute, solo |
| `add_aux` / `add_group` | Create send / group buses |
| `add_send` | Route a track to an aux/group |
| `add_audio_effect` | Add an audio effect (`delay`) |
| `get_project_info` | Summarize the project |
| `export_project` | Write the `.od` file → `{path, bytes}` |

## Resources & prompt

- `opendaw://catalog` — instruments & effects with parameters.
- `opendaw://guide` — timing/pitch conventions and the build flow.
- `compose` prompt — `{style, bars, key?, bpm?}` → a plan that drives the tools.

## Conventions

- **Time** is PPQN: pass ints, or strings like `"1bar"`, `"1/8"`, `"1/16"` (a bar = 4 quarters).
- **Pitch** is MIDI `0–127`, or note names like `"C4"` (= 60).
- **Instruments:** `Vaporisateur` (synth), `Nano` (synth), `Playfield`/`Soundfont`/`Tape` (samplers), `MIDIOutput`.

## Opening the output in openDAW

`export_project` writes the canonical `.od` byte format (`ProjectSkeleton.encode`). The most reliable
way to load a generated project today is the upcoming **live bridge** (which hands the buffer to the
studio via `openProject`). Opening a bare `.od` from disk depends on the studio's import UI; if your
build only imports `.odb` bundles, use the live bridge (next phase). Sample/audio import (`.odb`
bundles) is out of scope for v1 — instruments + MIDI only.

## Development

```bash
npm test -w @opendaw/claude-mcp        # vitest (Node) — builds + serializes + decodes
npm run typecheck -w @opendaw/claude-mcp
npm run dev -w @opendaw/claude-mcp     # run from source via tsx
```

License: AGPL-3.0-or-later (matches openDAW).
