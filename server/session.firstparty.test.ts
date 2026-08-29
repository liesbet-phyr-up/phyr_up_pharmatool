import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import {
  SESSION_TTL_MS,
  signFirstPartySession,
  verifyFirstPartySession,
} from "./_core/session";
import { SignJWT } from "jose";

const TEST_SECRET = "test-session-secret";

describe("first-party session", () => {
  it("round-trips a signed session", async () => {
    const original = ENV.cookieSecret;
    ENV.cookieSecret = TEST_SECRET;
    try {
      const token = await signFirstPartySession({
        userId: 7,
        email: "rune@example.com",
        name: "Rune",
      });
      const session = await verifyFirstPartySession(token);
      expect(session).toMatchObject({
        userId: 7,
        email: "rune@example.com",
        name: "Rune",
      });
    } finally {
      ENV.cookieSecret = original;
    }
  });

  it("rejects tokens signed with a different secret", async () => {
    const original = ENV.cookieSecret;
    ENV.cookieSecret = TEST_SECRET;
    const token = await signFirstPartySession({
      userId: 1,
      email: "a@example.com",
      name: null,
    });
    ENV.cookieSecret = "a-different-secret";
    try {
      expect(await verifyFirstPartySession(token)).toBeNull();
    } finally {
      ENV.cookieSecret = original;
    }
  });

  it("rejects a legacy Manus-style JWT without the first-party marker", async () => {
    const original = ENV.cookieSecret;
    ENV.cookieSecret = TEST_SECRET;
    try {
      const legacy = await new SignJWT({
        openId: "some-open-id",
        appId: "some-app",
        name: "Legacy",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(new TextEncoder().encode(TEST_SECRET));
      expect(await verifyFirstPartySession(legacy)).toBeNull();
    } finally {
      ENV.cookieSecret = original;
    }
  });

  it("rejects garbage input", async () => {
    const original = ENV.cookieSecret;
    ENV.cookieSecret = TEST_SECRET;
    try {
      expect(await verifyFirstPartySession("not-a-jwt")).toBeNull();
      expect(await verifyFirstPartySession(undefined)).toBeNull();
      expect(await verifyFirstPartySession("")).toBeNull();
    } finally {
      ENV.cookieSecret = original;
    }
  });

  it("uses a TTL inside the 8-12 hour window", () => {
    expect(SESSION_TTL_MS).toBeGreaterThanOrEqual(8 * 60 * 60 * 1000);
    expect(SESSION_TTL_MS).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
  });
});
