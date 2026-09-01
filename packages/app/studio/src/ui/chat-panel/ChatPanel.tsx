import css from "./ChatPanel.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {Promises} from "@opendaw/lib-runtime"
import {createElement} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService.ts"
import {AiBridgeClient} from "@/service/AiBridgeClient.ts"
import {AnthropicProvider, ChatTurn, ToolSpec} from "./ModelProvider"

const className = Html.adoptStyleSheet(css, "ChatPanel")

const KEY_STORAGE = "opendaw.ai.anthropicKey"
const MODEL_STORAGE = "opendaw.ai.model"
const DEFAULT_MODEL = "claude-sonnet-4-5"

const SYSTEM = `You are a music-production assistant inside openDAW. Build and edit the user's project by calling the provided tools.
- Time is in PPQN; pass ints or strings like '1bar', '1/8'. Pitch is MIDI 0-127 or names like 'C4'.
- Typical flow: create_project -> add_instrument_track -> add_note_region -> add_notes -> mix/effects/automation.
- Call list_devices if unsure what instruments/effects exist. Keep tool calls small and musical.
- The studio refreshes automatically after your turn, so just build; do not ask the user to export.`

type Construct = {lifecycle: Lifecycle, service: StudioService}

export const ChatPanel = ({lifecycle, service: _service}: Construct) => {
  const turns: Array<ChatTurn> = []
  let busy = false
  const list: HTMLElement = <div className="messages"/>
  const input: HTMLInputElement = <input className="prompt" type="text" placeholder="Describe the music you want…"/>
  const keyInput: HTMLInputElement = <input className="key" type="password" placeholder="Anthropic API key"/>
  const modelInput: HTMLInputElement = <input className="model" type="text" placeholder="model"/>
  const sendButton: HTMLButtonElement = <button className="send">Send</button>

  keyInput.value = self.localStorage.getItem(KEY_STORAGE) ?? ""
  modelInput.value = self.localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL

  const render = () => list.replaceChildren(...turns.map(turn => {
    const element: HTMLElement = <div className={`message ${turn.role}`}/>
    element.textContent = turn.content
    return element
  }))
  const appendTo = (index: number, chunk: string) => { turns[index] = {role: turns[index].role, content: turns[index].content + chunk}; render() }

  const run = async () => {
    const text = input.value.trim()
    if (busy || text.length === 0) {return}
    input.value = ""
    turns.push({role: "user", content: text})
    const assistantIndex = turns.push({role: "assistant", content: ""}) - 1
    render()
    busy = true
    sendButton.disabled = true
    const history = turns.slice(0, assistantIndex)
    const bridge = AiBridgeClient.get()
    if (bridge === undefined || !bridge.connected) {
      appendTo(assistantIndex, "⚠️ Not connected to the openDAW bridge. Start the MCP with --bridge and open the studio with ?ai-bridge=PORT.")
    } else if (keyInput.value.trim().length === 0) {
      appendTo(assistantIndex, "⚠️ Enter your Anthropic API key in the field above.")
    } else {
      const toolsResult = await bridge.listTools()
      if (!toolsResult.ok) {
        appendTo(assistantIndex, `⚠️ Could not load tools: ${toolsResult.error ?? "unknown error"}`)
      } else {
        const tools = toolsResult.value as ReadonlyArray<ToolSpec>
        const provider = new AnthropicProvider(keyInput.value.trim(), modelInput.value.trim().length > 0 ? modelInput.value.trim() : DEFAULT_MODEL)
        const outcome = await Promises.tryCatch(provider.run(SYSTEM, history, tools,
          (name, args) => bridge.callTool(name, args),
          {onText: chunk => appendTo(assistantIndex, chunk), onToolCall: name => appendTo(assistantIndex, `\n  ↪ ${name}`)}))
        if (outcome.status === "rejected") {
          appendTo(assistantIndex, `\n⚠️ ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`)
        }
        await bridge.callTool("open_in_studio", {})
      }
    }
    busy = false
    sendButton.disabled = false
  }

  lifecycle.own(Events.subscribe(sendButton, "click", () => void run()))
  lifecycle.own(Events.subscribe(input, "keydown", event => { if (event.key === "Enter") {void run()} }))
  lifecycle.own(Events.subscribe(keyInput, "change", () => self.localStorage.setItem(KEY_STORAGE, keyInput.value.trim())))
  lifecycle.own(Events.subscribe(modelInput, "change", () => self.localStorage.setItem(MODEL_STORAGE, modelInput.value.trim())))

  return (
    <div className={className}>
      <div className="settings">{keyInput}{modelInput}</div>
      {list}
      <div className="input-area">{input}{sendButton}</div>
    </div>
  )
}
