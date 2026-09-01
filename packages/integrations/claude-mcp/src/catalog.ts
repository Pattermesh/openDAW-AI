export const CATALOG = {
  instruments: [
    {name: "Vaporisateur", kind: "synth", description: "Subtractive synth (filters, LFO, unison, envelope)"},
    {name: "Playfield", kind: "sampler", description: "Sample-based MIDI playback"},
    {name: "Nano", kind: "synth", description: "Minimal synth / single sample"},
    {name: "Soundfont", kind: "sampler", description: "SoundFont (.sf2) player"},
    {name: "Tape", kind: "audio", description: "Sample-based audio playback"},
    {name: "MIDIOutput", kind: "midi", description: "External hardware MIDI out"}
  ],
  audioEffects: [
    {name: "delay", description: "Delay/echo with feedback, filter, dry/wet", params: ["delay", "feedback", "cross", "filter", "dry", "wet"]}
  ],
  midiEffects: [
    {name: "pitch", description: "Transpose by octaves/semitones/cents", params: ["octaves", "semiTones", "cents"]}
  ]
} as const
