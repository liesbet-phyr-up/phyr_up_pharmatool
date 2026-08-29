import { trpc } from "@/lib/trpc";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { postJson } from "@/lib/http";
import { ChevronRight, MailCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type VerifyResult = { role?: string };

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/auth/otp/request", { email });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<VerifyResult>("/api/auth/otp/verify", {
        email,
        code,
      });
      await utils.auth.me.invalidate();
      setLocation(
        result.role === "learner"
          ? "/learn"
          : result.role === "trainer"
            ? "/training"
            : "/admin"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F9FC] p-5 grid place-items-center">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 app-surface sm:p-9">
        <div className="flex items-center justify-between">
          <span className="maximed-wordmark text-xl text-[#093B88]">
            MAXIMED<sup>+</sup>
          </span>
          <span className="section-kicker text-[#DA0000]">Staff sign-in</span>
        </div>
        <div className="mt-10 grid h-13 w-13 place-items-center rounded-2xl bg-[#EAF1FB] text-[#093B88]">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950">
          Sign in to your learning.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter your Maximed staff email and we will send you a 6-digit code.
        </p>

        {step === "email" ? (
          <>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@maximed.co.za"
              autoComplete="email"
              className="mt-7 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none focus:border-[#093B88]"
            />
            <button
              disabled={busy || !email.includes("@")}
              onClick={requestCode}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {busy ? "Sending…" : "Email me a code"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <div className="mt-7 rounded-xl bg-[#EAF1FB] px-4 py-3 text-sm">
              <p className="font-extrabold text-[#093B88]">
                Code sent to {email}
              </p>
            </div>
            <div className="mt-5 flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                disabled={busy}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-10 rounded-lg border border-slate-200 text-lg font-extrabold text-[#093B88]"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              disabled={busy || code.length !== 6}
              onClick={verify}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              disabled={busy}
              onClick={() => setStep("email")}
              className="mt-3 w-full text-center text-xs font-bold text-slate-500 hover:text-[#093B88]"
            >
              Use a different email
            </button>
          </>
        )}

        <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#093B88]" />
            <div>
              <p className="text-sm font-extrabold text-slate-800">
                First time here?
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Use the invitation link sent to your staff email address to
                activate your access.
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm font-bold text-[#DA0000]">{error}</p>
        ) : null}
      </section>
    </main>
  );
}
