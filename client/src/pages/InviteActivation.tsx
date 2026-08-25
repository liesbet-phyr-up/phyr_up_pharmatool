import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ChevronRight, MailCheck, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";

export default function InviteActivation() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const { user, loading, refresh } = useAuth();
  const redeem = trpc.auth.redeemInvite.useMutation({ onSuccess: async result => { await refresh(); setLocation(result.role === "learner" ? "/learn" : result.role === "trainer" ? "/training" : "/admin"); } });
  const canRedeem = Boolean(user && token);

  useEffect(() => {
    if (user?.accessStatus === "active") setLocation(user.role === "learner" ? "/learn" : user.role === "trainer" ? "/training" : "/admin");
  }, [setLocation, user]);

  return <main className="min-h-screen bg-[#F7F9FC] p-5 grid place-items-center"><section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 app-surface sm:p-9"><div className="flex items-center justify-between"><span className="maximed-wordmark text-xl text-[#093B88]">MAXIMED<sup>+</sup></span><span className="section-kicker text-[#DA0000]">Staff access</span></div><div className="mt-10 grid h-13 w-13 place-items-center rounded-2xl bg-[#EAF1FB] text-[#093B88]"><MailCheck className="h-7 w-7" /></div><h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950">Activate your learning access.</h1><p className="mt-3 text-sm leading-6 text-slate-600">This invitation activates a Maximed staff profile. Sign in with the exact email address the invitation was sent to, then confirm access below.</p><div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-[#093B88]" /><div><p className="text-sm font-extrabold text-slate-800">Access stays controlled</p><p className="mt-1 text-xs leading-5 text-slate-500">The link is single-use, is matched to its invited email address, and grants only the assigned Maximed role.</p></div></div></div>{loading ? <div className="mt-7 h-11 animate-pulse rounded-xl bg-slate-100" /> : !user ? <button onClick={() => startLogin()} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white">Sign in with invited email <ChevronRight className="h-4 w-4" /></button> : <><div className="mt-7 rounded-xl bg-[#EAF1FB] px-4 py-3 text-sm"><p className="font-extrabold text-[#093B88]">Signed in as {user.email || user.name || "Maximed staff"}</p></div><button disabled={!canRedeem || redeem.isPending} onClick={() => redeem.mutate({ token })} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{redeem.isPending ? "Activating…" : "Activate learning access"}<CheckCircle2 className="h-4 w-4" /></button></>}{redeem.error ? <p className="mt-4 text-sm font-bold text-[#DA0000]">{redeem.error.message}</p> : null}</section></main>;
}
