import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  assessmentAttempts,
  assessmentQuestions,
  assessments,
  courseEnrollments,
  courseModules,
  courses,
  employeeProfiles,
  InsertUser,
  moduleCompletions,
  staffInvites,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
    values.accessStatus = "active";
    updateSet.accessStatus = "active";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export type ReportingFilters = {
  branch?: string;
  region?: string;
  jobRole?: string;
  managerName?: string;
  productTeam?: string;
};

export function calculateLearningProgress(totalModules: number, completedModules: number) {
  if (totalModules <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completedModules / totalModules) * 100)));
}

export function getLearningStatus(progressPercent: number): "in_progress" | "completed" {
  return progressPercent === 100 ? "completed" : "in_progress";
}

export function buildModuleCompletionRecord(userId: number, moduleId: number, acknowledgement: boolean, completedAt = new Date()) {
  return { userId, moduleId, completedAt, acknowledgementConfirmedAt: acknowledgement ? completedAt : null };
}

export function evaluateAssessment(questions: Array<{ id: number; correctChoice: string }>, answers: Record<string, string>, passingMark: number) {
  const correct = questions.filter(question => answers[String(question.id)] === question.correctChoice).length;
  const scorePercent = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  return { scorePercent, passed: scorePercent >= passingMark };
}

export function canSubmitAssessment(existingAttempts: number, attemptLimit: number) {
  return existingAttempts < attemptLimit;
}

function normalizedEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function matchesFilters(profile: { branch: string | null; region: string | null; jobRole: string | null; managerName: string | null; productTeam: string | null }, filters: ReportingFilters) {
  return Object.entries(filters).every(([key, value]) => !value || profile[key as keyof typeof profile] === value);
}

export async function getLearnerCatalog(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: courses.id,
      title: courses.title,
      summary: courses.summary,
      category: courses.category,
      audience: courses.audience,
      estimatedMinutes: courses.estimatedMinutes,
      isRequired: courses.isRequired,
      enrollmentStatus: courseEnrollments.status,
      progressPercent: courseEnrollments.progressPercent,
      dueAt: courseEnrollments.dueAt,
    })
    .from(courses)
    .leftJoin(courseEnrollments, and(eq(courseEnrollments.courseId, courses.id), eq(courseEnrollments.userId, userId)))
    .where(eq(courses.status, "published"))
    .orderBy(asc(courses.category), asc(courses.title));
}

export async function getCourseWorkspace(courseId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return null;

  const modules = await db
    .select({
      id: courseModules.id,
      title: courseModules.title,
      moduleType: courseModules.moduleType,
      body: courseModules.body,
      resourceUrl: courseModules.resourceUrl,
      position: courseModules.position,
      estimatedMinutes: courseModules.estimatedMinutes,
      isRequired: courseModules.isRequired,
      completedAt: moduleCompletions.completedAt,
      acknowledgementConfirmedAt: moduleCompletions.acknowledgementConfirmedAt,
    })
    .from(courseModules)
    .leftJoin(moduleCompletions, and(eq(moduleCompletions.moduleId, courseModules.id), eq(moduleCompletions.userId, userId)))
    .where(eq(courseModules.courseId, courseId))
    .orderBy(asc(courseModules.position));

  const [enrollment] = await db
    .select()
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.userId, userId)))
    .limit(1);

  return { course, modules, enrollment };
}

export async function recordModuleCompletion(userId: number, moduleId: number, acknowledgement: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [module] = await db.select().from(courseModules).where(eq(courseModules.id, moduleId)).limit(1);
  if (!module) throw new Error("Learning module not found");

  const now = new Date();
  await db.insert(moduleCompletions).values(buildModuleCompletionRecord(userId, moduleId, acknowledgement, now)).onDuplicateKeyUpdate({
    set: {
      completedAt: now,
      acknowledgementConfirmedAt: acknowledgement ? now : null,
    },
  });

  const modules = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, module.courseId));
  const completed = await db
    .select({ moduleId: moduleCompletions.moduleId })
    .from(moduleCompletions)
    .innerJoin(courseModules, eq(courseModules.id, moduleCompletions.moduleId))
    .where(and(eq(courseModules.courseId, module.courseId), eq(moduleCompletions.userId, userId)));
  const progressPercent = calculateLearningProgress(modules.length, completed.length);
  const status = getLearningStatus(progressPercent);

  await db.insert(courseEnrollments).values({
    userId,
    courseId: module.courseId,
    status,
    progressPercent,
    startedAt: now,
    completedAt: progressPercent === 100 ? now : null,
  }).onDuplicateKeyUpdate({
    set: {
      status,
      progressPercent,
      startedAt: now,
      completedAt: progressPercent === 100 ? now : null,
    },
  });

  return { progressPercent, status };
}

