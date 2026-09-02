import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { BookOpen, ChevronRight, ClipboardCheck, LogOut, Menu, Settings2, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type Space = "learner" | "trainer" | "admin";

const navBySpace = {
  learner: [
    { label: "My learning", path: "/learn", icon: BookOpen },
    { label: "Learning pathways", path: "/learn#pathways", icon: ClipboardCheck },
  ],
  trainer: [
    { label: "Training overview", path: "/training", icon: ClipboardCheck },
    { label: "Learner results", path: "/training#learners", icon: UsersRound },
  ],
  admin: [
    { label: "Administration", path: "/admin", icon: Settings2 },
    { label: "People & permissions", path: "/admin#people", icon: UsersRound },
    { label: "Learning catalogue", path: "/admin/courses", icon: BookOpen },
  ],
};

function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`maximed-wordmark text-xl ${inverse ? "text-white" : "text-[#093B88]"}`}>MAXIMED<sup>+</sup></span>;
}

export function RoleAccess({ allowed, children, title }: { allowed: Array<"learner" | "trainer" | "admin">; children: React.ReactNode; title: string }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#093B88]" /></div>;
  if (!user) return <AccessPanel title={title} message="This area is available to Maximed staff after signing in with their provided access link." />;
  if (user.accessStatus !== "active") return <AccessPanel title="Activate your Maximed access" message="This account is not active yet. Open the staff invitation link sent to your Maximed email address, then sign in with that same email to activate access." signedIn />;
  if (!allowed.includes(user.role)) return <AccessPanel title="This area is restricted" message="Your Maximed account does not have permission to access this workspace." signedIn />;
  return <>{children}</>;
}

function AccessPanel({ title, message, signedIn = false }: { title: string; message: string; signedIn?: boolean }) {
  const { logout } = useAuth();
  return (
    <main className="min-h-screen bg-slate-50 p-5 grid place-items-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center app-surface">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#EAF1FB] text-[#093B88]"><BookOpen className="h-6 w-6" /></div>
        <div className="mt-6"><Wordmark /><p className="section-kicker mt-4 text-[#DA0000]">Learning platform</p><h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{message}</p></div>
        <button onClick={() => signedIn ? logout() : startLogin()} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-bold text-white transition-transform duration-150 active:scale-[0.98]">{signedIn ? "Sign out" : "Sign in with email"}<ChevronRight className="h-4 w-4" /></button>
      </div>
    </main>
  );
}

export function MaximedShell({ space, children, eyebrow, title, description }: { space: Space; children: React.ReactNode; eyebrow: string; title: string; description: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const navItems = navBySpace[space];
  const isStaffSpace = space === "trainer" || space === "admin";

  const sideNavigation = (
    <nav className="space-y-1">
      {navItems.map(item => {
        const active = location === item.path.split("#")[0];
        return <button key={item.label} onClick={() => { setLocation(item.path); setMenuOpen(false); }} className={`nav-item w-full text-left ${active ? "nav-item-active" : ""}`}><item.icon className="h-4 w-4" /><span>{item.label}</span></button>;
      })}
      {space === "learner" && user?.role !== "learner" ? <button onClick={() => setLocation("/training")} className="nav-item w-full text-left"><ClipboardCheck className="h-4 w-4" /><span>Training dashboard</span></button> : null}
      {user?.role === "admin" ? <button onClick={() => setLocation("/admin")} className="nav-item w-full text-left"><Settings2 className="h-4 w-4" /><span>Administration</span></button> : null}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <button onClick={() => setLocation("/")} aria-label="Go to Maximed Learning home"><Wordmark /></button>
          <div className="hidden items-center gap-3 sm:flex"><span className="hidden text-sm font-semibold text-slate-500 md:inline">Maximed Learning</span>{user ? <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"><LogOut className="h-4 w-4" />Sign out</button> : <button onClick={() => startLogin()} className="rounded-lg bg-[#093B88] px-3 py-2 text-sm font-bold text-white">Sign in</button>}</div>
          <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100 sm:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation">{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </header>
      {menuOpen ? <div className="border-b border-slate-200 bg-white p-4 sm:hidden">{sideNavigation}</div> : null}
      <div className="container flex gap-8 py-7 lg:py-9">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3 app-surface">
            <p className="section-kicker px-3 pb-3 pt-2 text-slate-400">{isStaffSpace ? "Staff workspace" : "Learner workspace"}</p>
            {sideNavigation}
            <div className="mt-5 border-t border-slate-100 px-3 pt-4"><p className="text-xs font-bold text-slate-500">{user?.name || "Maximed staff"}</p><p className="mt-1 text-xs text-slate-400 capitalize">{user?.role || "Learning access"}</p></div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 fade-in">
          <div className="mb-7"><p className="section-kicker text-[#DA0000]">{eyebrow}</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p></div>
          {children}
        </main>
      </div>
    </div>
  );
}
