// Musical input parsing, resolved server-side so the model can speak naturally.
// parsePPQN: ints, "1bar", or fractions like "1/8" -> pulses (PPQN.Bar based).
// parsePitch: ints or note names like "C4" -> MIDI number via a 12-tone table.
import {PPQN} from "@opendaw/lib-dsp"

export const parsePPQN = (value: number | string): number => {
  if (typeof value === "number") return value
  const text = value.trim().toLowerCase()
  const bars = text.match(/^(\d+(?:\.\d+)?)\s*bar(?:s)?$/)
  if (bars !== null) return Math.round(PPQN.Bar * parseFloat(bars[1]))
  const frac = text.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac !== null) return Math.round(PPQN.Bar * (parseInt(frac[1]) / parseInt(frac[2])))
  const num = Number(text)
  if (!Number.isNaN(num)) return num
  throw new Error(`Cannot parse PPQN from "${value}"`)
}

const NOTE_INDEX: Record<string, number> = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11}

export const parsePitch = (value: number | string): number => {
  if (typeof value === "number") return value
  const match = value.trim().toLowerCase().match(/^([a-g])(#|b)?(-?\d+)$/)
  if (match === null) throw new Error(`Cannot parse pitch from "${value}"`)
  const [, letter, accidental, octave] = match
  const semis = NOTE_INDEX[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0)
  return (parseInt(octave) + 1) * 12 + semis
}
