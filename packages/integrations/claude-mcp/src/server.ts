import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import {Engine} from "./engine.js"
import {makeTools} from "./tools.js"
import {CATALOG} from "./catalog.js"
import {z} from "zod"

const GUIDE = `# Making music in openDAW via MCP

- Time is in PPQN. Pass raw ints, or strings like '1bar', '1/8', '1/16'. A bar = 4 quarter notes.
- Pitch is MIDI 0-127, or note names like 'C4' (= 60, middle C).
- Typical flow:
  1. create_project(name, bpm)
  2. add_instrument_track(instrument)  -> trackId
  3. add_note_region(trackId, position, duration)  -> regionId
  4. add_notes(regionId, notes)
  5. (optional) set_track_mix, add_aux + add_send, add_audio_effect
  6. get_project_info to verify, then export_project(path)
- Instruments: Vaporisateur (synth), Nano (synth), Playfield/Soundfont/Tape (samplers), MIDIOutput.
- Audio effects: delay. MIDI effects: pitch. See opendaw://catalog for details.
- v1 builds MIDI + synths only (no audio sample import).`

export const createServer = (): McpServer => {
  const engine = new Engine()
  const server = new McpServer({name: "claude-opendaw", version: "0.0.1"})
  for (const tool of makeTools(engine)) {
    server.registerTool(tool.name, {description: tool.description, inputSchema: tool.inputSchema.shape},
      async (args: Record<string, unknown>) => ({
        content: [{type: "text", text: JSON.stringify(tool.run(args))}]
      }))
  }
  server.registerResource("catalog", "opendaw://catalog", {description: "openDAW instruments & effects with parameters"},
    async uri => ({contents: [{uri: uri.href, mimeType: "application/json", text: JSON.stringify(CATALOG, null, 2)}]}))
  server.registerResource("guide", "opendaw://guide", {description: "How to make music in openDAW via MCP"},
    async uri => ({contents: [{uri: uri.href, mimeType: "text/markdown", text: GUIDE}]}))
  server.registerPrompt("compose",
    {description: "Plan a piece, then call tools to build it.",
     argsSchema: {style: z.string(), bars: z.string(), key: z.string().optional(), bpm: z.string().optional()}},
    ({style, bars, key, bpm}) => ({messages: [{role: "user", content: {type: "text",
      text: `Compose a ${style} piece, ${bars} bars`
        + `${key !== undefined ? `, key ${key}` : ""}${bpm !== undefined ? `, ${bpm} BPM` : ""}. `
        + `First read opendaw://guide and opendaw://catalog. Then call create_project, add_instrument_track, `
        + `add_note_region and add_notes (positions in PPQN, a bar = quarter*4). Check with get_project_info, then export_project.`}}]}))
  return server
}
