# ableton-mcp — analysis & mapping to openDAW

Our `claude-opendaw` MCP is modeled on **ableton-mcp** by Siddharth Ahuja
(<https://github.com/ahujasid/ableton-mcp>, MIT). This doc records how it works and maps its tool
taxonomy onto openDAW's scripting API.

## How ableton-mcp works (and why we can't copy it directly)

```
Claude Desktop/Cursor  ──MCP/stdio──▶  MCP server (Python, FastMCP)  ──JSON over TCP──▶  Remote Script
   (MCP host)          ◀──results───   AbletonConnection             ◀──localhost:9877──  inside Ableton
                                                                                          → Live Object Model
```

- Two processes bridged by a **raw TCP socket** (hardcoded port **9877**), JSON request/response.
- The Remote Script is a **Live control surface** copied into Ableton's `MIDI Remote Scripts` dir.
- **Why it doesn't transfer:** Ableton is a desktop app with an in-process Python API. openDAW runs
  in a **browser**. Our "in-app script" equivalent is the studio's `ScriptHost`/scripting `Api`, and
  our bridge must be browser-appropriate (WebSocket), or we skip the live bridge entirely and
  generate `.od` files offline. See [../design/mcp-architecture.md](../design/mcp-architecture.md).

## Full tool surface (21 tools)

| # | Tool | Params | Purpose |
|---|------|--------|---------|
| 1 | `get_session_info` | — | current session state |
| 2 | `get_track_info` | track_index | track detail |
| 3 | `create_midi_track` | index=-1 | new MIDI track |
| 4 | `create_clip` | track_index, clip_index, length=4.0 | new MIDI clip |
| 5 | `create_audio_clip` | track_index, clip_index, path | import audio to slot |
| 6 | `set_track_name` | track_index, name | rename track |
| 7 | `set_clip_name` | track_index, clip_index, name | rename clip |
| 8 | `set_tempo` | tempo | session BPM |
| 9 | `add_notes_to_clip` | track_index, clip_index, notes[] | notes: pitch,start_time,duration,velocity,mute |
| 10 | `fire_clip` | track_index, clip_index | launch clip |
| 11 | `stop_clip` | track_index, clip_index | stop clip |
| 12 | `start_playback` | — | transport play |
| 13 | `stop_playback` | — | transport stop |
| 14 | `get_browser_tree` | category_type="all" | browse instruments/sounds/drums/fx |
| 15 | `get_browser_items_at_path` | path | loadable items at a path |
| 16 | `load_instrument_or_effect` | track_index, uri | load device by browser URI |
| 17 | `load_drum_kit` | track_index, rack_uri, kit_path | load drum rack + kit |
| 18 | `switch_to_arrangement_view` | — | view switch |
| 19 | `set_arrangement_time` | time | move playhead (beats) |
| 20 | `get_arrangement_clips` | track_index | clips on the timeline |
| 21 | `duplicate_to_arrangement` | track_index, clip_index, destination_time | session→arrangement |

- **No** MCP resources or prompts — the whole surface is tools; "knowledge" lives in docstrings.
- Most tools carry a trailing `user_prompt=""` arg (telemetry/context).
- **Browser pattern:** tree-walk (`get_browser_tree` → `get_browser_items_at_path`) to obtain a
  machine-specific URI, then `load_*` by URI. URIs are **not guessable** and don't transfer machines.

## Known limitations (lessons for us)
- Default content only; URIs are installation-specific.
- Long arrangements **time out** — build incrementally.
- Operations are live and **not transactional/undo-safe** ("save first").
- One MCP host at a time; port 9877 hardcoded; no socket auth (localhost trust).
- Request/response only — **no push** of live state to the model.
- Community forks (LofiFren ~35 tools, jpoindexter 200+) reveal the gaps people hit:
  mixer/sends, return tracks, per-device parameter get/set & automation, deletes.

## Taxonomy → openDAW mapping

| Category | ableton-mcp | openDAW equivalent (scripting `Api`) |
|----------|-------------|--------------------------------------|
| Project introspection | get_session_info, get_track_info | read `project` / box-graph; build a `getProjectInfo` |
| Track lifecycle | create_midi_track, set_track_name | `addInstrumentUnit` + `addNoteTrack`/`addAudioTrack`; set labels |
| Clip/region lifecycle | create_clip, create_audio_clip, set_clip_name | `addRegion(props)` / `addRegion(sample, props)` |
| MIDI editing | add_notes_to_clip | `region.addEvents([{position,pitch,duration,velocity}])` |
| Transport | start/stop_playback, fire/stop_clip | `project.engine.play/stop/setPosition` |
| Global params | set_tempo | `project.bpm`, `project.timeSignature` |
| Device discovery | get_browser_tree, get_browser_items_at_path | **fixed catalog** — only 5 instruments + known effects; enumerate statically |
| Device loading | load_instrument_or_effect, load_drum_kit | `addInstrumentUnit(type)`, `addAudioEffect/addMIDIEffect(type, params)` |
| Timeline | arrangement tools | openDAW is timeline-native (PPQN positions); no session/arrangement split |

**Key advantage for us:** openDAW has **no machine-specific browser URIs** — its instruments/effects
are a small, fixed, code-named catalog. That removes ableton-mcp's biggest fragility (un-guessable
URIs) and lets the model pick devices by stable names. **Gaps worth covering from day one** (since
the `Api` supports them): mixer params (volume/pan/mute/solo), sends/aux/groups, and parameter
automation via `addValueTrack`.

## Sources
- <https://github.com/ahujasid/ableton-mcp> (`MCP_Server/server.py`, `AbletonMCP_Remote_Script/__init__.py`)
- <https://github.com/LofiFren/ableton-mcp-lofifren>, <https://github.com/jpoindexter/ableton-mcp>
