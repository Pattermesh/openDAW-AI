import {Option, Optional, Terminable, tryCatch} from "@opendaw/lib-std"
import {BoxGraph} from "@opendaw/lib-box"
import {BoxIO} from "@opendaw/studio-boxes"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {Project} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService.ts"

type BridgeMessage = {type: "project", name: string, data: string}

// A2 live bridge (studio side): connects to the claude-opendaw MCP server's
// WebSocket (started with `--bridge`) and opens any project the model pushes,
// reusing the same flow as the code editor's ScriptHost.openProject.
export class AiBridgeClient implements Terminable {
  static readonly #instances = new Set<AiBridgeClient>()

  // Start a session-long bridge client (kept referenced so it isn't garbage-collected).
  static connect(service: StudioService, url: string): void {
    AiBridgeClient.#instances.add(new AiBridgeClient(service, url))
  }

  readonly #service: StudioService
  readonly #url: string
  #socket: Optional<WebSocket> = undefined
  #terminated = false

  constructor(service: StudioService, url: string) {
    this.#service = service
    this.#url = url
    this.#connect()
  }

  #connect(): void {
    if (this.#terminated) {return}
    const socket = new WebSocket(this.#url)
    this.#socket = socket
    socket.onmessage = event => this.#onMessage(event.data)
    socket.onerror = () => socket.close()
    socket.onclose = () => { if (!this.#terminated) {self.setTimeout(() => this.#connect(), 2000)} }
  }

  #onMessage(raw: unknown): void {
    if (typeof raw !== "string") {return}
    const parsed = tryCatch(() => JSON.parse(raw) as BridgeMessage)
    if (parsed.status !== "success" || parsed.value.type !== "project") {return}
    const {name, data} = parsed.value
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
    const boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
    boxGraph.fromArrayBuffer(bytes.buffer, false)
    const mandatoryBoxes = ProjectSkeleton.findMandatoryBoxes(boxGraph)
    const project = Project.fromSkeleton(this.#service, {boxGraph, mandatoryBoxes})
    this.#service.projectProfileService.setProject(project, name.length > 0 ? name : "AI Project")
    this.#service.switchScreen("default")
  }

  terminate(): void {
    this.#terminated = true
    this.#socket?.close()
    this.#socket = undefined
    AiBridgeClient.#instances.delete(this)
  }
}
