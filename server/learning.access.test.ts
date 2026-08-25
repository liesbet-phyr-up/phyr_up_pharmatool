import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "learner" | "trainer" | "admin"): TrpcContext {
  return {
    user: {
      id: 17,
      openId: "maximed-test-user",
      name: "Maximed Test User",
      email: "test@maximed.example",
      loginMethod: "email",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("Maximed role boundaries", () => {
  it("does not allow learners to open trainer reporting", async () => {
    const caller = appRouter.createCaller(contextFor("learner"));
    await expect(caller.staff.overview({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not allow trainers to manage administrator-only people settings", async () => {
    const caller = appRouter.createCaller(contextFor("trainer"));
    await expect(caller.admin.people()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
