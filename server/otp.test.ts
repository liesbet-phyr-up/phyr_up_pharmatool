import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import {
  generateOtpCode,
  MailNotConfiguredError,
  OTP_TTL_MS,
  sendMail,
  storeOtp,
  verifyOtpCode,
} from "./_core/otp";

afterEach(() => {
  ENV.resendApiKey = "";
  ENV.mailFrom = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("otp store", () => {
  it("verifies a stored code exactly once", () => {
    const email = "staff@example.com";
    storeOtp(email, "123456");
    expect(verifyOtpCode(email, "123456")).toBe(true);
    expect(verifyOtpCode(email, "123456")).toBe(false); // single-use
  });

  it("rejects wrong codes and caps attempts", () => {
    const email = "staff@example.com";
    storeOtp(email, "123456");
    for (let i = 0; i < 5; i++) {
      expect(verifyOtpCode(email, "999999")).toBe(false);
    }
    // Attempts exhausted: even the correct code no longer works.
    expect(verifyOtpCode(email, "123456")).toBe(false);
  });

  it("expires codes after the TTL", () => {
    vi.useFakeTimers();
    const email = "staff@example.com";
    storeOtp(email, "123456");
    vi.advanceTimersByTime(OTP_TTL_MS + 1000);
    expect(verifyOtpCode(email, "123456")).toBe(false);
  });

  it("generates 6-digit codes", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("sendMail fail-closed", () => {
  it("throws MailNotConfiguredError when mail env is missing", async () => {
    ENV.resendApiKey = "";
    ENV.mailFrom = "";
    await expect(
      sendMail({ to: "a@b.co.za", subject: "s", html: "h" })
    ).rejects.toBeInstanceOf(MailNotConfiguredError);
  });

  it("sends via the provider when configured", async () => {
    ENV.resendApiKey = "re_test_dummy_key";
    ENV.mailFrom = "Maximed <no-reply@maximed.co.za>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await sendMail({ to: "a@b.co.za", subject: "s", html: "h" });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer re_test_dummy_key");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("throws when the provider rejects the message", async () => {
    ENV.resendApiKey = "re_test_dummy_key";
    ENV.mailFrom = "Maximed <no-reply@maximed.co.za>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(
        sendMail({ to: "a@b.co.za", subject: "s", html: "h" })
      ).rejects.toThrow(/HTTP 422/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
