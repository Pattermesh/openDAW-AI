import {Option, Optional, Terminable, tryCatch} from "@opendaw/lib-std"
import {BoxGraph} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {Project} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService.ts"

type ProjectMessage = {type: "project", name: string, data: string}
type ResultMessage = {type: "result", id: number, ok: boolean, value?: unknown, error?: string}
export type ToolResult = {ok: boolean, value?: unknown, error?: string}
type Pending = {resolve: (result: ToolResult) => void, timer: number}

// A2 live bridge (studio side), bidirectional:
// - receives `project` pushes and opens them (code-editor openProject flow)
// - sends `tool` calls and awaits `result` replies (used by the chat sidebar)
export class AiBridgeClient implements Terminable {
  static #current: Optional<AiBridgeClient> = undefined

  static connect(service: StudioService, url: string): void { AiBridgeClient.#current = new AiBridgeClient(service, url) }
  static get(): Optional<AiBridgeClient> { return AiBridgeClient.#current }

  readonly #service: StudioService
  readonly #url: string
  readonly #pending = new Map<number, Pending>()
  #socket: Optional<WebSocket> = undefined
  #terminated = false
  #id = 0

  constructor(service: StudioService, url: string) {
    this.#service = service
    this.#url = url
    this.#connect()
  }

  get connected(): boolean { return this.#socket?.readyState === WebSocket.OPEN }

  callTool(name: string, args: unknown): Promise<ToolResult> { return this.#request({type: "tool", name, args}) }

  listTools(): Promise<ToolResult> { return this.#request({type: "list_tools"}) }

  #request(payload: Record<string, unknown>): Promise<ToolResult> {
    const socket = this.#socket
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ok: false, error: "Not connected to the openDAW bridge (start the MCP with --bridge and open the studio with ?ai-bridge)"})
    }
    const id = ++this.#id
    return new Promise<ToolResult>(resolve => {
      const timer = window.setTimeout(() => { this.#pending.delete(id); resolve({ok: false, error: `Request "${String(payload.type)}" timed out`}) }, 15000)
      this.#pending.set(id, {resolve, timer})
      socket.send(JSON.stringify({...payload, id}))
    })
  }

  #connect(): void {
    if (this.#terminated) {return}
    const socket = new WebSocket(this.#url)
    this.#socket = socket
    socket.onmessage = event => this.#onMessage(event.data)
    socket.onerror = () => socket.close()
    socket.onclose = () => { if (!this.#terminated) {window.setTimeout(() => this.#connect(), 2000)} }
  }

  #onMessage(raw: unknown): void {
    if (typeof raw !== "string") {return}
    const parsed = tryCatch(() => JSON.parse(raw) as ProjectMessage | ResultMessage)
    if (parsed.status !== "success") {return}
    const message = parsed.value
    if (message.type === "project") {
      this.#openProject(message)
    } else if (message.type === "result") {
      const pending = this.#pending.get(message.id)
      if (pending !== undefined) {
        window.clearTimeout(pending.timer)
        this.#pending.delete(message.id)
        pending.resolve({ok: message.ok, value: message.value, error: message.error})
      }
    }
  }

  #openProject(message: ProjectMessage): void {
    const bytes = Uint8Array.from(atob(message.data), char => char.charCodeAt(0))
    const boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
    boxGraph.fromArrayBuffer(bytes.buffer, false)
    const mandatoryBoxes = ProjectSkeleton.findMandatoryBoxes(boxGraph)
    const project = Project.fromSkeleton(this.#service, {boxGraph, mandatoryBoxes})
    this.#service.projectProfileService.setProject(project, message.name.length > 0 ? message.name : "AI Project")
    this.#service.switchScreen("default")
  }

  terminate(): void {
    this.#terminated = true
    for (const pending of this.#pending.values()) {window.clearTimeout(pending.timer)}
    this.#pending.clear()
    this.#socket?.close()
    this.#socket = undefined
    if (AiBridgeClient.#current === this) {AiBridgeClient.#current = undefined}
  }
}
