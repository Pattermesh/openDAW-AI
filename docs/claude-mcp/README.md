# openDAW Contributions

Working knowledge base and design home for contributing an **AI assistant + MCP** to
[openDAW](https://github.com/andremichelle/openDAW) — the open-source, web-based DAW —
and for a downstream branded variant, **VOYCE-DAW**.

> Goal: give the openDAW project a solid hand. Everything here is built to be
> upstream-contributable first, machine-portable second, and only then flavored into VOYCE-DAW.

## The work, in sequence

1. **Study openDAW** — understand how it can be driven programmatically. ✅ (see `docs/architecture/`)
2. **Write docs** — capture the study so anyone can pick this up. ◐ (this repo)
3. **Build the `claude-opendaw` MCP** + test it — modeled on `ableton-mcp`, adapted for a browser DAW.
4. **Studio chat sidebar** — an in-app panel, wired to the MCP.
5. **Review a working version on this machine**, built to a standard that runs everywhere → contribute upstream.
6. **VOYCE-DAW** — branded/flavored variant (parked until 1–5 land).

## The four subsystems

| ID | Subsystem | Status | Home |
|----|-----------|--------|------|
| **A** | `claude-opendaw` MCP server | design | likely a new package in the fork, or standalone |
| **B** | Studio AI chat sidebar (panel) | not started | `packages/app/studio` in the fork |
| **C** | This contributions/docs repo | active | `~/Desktop/opendaw-contributions` |
| **D** | VOYCE-DAW variant | parked | downstream fork |

## Key facts established by the study

- openDAW exposes a **clean, UI-free programmatic control surface**: `@opendaw/studio-scripting`
  (`Api`, `ScriptRunner`, `ScriptHostProtocol`). See [control-surface.md](docs/architecture/control-surface.md).
- Project state is a **transactional box-graph** (UUID-addressed boxes, `editing.modify()`),
  serialized to a binary `.od` format. See [data-model.md](docs/architecture/data-model.md).
- The studio app (custom JSX runtime, **not React**) has a **dockable panel system**; a chat
  sidebar follows the `NotePadPanel` pattern. See [studio-ui.md](docs/architecture/studio-ui.md).
- The studio already ships a **code editor** (`CodeEditorPanel`) that runs scripts against the
  live project via a `ScriptHost` — the closest analog to what the chat sidebar will do.
- `ableton-mcp` (our model) uses an external server ↔ socket ↔ in-app script. We adapt this
  for the browser. See [ableton-mcp-analysis.md](docs/reference/ableton-mcp-analysis.md).

## ⚠️ License constraint

openDAW is **AGPLv3**. Anything we publish that derives from it (including **VOYCE-DAW** and any
network-served variant) must remain AGPL with source disclosed — network use counts as
distribution. Branding/theming is fine; relicensing is not. The MCP server, if kept as a separate
process that only talks to openDAW over a socket/SDK boundary, has more licensing latitude — a
decision to make explicitly when we choose the architecture.

## Repo layout

```
docs/architecture/   — how openDAW works (study output, factual reference)
docs/reference/       — external references (ableton-mcp analysis)
docs/design/          — design decisions and rationale
specs/                — approved design specs (per brainstorming workflow)
```

## Environment notes

- Fork: `Pattermesh/openDAW-AI`, cloned at `~/Desktop/opendaw` (upstream remote = `andremichelle/openDAW`).
- The fork is currently **241 commits behind upstream** — sync before contributing.
- Toolchain on this machine: node 24, npm 11, pnpm 9. openDAW uses **bun** (not yet installed).
