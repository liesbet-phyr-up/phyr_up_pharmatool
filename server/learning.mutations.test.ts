import { beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  ensureActiveAccess: vi.fn(),
  recordModuleCompletion: vi.fn(),
  submitLearnerAssessment: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const original = await importOriginal<typeof import("./db")>();
  return { ...original, ...data };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function activeLearnerContext(): TrpcContext {
  return {
    user: {
      id: 24,
      openId: "maximed-active-learner",
      name: "Active Learner",
      email: "learner@maximed.example",
      loginMethod: "email",
      role: "learner",
      accessStatus: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("Maximed learning mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    data.ensureActiveAccess.mockResolvedValue(undefined);
  });

  it("persists module completion through the protected learning procedure", async () => {
    data.recordModuleCompletion.mockResolvedValue({ progressPercent: 67, status: "in_progress" });
    const caller = appRouter.createCaller(activeLearnerContext());

    await expect(caller.learning.completeModule({ moduleId: 88, acknowledgement: true })).resolves.toEqual({ progressPercent: 67, status: "in_progress" });
    expect(data.ensureActiveAccess).toHaveBeenCalledWith(24);
    expect(data.recordModuleCompletion).toHaveBeenCalledWith(24, 88, true);
  });

  it("returns the passed assessment outcome from the protected submit procedure", async () => {
    data.submitLearnerAssessment.mockResolvedValue({ attemptNumber: 1, scorePercent: 90, passed: true, attemptsRemaining: 2, passingMark: 80 });
    const caller = appRouter.createCaller(activeLearnerContext());

    await expect(caller.learning.submitAssessment({ assessmentId: 31, answers: { "1": "A", "2": "B" } })).resolves.toMatchObject({ passed: true, scorePercent: 90 });
    expect(data.submitLearnerAssessment).toHaveBeenCalledWith(31, 24, { "1": "A", "2": "B" });
  });

  it("preserves attempt-limit rejection from the assessment submission procedure", async () => {
    data.submitLearnerAssessment.mockRejectedValue(new Error("Attempt limit reached"));
    const caller = appRouter.createCaller(activeLearnerContext());

    await expect(caller.learning.submitAssessment({ assessmentId: 31, answers: { "1": "A" } })).rejects.toThrow("Attempt limit reached");
  });
});
