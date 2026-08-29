import type { Request, Response } from "express";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { signFirstPartySession } from "./_core/session";
import {
  briefingFor,
  contentVersionFor,
  getNalediPublicConfig,
  learnerSafeId,
  logNalediFailure,
  NALEDI_INSTRUCTION,
  pickCurrentModule,
} from "./naledi";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
  ensureActiveAccess: vi.fn(),
  getCourseWorkspace: vi.fn(),
}));

import * as db from "./db";
import {
  handleCurrentModule,
  handleNalediConfig,
  handleNalediSessionToken,
} from "./naledi.routes";

const dbMock = vi.mocked(db);

const ACTIVE_USER = {
  id: 17,
  openId: "mail:identity",
  name: "Elize",
  email: "elize@example.com",
  loginMethod: "email",
  role: "learner" as const,
  accessStatus: "active" as const,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  lastSignedIn: new Date("2026-08-01T00:00:00.000Z"),
};

function makeReq(opts: {
  query?: Record<string, unknown>;
  body?: unknown;
  cookie?: string;
}): Request {
  return {
    query: opts.query ?? {},
    body: opts.body ?? {},
    headers: opts.cookie ? { cookie: opts.cookie } : {},
    protocol: "https",
  } as unknown as Request;
}

type FakeRes = { statusCode: number; body: unknown; headersSent: boolean };

function makeRes(): { res: Response; state: FakeRes } {
  const state: FakeRes = { statusCode: 200, body: null, headersSent: false };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

async function authedCookie(): Promise<string> {
  const token = await signFirstPartySession({
    userId: ACTIVE_USER.id,
    email: ACTIVE_USER.email!,
    name: ACTIVE_USER.name,
  });
  return `app_session_id=${token}`;
}

beforeAll(() => {
  ENV.cookieSecret = "test-session-secret-naledi";
});

beforeEach(() => {
  vi.clearAllMocks();
  ENV.nalediEnabled = "true";
  ENV.anamPersonaId = "persona-placeholder";
  ENV.anamApiKey = "";
  dbMock.getUserById.mockResolvedValue(ACTIVE_USER);
  dbMock.ensureActiveAccess.mockResolvedValue(undefined);
});

describe("Naledi feature flag", () => {
  it("fails closed when the flag is off", () => {
    ENV.nalediEnabled = "";
    expect(getNalediPublicConfig()).toEqual({ enabled: false });
  });

  it("fails closed when persona id is missing", () => {
    ENV.anamPersonaId = "  ";
    expect(getNalediPublicConfig()).toEqual({ enabled: false });
  });

  it("uses widget auth when enabled without an API key", () => {
    ENV.anamApiKey = "";
    expect(getNalediPublicConfig()).toMatchObject({
      enabled: true,
      authMode: "widget",
      personaId: "persona-placeholder",
    });
  });

  it("prefers session-token auth when the API key is present", () => {
    ENV.anamApiKey = "anam_test_key";
    expect(getNalediPublicConfig()).toMatchObject({
      enabled: true,
      authMode: "session-token",
    });
  });

  it("does not put the API key on the public config object", () => {
    ENV.anamApiKey = "anam_test_key";
    expect(JSON.stringify(getNalediPublicConfig())).not.toContain("anam_test_key");
  });
});

describe("current module selection", () => {
  const modules = [
    { id: 2, position: 2, completedAt: null as Date | null },
    { id: 1, position: 1, completedAt: new Date("2026-08-20T00:00:00.000Z") },
    { id: 3, position: 3, completedAt: null as Date | null },
  ];

  it("picks the first incomplete module by position", () => {
    expect(pickCurrentModule(modules)?.id).toBe(2);
  });

  it("honours a requested module id that belongs to the course", () => {
    expect(pickCurrentModule(modules, 3)?.id).toBe(3);
  });

  it("ignores a requested module id that does not belong to the course", () => {
    expect(pickCurrentModule(modules, 99)?.id).toBe(2);
  });

  it("falls back to the first module when all are complete", () => {
    const done = modules.map((module) => ({ ...module, completedAt: new Date() }));
    expect(pickCurrentModule(done)?.id).toBe(1);
  });

  it("returns null for an empty course", () => {
    expect(pickCurrentModule([])).toBeNull();
  });
});

describe("learner-safe identifiers and versions", () => {
  it("does not echo the numeric user id or email", () => {
    const id = learnerSafeId(17);
    expect(id).toHaveLength(16);
    expect(id).not.toContain("17");
    expect(id).not.toContain("elize");
  });

  it("is stable for the same user id", () => {
    expect(learnerSafeId(17)).toBe(learnerSafeId(17));
  });

  it("changes contentVersion when approved text changes", () => {
    const a = contentVersionFor({ id: 1, title: "pH", body: "old" });
    const b = contentVersionFor({ id: 1, title: "pH", body: "new" });
    expect(a).not.toBe(b);
  });
});

describe("briefing", () => {
  it("includes Naledi rules and approved text only", () => {
    const text = briefingFor({
      learnerId: "abc",
      moduleId: 1,
      moduleTitle: "Pharmacy Staff Training: Vaginal Infections & The Power of pH.",
      content: {
        text: "Approved pH teaching copy.",
        moduleType: "lesson",
        courseId: 4,
        courseTitle: "Pharmacy Staff Training: Vaginal Infections & The Power of pH.",
      },
      contentVersion: "deadbeef",
      instruction: NALEDI_INSTRUCTION,
    });
    expect(text).toContain("Approved pH teaching copy.");
    expect(text).toContain("Do not diagnose");
    expect(text).toContain("Naledi");
    expect(text).not.toContain("elize@example.com");
  });
});

describe("logging", () => {
  it("does not print API keys, JWTs, OTP codes, or transcripts", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logNalediFailure("session-start", { reason: "anam-rejected", status: 401 });
    const printed = String(spy.mock.calls[0]?.[0] ?? "");
    spy.mockRestore();
    expect(printed).toContain("[Naledi] session-start failed");
    expect(printed).not.toMatch(/anam_test_key|Bearer |otp|transcript/i);
  });
});

