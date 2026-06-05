import {WebSocket, WebSocketServer} from "ws"

export type BridgeMessage = {type: "project", name: string, data: string}

// A2 live bridge: a WebSocket server the running openDAW studio connects to.
// The MCP pushes a serialized project (.od bytes, base64) which the studio loads
// via its ScriptHost.openProject path — "rebuild-and-reopen" for v1.
export class StudioBridge {
  readonly #server: WebSocketServer
  readonly #clients = new Set<WebSocket>()

  constructor(port: number) {
    this.#server = new WebSocketServer({port})
    this.#server.on("connection", socket => {
      this.#clients.add(socket)
      socket.on("close", () => this.#clients.delete(socket))
      socket.on("error", () => this.#clients.delete(socket))
    })
  }

  get clientCount(): number { return this.#clients.size }

  push(buffer: ArrayBufferLike, name: string): number {
    const message: BridgeMessage = {type: "project", name, data: Buffer.from(buffer).toString("base64")}
    const payload = JSON.stringify(message)
    let delivered = 0
    for (const socket of this.#clients) {
      if (socket.readyState === WebSocket.OPEN) { socket.send(payload); delivered++ }
    }
    return delivered
  }

  close(): void { this.#server.close() }
}
