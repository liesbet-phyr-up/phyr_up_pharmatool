import { MaximedShell, RoleAccess } from "@/components/MaximedShell";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, ChevronRight, Download, FileText, GraduationCap, LockKeyhole, PlayCircle, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

function AssessmentStep({ assessmentId, onComplete }: { assessmentId: number; onComplete: () => void }) {
  const assessment = trpc.learning.assessment.useQuery({ assessmentId });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const submit = trpc.learning.submitAssessment.useMutation({
    onSuccess: result => {
      toast.success(result.passed ? `Passed: ${result.scorePercent}%` : `Result: ${result.scorePercent}%. Please review the training and try again.`);
      onComplete();
    },
    onError: error => toast.error(error.message),
  });

  if (assessment.isLoading) return <div className="mt-4 h-32 animate-pulse rounded-xl bg-slate-100" />;
  if (!assessment.data) return <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-[#DA0000]">This assessment is not available.</div>;

  const { assessment: details, questions, attempts } = assessment.data;
  const latest = attempts[0];
  const limitReached = attempts.length >= details.attemptLimit;
  const handleSubmit = () => {
    if (questions.some(question => !answers[String(question.id)]?.trim())) {
      toast.error("Please answer every question before submitting.");
      return;
    }
    submit.mutate({ assessmentId, answers });
  };

  return (
    <div className="mt-4 rounded-xl border border-[#C7DBF7] bg-[#F5F9FF] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-kicker text-[#DA0000]">Knowledge check</p>
          <h3 className="mt-1 text-lg font-extrabold text-[#093B88]">{details.title}</h3>
          <p className="mt-1 text-sm text-slate-600">Pass mark: {details.passingMark}% · {details.attemptLimit} attempt{details.attemptLimit === 1 ? "" : "s"} allowed</p>
        </div>
        {latest ? <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${latest.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-[#DA0000]"}`}>{latest.passed ? `Passed · ${latest.scorePercent}%` : `Latest result · ${latest.scorePercent}%`}</span> : null}
      </div>
      {limitReached && !latest?.passed ? <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-bold text-[#DA0000]">The attempt limit has been reached. Please speak to your trainer.</p> : <div className="mt-5 space-y-5">
        {questions.map((question, index) => {
          const choices = safeChoices(question.choicesJson);
          return <fieldset key={question.id}>
            <legend className="text-sm font-extrabold leading-6 text-slate-800">{index + 1}. {question.prompt}</legend>
            {question.questionType === "short_answer" ? <textarea value={answers[String(question.id)] ?? ""} onChange={event => setAnswers(current => ({ ...current, [String(question.id)]: event.target.value }))} className="control mt-3 min-h-24 bg-white" placeholder="Write your answer here…" /> : <div className="mt-3 grid gap-2">
              {choices.map(choice => <label key={choice} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${answers[String(question.id)] === choice ? "border-[#093B88] bg-white text-[#093B88]" : "border-slate-200 bg-white text-slate-700"}`}><input type="radio" name={`question-${question.id}`} checked={answers[String(question.id)] === choice} onChange={() => setAnswers(current => ({ ...current, [String(question.id)]: choice }))} className="accent-[#093B88]" />{choice}</label>)}
            </div>}
          </fieldset>;
        })}
        <button onClick={handleSubmit} disabled={submit.isPending || limitReached} className="rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{submit.isPending ? "Marking your assessment…" : latest ? "Submit another attempt" : "Submit assessment"}</button>
      </div>}
    </div>
  );
}

function safeChoices(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((choice): choice is string => typeof choice === "string") : []; } catch { return []; } }

function ResourceButton({ moduleId, resourceName }: { moduleId: number; resourceName?: string | null }) {
  const resource = trpc.learning.resource.useQuery({ moduleId }, { enabled: false });
  const open = async () => { const result = await resource.refetch(); if (result.data?.url) window.open(result.data.url, "_blank", "noopener,noreferrer"); else toast.error("The resource could not be opened."); };
  return <button onClick={open} disabled={resource.isFetching} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#C7DBF7] bg-white px-3 py-2 text-sm font-extrabold text-[#093B88] disabled:opacity-60"><Download className="h-4 w-4" />{resource.isFetching ? "Preparing download…" : resourceName || "Open supporting resource"}</button>;
}

function CourseContent({ courseId }: { courseId: number }) {
  const [, setLocation] = useLocation();
  const course = trpc.learning.course.useQuery({ courseId });
  const complete = trpc.learning.completeModule.useMutation({ onSuccess: () => { toast.success("Learning step completed."); void course.refetch(); }, onError: error => toast.error(error.message) });
  if (course.isLoading) return <MaximedShell space="learner" eyebrow="Course workspace" title="Loading course" description="Preparing your learning workspace."><div className="h-52 animate-pulse rounded-2xl bg-slate-200" /></MaximedShell>;
  if (!course.data) return <MaximedShell space="learner" eyebrow="Course workspace" title="Course unavailable" description="This course may not be available to your account yet."><button onClick={() => setLocation("/learn")} className="inline-flex items-center gap-2 rounded-xl bg-[#093B88] px-4 py-3 text-sm font-extrabold text-white"><ArrowLeft className="h-4 w-4" />Return to learning</button></MaximedShell>;
  const { course: details, modules, enrollment, assessments } = course.data;
  const completedModules = modules.filter(module => module.completedAt).length;
  const progress = enrollment?.progressPercent ?? (modules.length ? Math.round((completedModules / modules.length) * 100) : 0);
  const completedStepIds = new Set(modules.filter(module => module.completedAt).map(module => module.id));
  return <MaximedShell space="learner" eyebrow="Course workspace" title={details.title} description={details.summary || "Complete each learning step, then submit your required assessment."}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><button onClick={() => setLocation("/learn")} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#093B88]"><ArrowLeft className="h-4 w-4" />Back to my learning</button></div>
    <section className="rounded-2xl bg-[#093B88] p-5 text-white sm:p-7"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="section-kicker text-white/60">Learning progress</p><p className="mt-2 text-3xl font-extrabold">{progress}% complete</p></div><div className="rounded-xl bg-white/12 px-3 py-2 text-sm font-bold">{completedModules} of {modules.length} steps</div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#E20000]" style={{ width: `${progress}%` }} /></div></section>
    <section className="mt-7 grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 app-surface"><p className="section-kicker text-[#DA0000]">Course details</p><p className="mt-3 text-sm leading-6 text-slate-600">Estimated completion time: <strong className="text-slate-800">{details.estimatedMinutes} minutes</strong></p><div className="mt-6 space-y-3"><div className="flex gap-3 text-sm text-slate-600"><ShieldCheck className="h-5 w-5 shrink-0 text-[#093B88]" /><span>Complete the core steps in order. Required learning is recorded to your profile.</span></div><div className="flex gap-3 text-sm text-slate-600"><GraduationCap className="h-5 w-5 shrink-0 text-[#093B88]" /><span>Pass the assessment to finish the knowledge-check step.</span></div></div></aside><div className="space-y-3">{modules.map((module, index) => { const earlierRequiredComplete = modules.filter(step => step.position < module.position && step.isRequired).every(step => completedStepIds.has(step.id)); const assessment = assessments.find(item => item.moduleId === module.id); const icon = module.moduleType === "video" ? <PlayCircle /> : module.moduleType === "quiz" ? <GraduationCap /> : <FileText />; return <article key={module.id} className={`rounded-2xl border bg-white p-4 app-surface ${earlierRequiredComplete || module.completedAt ? "border-slate-200" : "border-slate-100 opacity-70"}`}><div className="flex gap-4"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${module.completedAt ? "bg-emerald-50 text-emerald-700" : earlierRequiredComplete ? "bg-[#EAF1FB] text-[#093B88]" : "bg-slate-100 text-slate-400"}`}>{module.completedAt ? <CheckCircle2 className="h-5 w-5" /> : earlierRequiredComplete ? <span className="text-sm font-extrabold">{index + 1}</span> : <LockKeyhole className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-slate-900">{module.title}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{module.moduleType}</span>{module.isRequired ? <span className="text-[10px] font-extrabold uppercase text-[#DA0000]">Required</span> : null}</div>{earlierRequiredComplete || module.completedAt ? <><div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{module.body || `${module.estimatedMinutes} minute learning step`}</div>{(module.resourceKey || module.resourceUrl) ? <ResourceButton moduleId={module.id} resourceName={module.resourceName} /> : null}{module.moduleType === "quiz" && assessment ? <AssessmentStep assessmentId={assessment.id} onComplete={() => void course.refetch()} /> : !module.completedAt && module.moduleType !== "quiz" ? <button disabled={complete.isPending} onClick={() => complete.mutate({ moduleId: module.id, acknowledgement: module.moduleType === "acknowledgement" })} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#093B88] px-3 py-2 text-sm font-extrabold text-white"><CheckCircle2 className="h-4 w-4" />{module.moduleType === "acknowledgement" ? "Confirm and complete" : "Mark complete"}</button> : module.completedAt ? <p className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Completed</p> : null}</> : <p className="mt-3 text-sm leading-6 text-slate-500">Complete the earlier required training step first.</p>}</div><span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-400 sm:grid">{icon}</span></div></article>; })}</div></section>
  </MaximedShell>;
}

export default function CourseWorkspace() { const [, params] = useRoute("/course/:id"); const courseId = Number(params?.id ?? 0); return <RoleAccess allowed={["learner", "trainer", "admin"]} title="Maximed course workspace">{courseId > 0 ? <CourseContent courseId={courseId} /> : <div />}</RoleAccess>; }
