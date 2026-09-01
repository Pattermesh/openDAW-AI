import {describe, expect, it} from "vitest"
import {PPQN} from "@opendaw/lib-dsp"
import {parsePPQN, parsePitch} from "../src/time"

describe("time", () => {
  it("parses musical durations to PPQN", () => {
    expect(parsePPQN("1bar")).toBe(PPQN.Bar)
    expect(parsePPQN("1/8")).toBe(Math.round(PPQN.Bar / 8))
    expect(parsePPQN(480)).toBe(480)
  })
  it("parses note names to MIDI pitch", () => {
    expect(parsePitch("C4")).toBe(60)
    expect(parsePitch("A4")).toBe(69)
    expect(parsePitch(72)).toBe(72)
  })
})
