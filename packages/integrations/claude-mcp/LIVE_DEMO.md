# Live demo — AI builds music in a running openDAW (A + A2 + in-studio sidebar)

Three ways to use the MCP:

- **Offline (A):** the model builds a project and `export_project` writes a `.od` file you open manually.
- **Live (A2):** an external Claude (terminal/Desktop) calls `open_in_studio` and the project appears in a **running** openDAW tab.
- **In-studio chat sidebar (B):** chat *inside* openDAW — switch to the **AI** screen, enter your Anthropic
  key, and type. The sidebar runs the model loop in the browser and forwards each tool call to the MCP
  over the same bridge, refreshing the project live. (Needs the MCP running with `--bridge`.)

## In-studio sidebar (B) — quickstart

1. Start the MCP **standalone in bridge mode** (so the browser can reach it):
   ```bash
   node ~/Desktop/opendaw/packages/integrations/claude-mcp/dist/index.js --bridge --port 8765
   ```
2. `npm run dev:studio` → open **https://localhost:8080/?ai-bridge=8765** in Chrome.
3. Click the **AI** tab (chat icon) in the header. In the sidebar, paste your **Anthropic API key**
   (stored in localStorage) and optionally set a model (default `claude-sonnet-4-5`).
4. Type: *"make a lo-fi beat at 72 BPM with a bass and chord track, add a gentle volume swell"* → the
   model calls tools over the bridge and the project updates live in the timeline.

> The browser calls the Anthropic API directly (with the browser-access header); your key stays in the
> browser. For multi-provider (OpenAI/Ollama) see issue #5.

## Live bridge setup

### 1. Build (once)
```bash
cd ~/Desktop/opendaw
npx turbo run build --filter=@opendaw/claude-mcp^...   # build @opendaw deps
npm run build -w @opendaw/claude-mcp                   # bundle the server
npm run cert                                           # https cert for the studio (once)
```

### 2. Start the studio with the bridge enabled
```bash
npm run dev:studio
```
Open **https://localhost:8080/?ai-bridge=8765** — the `?ai-bridge` flag tells the studio to connect
to the MCP bridge on port 8765. (Without the flag the studio behaves normally.)

### 3. Register the MCP in bridge mode (terminal Claude Code)
```bash
claude mcp add opendaw -- node /Users/tatin/Desktop/opendaw/packages/integrations/claude-mcp/dist/index.js --bridge --port 8765
```

### 4. Make music — live
In a `claude` session:
```
Read opendaw://guide. Create a project at 84 BPM, add a Vaporisateur bass track with a
4-bar riff and a Nano chord track, then open_in_studio.
```
The project pops into the openDAW tab. Iterate: ask for changes, call `open_in_studio` again —
each push rebuilds-and-reopens the live project (v1 strategy).

## How it works

```
Claude  --stdio-->  claude-opendaw MCP (--bridge)  --WebSocket :8765-->  openDAW tab (?ai-bridge=8765)
  tools             Engine builds .od in memory       open_in_studio        AiBridgeClient -> Project.fromSkeleton
                                                       pushes base64 .od     -> projectProfileService.setProject
```

## Notes & limits (v1)

- **Rebuild-and-reopen:** each `open_in_studio` replaces the open project (no incremental live edits
  or undo across pushes yet). Tracked for follow-up — see the repo issues.
- One studio tab per bridge port; the MCP must be started with `--bridge` for `open_in_studio` to work
  (otherwise it returns a clear "bridge not enabled" message).
- Offline export (`export_project`) is sandboxed to `$HOME`/`OPENDAW_MCP_OUT_DIR`, `.od` only.
- No audio-sample import yet (instruments + MIDI only).
