# DRAFT — Video in a channel (Shadertoy-style toolbox) + quick export

**Status:** DRAFT (open idea) · seeking a champion + design.

## Idea
A new **toolbox panel** (modeled on the existing Shadertoy panel) that loads a **video** into a
channel and plays it **synced to the transport**, so you can score against picture — plus a
**quick export** button right there.

## Why it fits
openDAW already has the Shadertoy workspace screen (a self-contained preview + editor panel). A
"Video" screen would mirror that pattern: a `<video>` element driven by the engine playhead
(`project.engine.position` → seconds via tempo), shown beside the timeline.

## Sketch
- New `PanelType.Video` + a `VideoPanel` (load a local file via object URL; seek to playhead; play/pause
  follows transport).
- Underpins [score-to-video.md](score-to-video.md): the reference picture + cue placement.
- **Quick export:** render the audio mixdown and (stretch) mux with the loaded video via ffmpeg.wasm,
  download in one click. v1: export the audio stem aligned to the video length.

## Open questions
- Transport↔video sync precision (seek vs. drift); who is the clock master?
- Export: audio-only first; muxing (ffmpeg.wasm) as a follow-up given bundle size.
- Where does the video live — purely in-session (object URL), not persisted in the `.od`?

Want this? Comment with an approach → we'll open an issue.
