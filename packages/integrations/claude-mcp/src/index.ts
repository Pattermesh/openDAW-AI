import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js"
import {createServer} from "./server.js"

export const VERSION = "0.0.1"

const main = async (): Promise<void> => {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}

if (process.argv[1]?.endsWith("index.js") === true || process.argv[1]?.endsWith("index.ts") === true) {
  void main()
}
