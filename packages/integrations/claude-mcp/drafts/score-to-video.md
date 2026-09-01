# DRAFT — Score music to video (ads, trailers, background scores)

**Status:** DRAFT (open idea) · seeking a champion + design.

## Idea
Load a **reference video**, then compose/score music **against it** — hit cues at timecodes, match
energy to scene changes. Aimed at ads, trailers, background scores, and sync work.

## Why it fits
openDAW is timeline-native (PPQN at a known tempo → maps to seconds). With a video reference shown
against the timeline (see [video-channel.md](video-channel.md)), the AI can place sections/hits at
specific times: "build tension from 0:08, hit at 0:12, resolve by 0:20."

## Sketch
- Depends on a video-in-a-channel toolbox (separate draft) for the reference + playhead sync.
- MCP helpers: `seconds_to_ppqn(bpm, seconds)` and a `cue` concept (`add_cue(timecode, intent)`).
- The AI reads cues + tempo and builds regions/automation to land on them.
- "Ad mode" preset: short-form structure (intro/hook/CTA), loudness targets.

## Open questions
- Tempo strategy for hitting arbitrary timecodes (variable tempo vs. fixed + placement)?
- How precise can MIDI placement be against frame-accurate cues?
- Export: audio stem vs. muxed-with-video (see video-channel draft)?

Want this? Comment with an approach → we'll open an issue.