export async function getLearnerAssessment(assessmentId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId)).limit(1);
  if (!assessment) return null;
  const questions = await db
    .select({ id: assessmentQuestions.id, prompt: assessmentQuestions.prompt, choicesJson: assessmentQuestions.choicesJson, position: assessmentQuestions.position })
    .from(assessmentQuestions)
    .where(eq(assessmentQuestions.assessmentId, assessmentId))
    .orderBy(asc(assessmentQuestions.position));
  const attempts = await db
    .select({ attemptNumber: assessmentAttempts.attemptNumber, scorePercent: assessmentAttempts.scorePercent, passed: assessmentAttempts.passed, submittedAt: assessmentAttempts.submittedAt })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.assessmentId, assessmentId), eq(assessmentAttempts.userId, userId)))
    .orderBy(desc(assessmentAttempts.attemptNumber));

  return { assessment, questions, attempts };
}

export async function submitLearnerAssessment(assessmentId: number, userId: number, answers: Record<string, string>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId)).limit(1);
  if (!assessment) throw new Error("Assessment not found");
  const previous = await db
    .select({ attemptNumber: assessmentAttempts.attemptNumber })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.assessmentId, assessmentId), eq(assessmentAttempts.userId, userId)));
  if (!canSubmitAssessment(previous.length, assessment.attemptLimit)) throw new Error("Attempt limit reached");

  const questions = await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessmentId));
  const { scorePercent, passed } = evaluateAssessment(questions, answers, assessment.passingMark);
  const attemptNumber = previous.length + 1;

  await db.insert(assessmentAttempts).values({
    assessmentId,
    userId,
    attemptNumber,
    scorePercent,
    passed: passed ? 1 : 0,
    answersJson: JSON.stringify(answers),
  });

  return { attemptNumber, scorePercent, passed, attemptsRemaining: assessment.attemptLimit - attemptNumber, passingMark: assessment.passingMark };
}

export async function getStaffReporting(filters: ReportingFilters) {
  const db = await getDb();
  if (!db) return { metrics: { learners: 0, assigned: 0, completed: 0, completionRate: 0, averageScore: 0 }, learners: [], dimensions: { branches: [], regions: [], jobRoles: [], managers: [], productTeams: [] } };

  const people = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      branch: employeeProfiles.branch,
      region: employeeProfiles.region,
      jobRole: employeeProfiles.jobRole,
      managerName: employeeProfiles.managerName,
      productTeam: employeeProfiles.productTeam,
    })
    .from(users)
    .leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
    .where(eq(users.role, "learner"));
  const filteredPeople = people.filter(person => matchesFilters(person, filters));
  const learnerIds = new Set(filteredPeople.map(person => person.id));

  const enrollmentRows = await db
    .select({
      userId: courseEnrollments.userId,
      courseTitle: courses.title,
      status: courseEnrollments.status,
      progressPercent: courseEnrollments.progressPercent,
      dueAt: courseEnrollments.dueAt,
      completedAt: courseEnrollments.completedAt,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courses.id, courseEnrollments.courseId));
  const enrollments = enrollmentRows.filter(enrollment => learnerIds.has(enrollment.userId));

  const attemptRows = await db
    .select({ userId: assessmentAttempts.userId, scorePercent: assessmentAttempts.scorePercent, passed: assessmentAttempts.passed, submittedAt: assessmentAttempts.submittedAt })
    .from(assessmentAttempts);
  const attempts = attemptRows.filter(attempt => learnerIds.has(attempt.userId));

  const attemptsByLearner = new Map<number, typeof attempts>();
  attempts.forEach(attempt => attemptsByLearner.set(attempt.userId, [...(attemptsByLearner.get(attempt.userId) ?? []), attempt]));
  const enrollmentsByLearner = new Map<number, typeof enrollments>();
  enrollments.forEach(enrollment => enrollmentsByLearner.set(enrollment.userId, [...(enrollmentsByLearner.get(enrollment.userId) ?? []), enrollment]));

  const learners = filteredPeople.map(person => {
    const personEnrollments = enrollmentsByLearner.get(person.id) ?? [];
    const personAttempts = attemptsByLearner.get(person.id) ?? [];
    const averageScore = personAttempts.length ? Math.round(personAttempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0) / personAttempts.length) : null;
    return {
      ...person,
      enrolled: personEnrollments.length,
      completed: personEnrollments.filter(item => item.status === "completed").length,
      averageScore,
      lastActivity: personAttempts[0]?.submittedAt ?? personEnrollments[0]?.completedAt ?? null,
    };
  });

  const completed = enrollments.filter(enrollment => enrollment.status === "completed").length;
  const averageScore = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0) / attempts.length) : 0;
  const distinct = (key: keyof typeof filteredPeople[number]) => Array.from(new Set(filteredPeople.map(item => item[key]).filter((item): item is string => Boolean(item)))).sort();

  return {
    metrics: {
      learners: filteredPeople.length,
      assigned: enrollments.length,
      completed,
      completionRate: enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0,
      averageScore,
    },
    learners,
    dimensions: {
      branches: distinct("branch"),
      regions: distinct("region"),
      jobRoles: distinct("jobRole"),
      managers: distinct("managerName"),
      productTeams: distinct("productTeam"),
    },
  };
}

