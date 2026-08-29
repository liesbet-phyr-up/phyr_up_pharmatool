import { COOKIE_NAME } from "@shared/const";
import type { Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

// Javin's correction (29 Aug): session TTL must be 8-12 hours, not one year.
export const SESSION_TTL_MS = 10 * 60 * 60 * 1000;

// Distinguishes first-party sessions from any legacy Manus JWT sharing the
// cookie name. Legacy tokens lack this marker and are rejected (fail closed).
const AUTHN_MARKER = "maximed-first-party";

export type FirstPartySession = {
  userId: number;
  email: string;
  name: string | null;
};

function getSecret(): Uint8Array {
  // Boot refuses to listen when JWT_SECRET is missing or whitespace
  // (see index.ts), so this is non-empty in any running server.
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signFirstPartySession(
  payload: FirstPartySession
): Promise<string> {
  return new SignJWT({
    authn: AUTHN_MARKER,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_TTL_MS) / 1000))
    .sign(getSecret());
}

export async function verifyFirstPartySession(
  token: string | undefined
): Promise<FirstPartySession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.authn !== AUTHN_MARKER) return null;
    if (typeof payload.sub !== "string" || payload.sub === "") return null;
    if (typeof payload.email !== "string" || payload.email === "") return null;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return {
      userId,
      email: payload.email,
      name:
        typeof payload.name === "string" && payload.name !== ""
          ? payload.name
          : null,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  const options = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...options, maxAge: SESSION_TTL_MS });
}
