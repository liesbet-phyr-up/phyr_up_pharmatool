import type { Request, Response } from "express";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import {
  handleInviteRedeem,
  handleOtpRequest,
  handleOtpVerify,
} from "./_core/auth";
import { MailNotConfiguredError, storeOtp } from "./_core/otp";

// Mock the DB layer: route handlers must not touch a real database in tests.
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  hasPendingInviteForEmail: vi.fn(),
  redeemStaffInviteByEmail: vi.fn(),
}));

import * as db from "./db";

const dbMock = vi.mocked(db);

function makeReq(body: unknown): Request {
  return {
    body,
    headers: {},
    protocol: "https",
  } as unknown as Request;
}

type FakeRes = {
  statusCode: number;
  body: unknown;
  cookieArgs: [string, string, Record<string, unknown>][];
  headersSent: boolean;
};

function makeRes(): { res: Response; state: FakeRes } {
  const state: FakeRes = {
    statusCode: 200,
    body: null,
    cookieArgs: [],
    headersSent: false,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      state.cookieArgs.push([name, value, options]);
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

const ACTIVE_USER = {
  id: 1,
  openId: "mail:identity",
  name: null,
  email: "staff@example.com",
  loginMethod: "email",
  role: "learner" as const,
  accessStatus: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

beforeAll(() => {
  ENV.cookieSecret = "test-session-secret";
});

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getUserByEmail.mockReset();
  dbMock.hasPendingInviteForEmail.mockReset();
  dbMock.redeemStaffInviteByEmail.mockReset();
});

describe("handleOtpRequest", () => {
  it("returns 404 for an unknown mailbox with no invite", async () => {
    dbMock.getUserByEmail.mockResolvedValue(undefined);
    dbMock.hasPendingInviteForEmail.mockResolvedValue(false);
    const { res, state } = makeRes();
    await handleOtpRequest(makeReq({ email: "nobody@example.com" }), res);
    expect(state.statusCode).toBe(404);
  });

  it("fails closed (503) when mail is not configured", async () => {
    dbMock.getUserByEmail.mockResolvedValue(ACTIVE_USER);
    dbMock.hasPendingInviteForEmail.mockResolvedValue(false);
    const { res, state } = makeRes();
    await handleOtpRequest(makeReq({ email: "staff@example.com" }), res);
    expect(state.statusCode).toBe(503);
  });

  it("issues a code for an active account when mail is configured", async () => {
    dbMock.getUserByEmail.mockResolvedValue(ACTIVE_USER);
    dbMock.hasPendingInviteForEmail.mockResolvedValue(false);
    ENV.resendApiKey = "re_test_dummy_key";
    ENV.mailFrom = "Maximed <no-reply@maximed.co.za>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { res, state } = makeRes();
      await handleOtpRequest(makeReq({ email: "staff@example.com" }), res);
      expect(state.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = original;
      ENV.resendApiKey = "";
      ENV.mailFrom = "";
    }
  });

  it("allows OTP for a pending invite even without an existing account", async () => {
    dbMock.getUserByEmail.mockResolvedValue(undefined);
    dbMock.hasPendingInviteForEmail.mockResolvedValue(true);
    ENV.resendApiKey = "re_test_dummy_key";
    ENV.mailFrom = "Maximed <no-reply@maximed.co.za>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { res, state } = makeRes();
      await handleOtpRequest(makeReq({ email: "new@example.com" }), res);
      expect(state.statusCode).toBe(200);
    } finally {
      globalThis.fetch = original;
      ENV.resendApiKey = "";
      ENV.mailFrom = "";
    }
  });
});

describe("handleOtpVerify", () => {
  it("rejects an invalid code", async () => {
    dbMock.getUserByEmail.mockResolvedValue(ACTIVE_USER);
    const { res, state } = makeRes();
    await handleOtpVerify(
      makeReq({ email: "staff@example.com", code: "000000" }),
      res
    );
    expect(state.statusCode).toBe(401);
    expect(state.cookieArgs).toHaveLength(0);
  });

  it("starts a session for a verified active account", async () => {
    dbMock.getUserByEmail.mockResolvedValue(ACTIVE_USER);
    storeOtp("staff@example.com", "123456");
    const { res, state } = makeRes();
    await handleOtpVerify(
      makeReq({ email: "staff@example.com", code: "123456" }),
      res
    );
    expect(state.statusCode).toBe(200);
    expect(state.cookieArgs).toHaveLength(1);
    expect(state.cookieArgs[0]?.[0]).toBe("app_session_id");
    expect(state.cookieArgs[0]?.[2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
    });
    expect(state.body).toMatchObject({ role: "learner", accessStatus: "active" });
  });

  it("refuses to start a session for a non-active account", async () => {
    dbMock.getUserByEmail.mockResolvedValue({
      ...ACTIVE_USER,
      accessStatus: "pending" as const,
    });
    storeOtp("staff@example.com", "123456");
    const { res, state } = makeRes();
    await handleOtpVerify(
      makeReq({ email: "staff@example.com", code: "123456" }),
      res
    );
    expect(state.statusCode).toBe(403);
    expect(state.cookieArgs).toHaveLength(0);
  });
});

describe("handleInviteRedeem", () => {
  it("redeems with a verified mailbox and no prior session", async () => {
    dbMock.redeemStaffInviteByEmail.mockResolvedValue({
      userId: 5,
      email: "new@example.com",
      role: "learner" as const,
      accessStatus: "active" as const,
    });
    storeOtp("new@example.com", "123456");
    const { res, state } = makeRes();
    await handleInviteRedeem(
      makeReq({
        token: "a".repeat(32),
        email: "new@example.com",
        code: "123456",
      }),
      res
    );
    expect(state.statusCode).toBe(200);
    expect(state.cookieArgs).toHaveLength(1);
    expect(dbMock.redeemStaffInviteByEmail).toHaveBeenCalledWith(
      "new@example.com",
      "a".repeat(32)
    );
    expect(state.body).toMatchObject({ role: "learner", accessStatus: "active" });
  });

  it("rejects a wrong code before touching the invite", async () => {
    const { res, state } = makeRes();
    await handleInviteRedeem(
      makeReq({
        token: "a".repeat(32),
        email: "new@example.com",
        code: "000000",
      }),
      res
    );
    expect(state.statusCode).toBe(401);
    expect(dbMock.redeemStaffInviteByEmail).not.toHaveBeenCalled();
  });

  it("surfaces invite errors as 400", async () => {
    dbMock.redeemStaffInviteByEmail.mockRejectedValue(
      new Error("This invitation link has already been used")
    );
    storeOtp("new@example.com", "123456");
    const { res, state } = makeRes();
    await handleInviteRedeem(
      makeReq({
        token: "a".repeat(32),
        email: "new@example.com",
        code: "123456",
      }),
      res
    );
    expect(state.statusCode).toBe(400);
    expect(state.body).toMatchObject({
      error: "This invitation link has already been used",
    });
  });
});

// Keep the import referenced so tree-shaking never drops the error class in
// this test module (used above via thrown instances from the real otp module).
void MailNotConfiguredError;
