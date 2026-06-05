import css from "./ChatPanel.sass?inline"
import {DefaultObservableValue, Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService.ts"
import {ChatMessage} from "./ModelProvider"

const className = Html.adoptStyleSheet(css, "ChatPanel")

type Construct = {lifecycle: Lifecycle, service: StudioService}

// Phase B scaffold — see Pattermesh/openDAW-AI#2.
// Renders a chat UI following the NotePadPanel pattern. The model loop
// (ModelProvider) + tool execution against the project are the next steps;
// for now `send` echoes locally so the panel is real UI, not vaporware.
export const ChatPanel = ({lifecycle, service: _service}: Construct) => {
  const messages = new DefaultObservableValue<ReadonlyArray<ChatMessage>>([])
  const list: HTMLElement = <div className="messages"/>
  const input: HTMLInputElement = <input type="text" placeholder="Describe the music you want…"/>
  const render = () => list.replaceChildren(...messages.getValue().map(message =>
    <div className={`message ${message.role}`}>{message.content}</div>))
  const send = () => {
    const text = input.value.trim()
    if (text.length === 0) {return}
    input.value = ""
    messages.setValue([...messages.getValue(),
      {role: "user", content: text},
      {role: "assistant", content: "Model provider not wired yet — scaffold only (see issue #2). Use the terminal MCP + open_in_studio for now."}])
  }
  lifecycle.own(messages.subscribe(render))
  return (
    <div className={className}>
      {list}
      <div className="input-area">
        {input}
        <button onclick={send}>Send</button>
      </div>
    </div>
  )
}