export async function getPeople() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      accessStatus: users.accessStatus,
      branch: employeeProfiles.branch,
      region: employeeProfiles.region,
      jobRole: employeeProfiles.jobRole,
      managerName: employeeProfiles.managerName,
      productTeam: employeeProfiles.productTeam,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
    .orderBy(asc(users.name));
}

export async function updatePerson(userId: number, input: { role: "learner" | "trainer" | "admin"; branch?: string; region?: string; jobRole?: string; managerName?: string; productTeam?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ role: input.role }).where(eq(users.id, userId));
  await db.insert(employeeProfiles).values({ userId, ...input }).onDuplicateKeyUpdate({ set: { branch: input.branch, region: input.region, jobRole: input.jobRole, managerName: input.managerName, productTeam: input.productTeam } });
  return { success: true } as const;
}

export async function ensureActiveAccess(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [person] = await db.select({ accessStatus: users.accessStatus }).from(users).where(eq(users.id, userId)).limit(1);
  if (!person || person.accessStatus !== "active") throw new Error("An active Maximed invitation is required.");
}

export type StaffInviteInput = {
  email: string;
  role: "learner" | "trainer" | "admin";
  branch?: string;
  region?: string;
  jobRole?: string;
  managerName?: string;
  productTeam?: string;
  invitedBy: number;
  origin: string;
};

export async function createStaffInvite(input: StaffInviteInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const email = normalizedEmail(input.email);
  if (!email) throw new Error("A staff email address is required");
  const token = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await db.insert(staffInvites).values({
    email,
    token,
    role: input.role,
    branch: input.branch || null,
    region: input.region || null,
    jobRole: input.jobRole || null,
    managerName: input.managerName || null,
    productTeam: input.productTeam || null,
    invitedBy: input.invitedBy,
    expiresAt,
  });
  const origin = new URL(input.origin).origin;
  return { token, email, expiresAt, inviteUrl: `${origin}/invite/${token}` };
}

export async function getStaffInvites() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: staffInvites.id, email: staffInvites.email, role: staffInvites.role, branch: staffInvites.branch, region: staffInvites.region, expiresAt: staffInvites.expiresAt, acceptedAt: staffInvites.acceptedAt, createdAt: staffInvites.createdAt }).from(staffInvites).orderBy(desc(staffInvites.createdAt));
}

export async function redeemStaffInvite(userId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [invite] = await db.select().from(staffInvites).where(eq(staffInvites.token, token)).limit(1);
  if (!invite) throw new Error("This invitation link is not valid");
  if (invite.acceptedAt) throw new Error("This invitation link has already been used");
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) throw new Error("This invitation link has expired");
  const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!person || normalizedEmail(person.email) !== normalizedEmail(invite.email)) throw new Error("Sign in with the invited Maximed email address to redeem this link");
  const now = new Date();
  await db.update(users).set({ role: invite.role, accessStatus: "active" }).where(eq(users.id, userId));
  await db.insert(employeeProfiles).values({ userId, branch: invite.branch, region: invite.region, jobRole: invite.jobRole, managerName: invite.managerName, productTeam: invite.productTeam }).onDuplicateKeyUpdate({ set: { branch: invite.branch, region: invite.region, jobRole: invite.jobRole, managerName: invite.managerName, productTeam: invite.productTeam } });
  await db.update(staffInvites).set({ acceptedAt: now }).where(eq(staffInvites.id, invite.id));
  return { role: invite.role, accessStatus: "active" as const };
}
