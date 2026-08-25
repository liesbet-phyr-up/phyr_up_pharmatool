import { describe, expect, it } from "vitest";
import { calculateLearningProgress, getLearningStatus } from "./db";

describe("Maximed learning progress", () => {
  it("returns zero progress when a course has no learning modules", () => {
    expect(calculateLearningProgress(0, 0)).toBe(0);
  });

  it("rounds partially completed learning to a whole percentage", () => {
    expect(calculateLearningProgress(3, 2)).toBe(67);
    expect(getLearningStatus(67)).toBe("in_progress");
  });

  it("marks a course as completed only at full progress", () => {
    expect(calculateLearningProgress(4, 4)).toBe(100);
    expect(getLearningStatus(100)).toBe("completed");
  });
});
