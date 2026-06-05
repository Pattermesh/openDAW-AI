// Phase B — the model loop for the in-studio chat sidebar.
// Anthropic (Claude) tool-calling loop via raw browser fetch (no SDK dependency).
// Tool execution is delegated to the caller (which forwards to the MCP over the A2 bridge).

export type ChatTurn = {role: "user" | "assistant", content: string}
export type ToolSpec = {name: string, description: string, input_schema: unknown}
export type ToolExec = (name: string, args: unknown) => Promise<{ok: boolean, value?: unknown, error?: string}>
export type RunHandlers = {onText: (text: string) => void, onToolCall: (name: string) => void}

type AnthropicBlock = {type: "text", text: string} | {type: "tool_use", id: string, name: string, input: unknown}
type AnthropicResponse = {content: ReadonlyArray<AnthropicBlock>, stop_reason: string}
type Message = {role: "user" | "assistant", content: unknown}

const MAX_TOOL_STEPS = 16

export class AnthropicProvider {
  readonly #apiKey: string
  readonly #model: string

  constructor(apiKey: string, model: string) {
    this.#apiKey = apiKey
    this.#model = model
  }

  async run(system: string, history: ReadonlyArray<ChatTurn>, tools: ReadonlyArray<ToolSpec>, exec: ToolExec, handlers: RunHandlers): Promise<void> {
    const messages: Array<Message> = history.map(turn => ({role: turn.role, content: turn.content}))
    const anthropicTools = tools.map(spec => ({name: spec.name, description: spec.description, input_schema: spec.input_schema}))
    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.#apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({model: this.#model, max_tokens: 4096, system, tools: anthropicTools, messages})
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 300)}`)
      }
      const data: AnthropicResponse = await response.json()
      const toolUses: Array<{id: string, name: string, input: unknown}> = []
      for (const block of data.content) {
        if (block.type === "text") { handlers.onText(block.text) }
        else if (block.type === "tool_use") { toolUses.push({id: block.id, name: block.name, input: block.input}); handlers.onToolCall(block.name) }
      }
      messages.push({role: "assistant", content: data.content})
      if (data.stop_reason !== "tool_use" || toolUses.length === 0) {return}
      const toolResults = []
      for (const use of toolUses) {
        const result = await exec(use.name, use.input)
        toolResults.push({
          type: "tool_result", tool_use_id: use.id, is_error: !result.ok,
          content: JSON.stringify(result.ok ? (result.value ?? {ok: true}) : {error: result.error})
        })
      }
      messages.push({role: "user", content: toolResults})
    }
    handlers.onText(`\n[stopped after ${MAX_TOOL_STEPS} tool steps]`)
  }
}
