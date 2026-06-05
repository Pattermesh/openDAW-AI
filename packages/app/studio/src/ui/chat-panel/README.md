# Chat sidebar (Phase B) — scaffold

Starter for the in-studio AI chat panel. Tracks **Pattermesh/openDAW-AI#2** (panel) and **#4** (provider abstraction).

This branch (`feat/chat-sidebar`) contains real, compilable UI scaffold — **not** a finished feature.
The model loop and tool execution are intentionally stubbed (`send` echoes locally) so we don't
advertise a capability that isn't wired.

## Files
- `ChatPanel.tsx` — chat UI (NotePadPanel pattern: JSX + `DefaultObservableValue` + `lifecycle.own`).
- `ChatPanel.sass` — styles.
- `ModelProvider.ts` — backend-agnostic seam (Anthropic/OpenAI/Ollama) + `ProviderEvent` stream.

## To wire the panel into the workspace (3 edits)
1. `src/ui/workspace/PanelType.ts` — add `ChatPanel` to the enum.
2. `src/ui/workspace/PanelFactory.tsx` — `case PanelType.ChatPanel: return <ChatPanel lifecycle={lifecycle} service={service}/>`.
3. `src/ui/workspace/Default.ts` — `PanelState.create({type:"panel", name:"AI", icon: IconSymbol.…, panelType: PanelType.ChatPanel, constrains:{type:"fixed", fixedSize: 380}})` and add it to the default layout.

## To finish the feature
1. Implement `createProvider("anthropic")` in `ModelProvider.ts` (browser fetch w/ a user key from
   settings; or a tiny local proxy to avoid exposing the key).
2. In `ChatPanel.send`, run the tool-calling loop: stream `ProviderEvent`s; on `tool_call`, execute
   the MCP tool. Two options for execution (decide in #2):
   - **Bridge round-trip:** extend the A2 bridge (`AiBridgeClient`) to be bidirectional so the panel
     forwards tool calls to the running MCP process.
   - **In-browser:** reimplement the `Engine` ops against the live `service.project` box graph via
     `project.editing.modify(...)` (see A2 v2, #3).
3. Reflect live results in the project (the A2 path already opens pushed `.od` buffers).

Until then, the working chat-to-music experience is: terminal Claude → `claude-opendaw` MCP →
`open_in_studio` (live) — see `packages/integrations/claude-mcp/LIVE_DEMO.md`.
