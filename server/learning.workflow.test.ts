import { describe, expect, it } from "vitest";
import { buildModuleCompletionRecord, canSubmitAssessment, evaluateAssessment } from "./db";

describe("Maximed learning workflow rules", () => {
  it("creates a persistent completion record with acknowledgement time only when confirmed", () => {
    const completedAt = new Date("2026-08-25T10:00:00.000Z");
    expect(buildModuleCompletionRecord(5, 11, false, completedAt)).toEqual({ userId: 5, moduleId: 11, completedAt, acknowledgementConfirmedAt: null });
    expect(buildModuleCompletionRecord(5, 11, true, completedAt).acknowledgementConfirmedAt).toEqual(completedAt);
  });

  it("evaluates an assessment against its configured passing mark", () => {
    const questions = [{ id: 1, correctChoice: "A" }, { id: 2, correctChoice: "B" }, { id: 3, correctChoice: "C" }];
    expect(evaluateAssessment(questions, { "1": "A", "2": "B", "3": "C" }, 80)).toEqual({ scorePercent: 100, passed: true });
    expect(evaluateAssessment(questions, { "1": "A", "2": "X", "3": "C" }, 80)).toEqual({ scorePercent: 67, passed: false });
  });

  it("grades short answers without treating letter case or outer spaces as different answers", () => {
    const questions = [{ id: 1, correctChoice: "Refer to the pharmacist", questionType: "short_answer" as const }];
    expect(evaluateAssessment(questions, { "1": "  refer to the pharmacist  " }, 100)).toEqual({ scorePercent: 100, passed: true });
  });

  it("rejects additional submissions once the attempt limit is reached", () => {
    expect(canSubmitAssessment(2, 3)).toBe(true);
    expect(canSubmitAssessment(3, 3)).toBe(false);
  });
});
