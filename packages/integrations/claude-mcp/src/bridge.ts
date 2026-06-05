import {Optional, tryCatch} from "@opendaw/lib-std"
import {RawData, WebSocket, WebSocketServer} from "ws"

export type ProjectMessage = {type: "project", name: string, data: string}
export type ToolExecutor = (name: string, args: unknown) => unknown

// A2 live bridge: a WebSocket server the running openDAW studio connects to.
// - MCP -> studio: `project` messages (serialized .od, base64) opened via ScriptHost.openProject.
// - studio -> MCP: `tool` messages executed against the Engine; a `result` is sent back.
// This makes the in-studio chat sidebar possible: the browser runs the model loop and
// forwards tool calls here; the MCP owns the project state.
export class StudioBridge {
  readonly #server: WebSocketServer
  readonly #clients = new Set<WebSocket>()
  #executor: Optional<ToolExecutor> = undefined

  constructor(port: number) {
    this.#server = new WebSocketServer({port})
    this.#server.on("connection", socket => {
      this.#clients.add(socket)
      socket.on("message", data => this.#onMessage(socket, data))
      socket.on("close", () => this.#clients.delete(socket))
      socket.on("error", () => this.#clients.delete(socket))
    })
  }

  setExecutor(executor: ToolExecutor): void { this.#executor = executor }

  get clientCount(): number { return this.#clients.size }

  push(buffer: ArrayBufferLike, name: string): number {
    const message: ProjectMessage = {type: "project", name, data: Buffer.from(buffer).toString("base64")}
    return this.#broadcast(JSON.stringify(message))
  }

  close(): void { this.#server.close() }

  #onMessage(socket: WebSocket, data: RawData): void {
    const parsed = tryCatch(() => JSON.parse(data.toString()) as {type?: string, id?: number, name?: string, args?: unknown})
    if (parsed.status !== "success") {return}
    const {type, id, name, args} = parsed.value
    if (type !== "tool" || typeof id !== "number" || typeof name !== "string") {return}
    const executor = this.#executor
    if (executor === undefined) { this.#reply(socket, {type: "result", id, ok: false, error: "Bridge has no executor"}); return }
    const result = tryCatch(() => executor(name, args))
    if (result.status === "success") {
      this.#reply(socket, {type: "result", id, ok: true, value: result.value})
    } else {
      const message = result.error instanceof Error ? result.error.message : String(result.error)
      this.#reply(socket, {type: "result", id, ok: false, error: message})
    }
  }

  #reply(socket: WebSocket, message: object): void {
    if (socket.readyState === WebSocket.OPEN) {socket.send(JSON.stringify(message))}
  }

  #broadcast(payload: string): number {
    let delivered = 0
    for (const socket of this.#clients) {
      if (socket.readyState === WebSocket.OPEN) { socket.send(payload); delivered++ }
    }
    return delivered
  }
}
