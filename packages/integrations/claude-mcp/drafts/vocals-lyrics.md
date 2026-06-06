# DRAFT — Vocals with lyrics + preview tooltip

**Status:** DRAFT (open idea) · seeking a champion + design.

## Idea
Vocal tracks that carry **lyrics**, line-by-line, aligned to the timeline — with a **preview tooltip**
showing the lyric for a region/word on hover (if the panel system allows tooltips there).

## Why it fits
openDAW has audio tracks/regions; regions already carry a `label`. Lyrics could live as structured
region metadata (lines with positions). The studio uses custom JSX panels, so a hover tooltip on a
vocal region rendering the lyric line is plausible.

## Sketch
- Lyrics model: `[{position, text}]` attached to a vocal track (region metadata or a lyric-track).
- MCP tool: `add_lyrics(trackId, lines)` and/or `set_region_lyric(regionId, text)`.
- UI: a tooltip on the vocal region showing the active/hovered line ("if possible" — depends on the
  region renderer supporting hover tooltips).
- Stretch: align lyrics to a melody (one syllable per note) for topline writing.

## Open questions
- Region metadata vs. a dedicated lyric box type?
- Does the timeline region component support per-region tooltips cleanly?
- Vocal *audio* needs sample import (out of MCP v1) — start with lyric metadata + MIDI topline?

Want this? Comment with an approach → we'll open an issue.