describe("handleNalediConfig", () => {
  it("returns 401 without a session cookie", async () => {
    const { res, state } = makeRes();
    await handleNalediConfig(makeReq({}), res);
    expect(state.statusCode).toBe(401);
  });

  it("hides Naledi when the flag is off", async () => {
    ENV.nalediEnabled = "false";
    const { res, state } = makeRes();
    await handleNalediConfig(makeReq({ cookie: await authedCookie() }), res);
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ enabled: false });
  });
});

describe("handleCurrentModule", () => {
  it("rejects a client-supplied learner id", async () => {
    const { res, state } = makeRes();
    await handleCurrentModule(
      makeReq({ query: { courseId: "1", learnerId: "99" }, cookie: await authedCookie() }),
      res
    );
    expect(state.statusCode).toBe(400);
    expect(dbMock.getCourseWorkspace).not.toHaveBeenCalled();
  });

  it("resolves the learner from the JWT cookie, not the query string", async () => {
    dbMock.getCourseWorkspace.mockResolvedValue({
      course: {
        id: 4,
        title: "Pharmacy Staff Training: Vaginal Infections & The Power of pH.",
        status: "published",
        updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      },
      modules: [
        {
          id: 11,
          title: "The Power of pH",
          moduleType: "lesson",
          body: "Approved pH teaching copy.",
          resourceUrl: null,
          position: 1,
          estimatedMinutes: 10,
          isRequired: 1,
          completedAt: null,
          acknowledgementConfirmedAt: null,
        },
      ],
      enrollment: null,
    } as Awaited<ReturnType<typeof db.getCourseWorkspace>>);

    const { res, state } = makeRes();
    await handleCurrentModule(
      makeReq({ query: { courseId: "4" }, cookie: await authedCookie() }),
      res
    );
    expect(state.statusCode).toBe(200);
    expect(dbMock.getCourseWorkspace).toHaveBeenCalledWith(4, ACTIVE_USER.id);
    const body = state.body as Record<string, unknown>;
    expect(body.moduleId).toBe(11);
    expect(body.moduleTitle).toBe("The Power of pH");
    expect(body.learnerId).toBe(learnerSafeId(ACTIVE_USER.id));
    expect(JSON.stringify(body)).not.toContain("elize@example.com");
    expect(body).not.toHaveProperty("resourceUrl");
    expect(body).toHaveProperty("contentVersion");
    expect(body).toHaveProperty("instruction");
  });

  it("returns 404 for a draft course", async () => {
    dbMock.getCourseWorkspace.mockResolvedValue({
      course: { id: 4, title: "Draft", status: "draft", updatedAt: new Date() },
      modules: [],
      enrollment: null,
    } as Awaited<ReturnType<typeof db.getCourseWorkspace>>);
    const { res, state } = makeRes();
    await handleCurrentModule(
      makeReq({ query: { courseId: "4" }, cookie: await authedCookie() }),
      res
    );
    expect(state.statusCode).toBe(404);
  });
});

describe("handleNalediSessionToken", () => {
  it("returns widget fallback when the API key is unset", async () => {
    ENV.anamApiKey = "";
    const { res, state } = makeRes();
    await handleNalediSessionToken(makeReq({ cookie: await authedCookie() }), res);
    expect(state.statusCode).toBe(503);
    expect(state.body).toMatchObject({ fallback: "widget" });
  });

  it("mints a session token without logging the API key", async () => {
    ENV.anamApiKey = "anam_secret_key_value";
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionToken: "anam-session-token" }),
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { res, state } = makeRes();
      await handleNalediSessionToken(makeReq({ cookie: await authedCookie() }), res);
      expect(state.statusCode).toBe(200);
      expect(state.body).toEqual({ sessionToken: "anam-session-token" });
      const authHeader = (fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers
        .Authorization;
      expect(authHeader).toBe("Bearer anam_secret_key_value");
      expect(JSON.stringify(spy.mock.calls)).not.toContain("anam_secret_key_value");
    } finally {
      globalThis.fetch = original;
      spy.mockRestore();
    }
  });

  it("does not break closed when Anam is down — returns 502", async () => {
    ENV.anamApiKey = "anam_secret_key_value";
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    try {
      const { res, state } = makeRes();
      await handleNalediSessionToken(makeReq({ cookie: await authedCookie() }), res);
      expect(state.statusCode).toBe(502);
    } finally {
      globalThis.fetch = original;
    }
  });
});
