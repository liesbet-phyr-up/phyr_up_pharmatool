import { createHash, randomInt } from "node:crypto";
import { ENV } from "./env";

export const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Mail is not configured. Set MAIL_FROM and RESEND_API_KEY.");
    this.name = "MailNotConfiguredError";
  }
}

type OtpRecord = { hash: string; expiresAt: number; attempts: number };

// In-memory OTP store. Scope note: single-process (one Railway instance).
// Codes are stored hashed, expire after OTP_TTL_MS, and allow at most
// OTP_MAX_ATTEMPTS guesses.
const otps = new Map<string, OtpRecord>();

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

// Store AFTER mail delivery succeeds, so a failed send never leaves a usable
// code behind (fail closed).
export function storeOtp(email: string, code: string): void {
  otps.set(email, {
    hash: hashCode(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
}

export function verifyOtpCode(email: string, code: string): boolean {
  const record = otps.get(email);
  if (!record) return false;
  if (record.expiresAt < Date.now()) {
    otps.delete(email);
    return false;
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    otps.delete(email);
    return false;
  }
  const matches = record.hash === hashCode(code);
  if (matches) {
    otps.delete(email);
    return true;
  }
  record.attempts += 1;
  if (record.attempts >= OTP_MAX_ATTEMPTS) otps.delete(email);
  return false;
}

export async function sendOtpMail(email: string, code: string): Promise<void> {
  await sendMail({
    to: email,
    subject: "Your Maximed sign-in code",
    html: [
      '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">',
      "<h2>Your Maximed sign-in code</h2>",
      `<p>Use this code to sign in or activate your learning access:</p>`,
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
      "<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>",
      "</div>",
    ].join(""),
  });
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = ENV.resendApiKey;
  const from = ENV.mailFrom;
  if (!apiKey || !from) {
    // Fail closed: never pretend to send.
    throw new MailNotConfiguredError();
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mail provider rejected the message (HTTP ${response.status})`);
  }
}
