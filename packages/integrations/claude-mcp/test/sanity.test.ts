import {describe, expect, it} from "vitest"
import {VERSION} from "../src/index"

describe("sanity", () => {
  it("exports a version", () => { expect(VERSION).toBe("0.0.1") })
})
