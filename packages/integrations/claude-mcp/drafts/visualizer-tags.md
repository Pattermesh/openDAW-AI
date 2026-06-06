# DRAFT — Visualizer effect tags mid-track

**Status:** DRAFT (open idea) · seeking a champion + design.

## Idea
Let artists (or the AI) drop **tags at points in the timeline** that trigger visualizer effects —
"drop the beat → bloom", "breakdown → glitch" — so the visuals follow the music automatically.

## Why it fits openDAW
openDAW already ships a **Shadertoy** panel (`ShadertoyPreview` / `ShadertoyEditor`) and a
**marker-track** on the timeline. A visualizer tag is a marker carrying a visual directive
(effect name + params + transition), read by the Shadertoy preview during playback.

## Sketch
- A `visualizer_tag` MCP tool: `add_visual_tag(position, effect, params?, transition?)`.
- Store tags on (or alongside) the marker-track; the Shadertoy preview subscribes to the playhead
  and applies the active tag's effect.
- The AI can place tags from musical structure ("add a bloom on every chorus").

## Open questions
- Effect vocabulary: a fixed preset set vs. arbitrary shader uniforms?
- How do tags map onto Shadertoy's uniforms without authoring a shader each time?
- Persist tags in the project (new box type) vs. a sidecar?

Want this? Comment with an approach → we'll open an issue.
