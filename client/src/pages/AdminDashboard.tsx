import { MaximedShell, RoleAccess } from "@/components/MaximedShell";
import { trpc } from "@/lib/trpc";
import { Copy, LockKeyhole, MailPlus, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";

type Person = {
  id: number;
  name: string | null;
  email: string | null;
  role: "learner" | "trainer" | "admin";
  branch: string | null;
  region: string | null;
  jobRole: string | null;
  managerName: string | null;
  productTeam: string | null;
  lastSignedIn: Date;
};

type ProfileForm = {
  role: "learner" | "trainer" | "admin";
  branch: string;
  region: string;
  jobRole: string;
  managerName: string;
  productTeam: string;
};

function toForm(person: Person): ProfileForm {
  return { role: person.role, branch: person.branch ?? "", region: person.region ?? "", jobRole: person.jobRole ?? "", managerName: person.managerName ?? "", productTeam: person.productTeam ?? "" };
}

function AdminContent() {
  const people = trpc.admin.people.useQuery();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Person | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const updatePerson = trpc.admin.updatePerson.useMutation({ onSuccess: async () => { await utils.admin.people.invalidate(); setSelected(null); setForm(null); } });
  const records = (people.data ?? []) as Person[];
  const roleTotals = { learners: records.filter(person => person.role === "learner").length, trainers: records.filter(person => person.role === "trainer").length, admins: records.filter(person => person.role === "admin").length };
  const selectPerson = (person: Person) => { setSelected(person); setForm(toForm(person)); };

  return <MaximedShell space="admin" eyebrow="Administration" title="Govern learning with confidence." description="Manage access roles and maintain the organisational dimensions that make learning reporting useful.">
    <section className="grid gap-4 sm:grid-cols-3"><AdminMetric label="People" value={records.length} detail="Known Maximed accounts" icon={<UsersRound className="h-5 w-5" />} /><AdminMetric label="Teaching staff" value={roleTotals.trainers} detail="Can view all learner results" icon={<Settings2 className="h-5 w-5" />} /><AdminMetric label="Administrators" value={roleTotals.admins} detail="Can manage access and data" icon={<LockKeyhole className="h-5 w-5" />} /></section>
    <section className="mt-7 grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><article id="people" className="overflow-hidden rounded-2xl border border-slate-200 bg-white app-surface"><div className="flex items-end justify-between gap-4 p-5"><div><p className="section-kicker text-[#DA0000]">People & permissions</p><h2 className="mt-1 font-extrabold">Access directory</h2></div><span className="text-xs font-bold text-slate-500">Select a person to manage</span></div>{records.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-y border-slate-100 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Person</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Reporting profile</th><th className="px-4 py-3" /></tr></thead><tbody>{records.map(person => <tr key={person.id} className={`border-b border-slate-100 last:border-0 ${selected?.id === person.id ? "bg-[#F5F9FF]" : ""}`}><td className="px-5 py-4"><p className="text-sm font-extrabold">{person.name || "Unnamed account"}</p><p className="mt-1 text-xs text-slate-500">{person.email || "No email recorded"}</p></td><td className="px-4 py-4"><span className="rounded-full bg-[#EAF1FB] px-2.5 py-1 text-xs font-extrabold capitalize text-[#093B88]">{person.role}</span></td><td className="px-4 py-4 text-sm text-slate-600">{[person.branch, person.region, person.jobRole].filter(Boolean).join(" · ") || "Not yet set"}</td><td className="px-4 py-4"><button onClick={() => selectPerson(person)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-extrabold text-[#093B88] hover:border-[#093B88]">Manage</button></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><UsersRound className="mx-auto h-6 w-6 text-[#093B88]" /><p className="mt-3 text-sm font-extrabold">The directory will populate as staff sign in.</p><p className="mt-2 text-sm text-slate-500">User roles and reporting profiles are ready to configure.</p></div>}</article>
      {selected && form ? <PeopleEditor person={selected} form={form} setForm={setForm} saving={updatePerson.isPending} error={updatePerson.error?.message} onCancel={() => { setSelected(null); setForm(null); }} onSave={() => updatePerson.mutate({ userId: selected.id, ...form })} /> : <ReportingControls />}
    </section>
  </MaximedShell>;
}

function PeopleEditor({ person, form, setForm, saving, error, onCancel, onSave }: { person: Person; form: ProfileForm; setForm: (form: ProfileForm) => void; saving: boolean; error?: string; onCancel: () => void; onSave: () => void }) {
  const change = (key: keyof ProfileForm, value: string) => setForm({ ...form, [key]: value } as ProfileForm);
  const fields: Array<{ key: Exclude<keyof ProfileForm, "role">; label: string; placeholder: string }> = [
    { key: "branch", label: "Branch", placeholder: "e.g. Rosebank" }, { key: "region", label: "Region", placeholder: "e.g. Gauteng" }, { key: "jobRole", label: "Job role", placeholder: "e.g. Pharmacy assistant" }, { key: "managerName", label: "Manager", placeholder: "e.g. Jane Smith" }, { key: "productTeam", label: "Product team", placeholder: "e.g. Wellness" },
  ];
  return <article className="rounded-2xl border border-[#C7DBF7] bg-[#EAF1FB] p-5"><div className="flex items-start justify-between gap-3"><div><p className="section-kicker text-[#DA0000]">Manage person</p><h2 className="mt-1 text-lg font-extrabold text-[#093B88]">{person.name || "Unnamed account"}</h2><p className="mt-1 text-xs text-slate-600">{person.email || "No email recorded"}</p></div><ShieldCheck className="h-5 w-5 shrink-0 text-[#093B88]" /></div><div className="mt-5 space-y-3"><label className="block text-xs font-bold text-slate-600">Access role<select value={form.role} onChange={event => change("role", event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"><option value="learner">Learner</option><option value="trainer">Trainer</option><option value="admin">Administrator</option></select></label>{fields.map(field => <label key={field.key} className="block text-xs font-bold text-slate-600">{field.label}<input value={form[field.key]} onChange={event => change(field.key, event.target.value)} placeholder={field.placeholder} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400" /></label>)}</div>{error ? <p className="mt-3 text-xs font-bold text-[#DA0000]">{error}</p> : null}<div className="mt-5 flex gap-3"><button onClick={onSave} disabled={saving} className="rounded-xl bg-[#093B88] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button><button onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-extrabold text-[#093B88] hover:bg-white/70">Cancel</button></div></article>;
}

function ReportingControls() {
  const utils = trpc.useUtils();
  const invites = trpc.admin.invites.useQuery();
  const createInvite = trpc.admin.createInvite.useMutation({ onSuccess: async () => { await utils.admin.invites.invalidate(); } });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"learner" | "trainer" | "admin">("learner");
  const [inviteUrl, setInviteUrl] = useState("");
  const submit = () => createInvite.mutate({ email, role, origin: window.location.origin }, { onSuccess: result => { setInviteUrl(result.inviteUrl); setEmail(""); } });
  return <article className="rounded-2xl border border-[#C7DBF7] bg-[#EAF1FB] p-6"><p className="section-kicker text-[#DA0000]">Staff invitations</p><h2 className="mt-2 text-xl font-extrabold text-[#093B88]">Invite a Maximed staff member.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Create a controlled, single-use access link. The recipient must sign in with the invited email address before their assigned role becomes active.</p><div className="mt-5 grid gap-3"><label className="text-xs font-bold text-slate-600">Staff email<input value={email} onChange={event => setEmail(event.target.value)} type="email" placeholder="name@company.com" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" /></label><label className="text-xs font-bold text-slate-600">Assigned role<select value={role} onChange={event => setRole(event.target.value as typeof role)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"><option value="learner">Learner</option><option value="trainer">Trainer</option><option value="admin">Administrator</option></select></label><button disabled={!email || createInvite.isPending} onClick={submit} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"><MailPlus className="h-4 w-4" />{createInvite.isPending ? "Creating invite…" : "Create access link"}</button></div>{inviteUrl ? <div className="mt-5 rounded-xl border border-[#BFD6F7] bg-white p-3"><p className="text-xs font-extrabold text-[#093B88]">Share this link securely</p><div className="mt-2 flex gap-2"><input readOnly value={inviteUrl} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600" /><button onClick={() => navigator.clipboard?.writeText(inviteUrl)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-[#093B88]" aria-label="Copy invitation link"><Copy className="h-4 w-4" /></button></div></div> : null}{createInvite.error ? <p className="mt-3 text-xs font-bold text-[#DA0000]">{createInvite.error.message}</p> : null}<div className="mt-5 border-t border-[#C7DBF7] pt-4"><p className="text-xs font-extrabold text-[#093B88]">{invites.data?.filter(invite => !invite.acceptedAt).length ?? 0} pending invitation{(invites.data?.filter(invite => !invite.acceptedAt).length ?? 0) === 1 ? "" : "s"}</p></div></article>;
}
function AdminMetric({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) { return <article className="rounded-2xl border border-slate-200 bg-white p-5 app-surface"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EAF1FB] text-[#093B88]">{icon}</span><p className="metric-value mt-6 text-3xl font-extrabold text-slate-950">{value}</p><p className="mt-1 text-sm font-extrabold">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>; }
export default function AdminDashboard() { return <RoleAccess allowed={["admin"]} title="Maximed administration"><AdminContent /></RoleAccess>; }
