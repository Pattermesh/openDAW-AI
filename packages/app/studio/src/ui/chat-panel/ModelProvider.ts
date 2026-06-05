// Phase B scaffold — see Pattermesh/openDAW-AI#2 and #5.
// A backend-agnostic seam so the chat sidebar can run Claude (default/best),
// OpenAI, or a local Ollama model. Each provider wraps a tool-calling loop over
// the claude-opendaw MCP tool schema.

export type ChatMessage = {role: "user" | "assistant", content: string}

// A tool the model may call. Mirror the MCP tool schema (name + JSON-schema params).
export type ToolSpec = {name: string, description: string, parameters: Record<string, unknown>}

export type ProviderEvent =
  | {type: "text", text: string}
  | {type: "tool_call", name: string, args: Record<string, unknown>}
  | {type: "done"}

export interface ModelProvider {
  readonly id: "anthropic" | "openai" | "ollama"
  // Stream assistant text + tool calls for a conversation. Implementations run the
  // tool-calling loop; the caller executes tool calls (via the MCP bridge or in-browser)
  // and feeds results back. Kept intentionally minimal for the scaffold.
  stream(messages: ReadonlyArray<ChatMessage>, tools: ReadonlyArray<ToolSpec>): AsyncIterable<ProviderEvent>
}

// TODO(#5): implement AnthropicProvider (browser fetch w/ user key from settings,
// dangerouslyAllowBrowser or a tiny local proxy), then OpenAI + Ollama.
export const createProvider = (_id: ModelProvider["id"]): ModelProvider => {
  throw new Error("ModelProvider not implemented yet — scaffold only (see issue #2/#5)")
}
