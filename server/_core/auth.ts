import type { Express, Request, Response } from "express";
import { z } from "zod";
import * as db from "../db";
import {
  generateOtpCode,
  MailNotConfiguredError,
  sendOtpMail,
  storeOtp,
  verifyOtpCode,
} from "./otp";
import { createRateLimiter } from "./rateLimit";
import { setSessionCookie, signFirstPartySession } from "./session";

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const codeSchema = z.string().regex(/^\d{6}$/, "Code must be 6 digits");

const otpRequestLimiter = createRateLimiter(5, 15 * 60 * 1000);
const otpVerifyLimiter = createRateLimiter(10, 15 * 60 * 1000);
const redeemLimiter = createRateLimiter(10, 15 * 60 * 1000);

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

// POST /api/auth/otp/request — issue a 6-digit code to a known mailbox.
// Allowed only for an existing active account (returning login) or the holder
// of a pending invite (activation). Fails closed otherwise; fails closed if
// mail is not configured.
export async function handleOtpRequest(req: Request, res: Response): Promise<void> {
  const parsed = emailSchema.safeParse(req.body?.email);
  if (!parsed.success) {
    sendError(res, 400, "A valid email address is required");
    return;
  }
  const email = parsed.data;

  if (!otpRequestLimiter.allow(email)) {
    sendError(res, 429, "Too many code requests. Wait a few minutes and try again.");
    return;
  }

  const user = await db.getUserByEmail(email);
  const isActiveLogin = Boolean(user && user.accessStatus === "active");
  const hasInvite = await db.hasPendingInviteForEmail(email);

  if (!isActiveLogin && !hasInvite) {
    sendError(res, 404, "No active Maximed account for this email address.");
    return;
  }

  const code = generateOtpCode();
  try {
    await sendOtpMail(email, code);
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      sendError(res, 503, "Email delivery is not configured yet. Contact your administrator.");
    } else {
      console.error("[Auth] Failed to send OTP mail", error);
      sendError(res, 502, "Email delivery failed. Please try again shortly.");
    }
    return;
  }

  // Store only after a successful send: a code that was never delivered
  // cannot be verified.
  storeOtp(email, code);
  res.status(200).json({ ok: true });
}

// POST /api/auth/otp/verify — verify the code and start a session.
export async function handleOtpVerify(req: Request, res: Response): Promise<void> {
  const email = emailSchema.safeParse(req.body?.email);
  const code = codeSchema.safeParse(req.body?.code);
  if (!email.success || !code.success) {
    sendError(res, 400, "Email and 6-digit code are required");
    return;
  }

  if (!otpVerifyLimiter.allow(email.data)) {
    sendError(res, 429, "Too many attempts. Wait a few minutes and try again.");
    return;
  }

  if (!verifyOtpCode(email.data, code.data)) {
    sendError(res, 401, "Invalid or expired code.");
    return;
  }

  const user = await db.getUserByEmail(email.data);
  if (!user || user.accessStatus !== "active") {
    sendError(res, 403, "This account is not active. Use your invitation link to activate access.");
    return;
  }

  const token = await signFirstPartySession({
    userId: user.id,
    email: user.email ?? email.data,
    name: user.name,
  });
  setSessionCookie(req, res, token);
  res.status(200).json({ ok: true, role: user.role, accessStatus: user.accessStatus });
}

// POST /api/auth/invite/redeem — activate an invite with a verified mailbox.
// Does NOT require a prior session (the old protected redeemInvite did).
export async function handleInviteRedeem(req: Request, res: Response): Promise<void> {
  const token = z.string().min(20).max(80).safeParse(req.body?.token);
  const email = emailSchema.safeParse(req.body?.email);
  const code = codeSchema.safeParse(req.body?.code);
  if (!token.success || !email.success || !code.success) {
    sendError(res, 400, "Invitation link, email, and code are required");
    return;
  }

  if (!redeemLimiter.allow(email.data)) {
    sendError(res, 429, "Too many attempts. Wait a few minutes and try again.");
    return;
  }

  if (!verifyOtpCode(email.data, code.data)) {
    sendError(res, 401, "Invalid or expired code.");
    return;
  }

  try {
    const result = await db.redeemStaffInviteByEmail(email.data, token.data);
    const sessionToken = await signFirstPartySession({
      userId: result.userId,
      email: result.email,
      name: null,
    });
    setSessionCookie(req, res, sessionToken);
    res.status(200).json({ ok: true, role: result.role, accessStatus: result.accessStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not redeem this invitation.";
    sendError(res, 400, message);
  }
}

export function registerAuthRoutes(app: Express) {
  const wrap = (handler: (req: Request, res: Response) => Promise<void>) => {
    return (req: Request, res: Response) => {
      handler(req, res).catch((error) => {
        console.error("[Auth] Unhandled route error", error);
        if (!res.headersSent) {
          sendError(res, 500, "Something went wrong. Please try again.");
        }
      });
    };
  };

  app.post("/api/auth/otp/request", wrap(handleOtpRequest));
  app.post("/api/auth/otp/verify", wrap(handleOtpVerify));
  app.post("/api/auth/invite/redeem", wrap(handleInviteRedeem));
}
