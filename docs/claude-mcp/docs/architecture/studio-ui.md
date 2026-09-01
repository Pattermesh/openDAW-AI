# openDAW Studio UI — adding a chat sidebar

The studio app uses a **custom JSX runtime** (`@opendaw/lib-jsx`), **not React**. State is handled
with observables (`DefaultObservableValue<T>`, `MutableObservableOption<T>`) and explicit
`lifecycle.own(subscription)` cleanup — no hooks. This doc captures the panel system and the
minimal pattern for a new **AI chat sidebar** (subsystem B).

## App shell
- `packages/app/studio/src/ui/App.tsx` — root `App(service: StudioService)`; Header + Router +
  ChatOverlay + RoomStatus + Footer. `service.layout.screen` (observable) drives the workspace.
- `packages/app/studio/src/ui/workspace/WorkspacePage.tsx` — renders the workspace via
  `WorkspaceBuilder.buildScreen()`.

## Panel / dock system
| File | Role |
|------|------|
| `ui/workspace/PanelType.ts` | enum of panel types (register a new one here) |
| `ui/workspace/Workspace.ts` | layout type definitions |
| `ui/workspace/WorkspaceBuilder.tsx` | builds nested panel layout |
| `ui/workspace/PanelContents.tsx` | factory/registry; `getByType`, `bind` |
| `ui/workspace/PanelContent.tsx` | per-panel lifecycle (mount/unmount/popout/minimize) |
| `ui/workspace/PanelFactory.tsx` | switches on `PanelType` → component |
| `ui/workspace/Default.ts` | default workspace layout (`PanelState.create`) |

Panels get minimize/maximize, popout-to-window, resizing, and presence dots for free.

## Template to copy: `NotePadPanel`
`packages/app/studio/src/ui/NotePadPanel.tsx` (+ `.sass`). Representative component shape:

```tsx
import css from "./ChatPanel.sass?inline"
import {DefaultObservableValue, Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService.ts"

const className = Html.adoptStyleSheet(css, "ChatPanel")
type Construct = {lifecycle: Lifecycle, service: StudioService}

export const ChatPanel = ({lifecycle, service}: Construct) => {
  const messages = new DefaultObservableValue<ReadonlyArray<string>>([])
  const list: HTMLElement = <div className="messages"/>
  const input: HTMLInputElement = <input type="text" placeholder="Ask about your project…"/>
  const send = () => { /* call MCP/agent with service.optProject context */ input.value = "" }
  lifecycle.own(messages.subscribe(() => { /* re-render list */ }))
  return <div className={className}>{list}<div className="input-area">{input}<button onclick={send}>Send</button></div></div>
}
```

## Conventions
- Named params via `type Construct = {…}`; component returns a DOM element.
- CSS: `import css from "./File.sass?inline"` → `Html.adoptStyleSheet(css, "Name")`;
  class lists via `Html.buildClassList(...)`.
- Visibility via the `.hidden` class (`classList.add/remove`), never `display:none`.
- Subscriptions/bindings wrapped in `lifecycle.own(...)` (auto-cleanup); bind on `onInit={el => …}`.
- No `&&` conditional rendering — branch with observables or separate JSX.
- SASS: `@use "@/colors"`, `@include colors.panel-background`.

## Accessing the live project / engine
`packages/app/studio/src/service/StudioService.ts`:
- `service.optProject: Option<Project>` (safe), `service.project` (throws if none), `service.hasProfile`
- `service.engine: EngineFacade`, `service.audioContext: AudioContext`
- `project.boxGraph`, `project.rootBox`, `project.editing.modify(() => …)`

```ts
service.optProject.match({
  none: () => {/* no project open */},
  some: project => {/* read/manipulate */}
})
```

## Closest analog: the Code Editor panel
`ui/code-editor/CodeEditorPanel.tsx` + `ui/pages/CodeEditorPage.tsx` run compiled TS/JS against
the project through a `ScriptHost` (`handler.compile(code)`, `subscribeErrors`, `subscribeCode`),
with Monaco loaded lazily via `<Await ...>`. **This is the single best reference** for how the chat
sidebar should execute model-generated actions against the live project — the chat panel is
essentially "Code Editor, but the code is authored by an LLM via MCP tools."

## Minimal steps to add the chat panel
1. `PanelType.ts` — add `ChatPanel`.
2. Create `ui/chat-panel/ChatPanel.tsx` (+ `.sass`) from the NotePad template.
3. `PanelFactory.tsx` — `case PanelType.ChatPanel: return <ChatPanel .../>`.
4. `Default.ts` — `PanelState.create({type:"panel", name:"Chat", icon: IconSymbol.…, panelType: PanelType.ChatPanel, constrains:{type:"fixed", fixedSize: 400}})` and add to the default layout.
