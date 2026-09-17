import { describe, expect, it } from "vitest";
import { adaptiveWindowResult } from "./adaptive-effects";

describe("adaptive effect sampling", () => {
  it("requires two consecutive sufficiently sampled slow windows", () => {
    expect(adaptiveWindowResult(0, 60, 13)).toEqual({ badWindows: 1, degrade: false });
    expect(adaptiveWindowResult(1, 60, 13)).toEqual({ badWindows: 2, degrade: true });
  });

  it("resets after a healthy window and ignores sparse background samples", () => {
    expect(adaptiveWindowResult(1, 60, 12)).toEqual({ badWindows: 0, degrade: false });
    expect(adaptiveWindowResult(1, 10, 10)).toEqual({ badWindows: 0, degrade: false });
  });
});
