import {panic} from "@opendaw/lib-std"
import {ApiImpl, ScriptHostProtocol} from "@opendaw/studio-scripting"

const headlessProtocol: ScriptHostProtocol = {
  openProject: () => panic("openProject is unavailable in headless mode"),
  fetchProject: () => panic("fetchProject is unavailable in headless mode"),
  addSample: () => panic("addSample is unavailable in headless mode (no samples in v1)")
}

export const makeApi = (): ApiImpl => new ApiImpl(headlessProtocol)
