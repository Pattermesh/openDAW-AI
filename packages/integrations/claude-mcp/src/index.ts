import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {createServer} from "./server.js"
import {StudioBridge} from "./bridge.js"

export const VERSION = "0.0.1"

const parsePort = (args: ReadonlyArray<string>): number => {
  const index = args.indexOf("--port")
  if (index >= 0 && index + 1 < args.length) {
    const value = Number(args[index + 1])
    if (!Number.isNaN(value)) return value
  }
  return 8765
}

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const bridge = args.includes("--bridge") ? new StudioBridge(parsePort(args)) : undefined
  const server = createServer(bridge)
  await server.connect(new StdioServerTransport())
}

if (process.argv[1]?.endsWith("index.js") === true || process.argv[1]?.endsWith("index.ts") === true) {
  void main()
}
