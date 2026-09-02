import { and, asc, desc, eq } from "drizzle-orm";
import {
  assessmentAttempts,
  assessmentQuestions,
  assessments,
  courseModules,
  courses,
  moduleCompletions,
} from "../drizzle/schema";
import type { AssessmentQuestionType, CourseCategory, CourseModuleType } from "../shared/course";
import { getDb } from "./db";

export type CourseInput = {
  title: string;
  summary: string;
  category: CourseCategory;
  audience?: string | null;
  estimatedMinutes: number;
  isRequired: boolean;
  status: "draft" | "published" | "archived";
};

export type CourseModuleInput = {
  title: string;
  moduleType: CourseModuleType;
  body?: string | null;
  resourceUrl?: string | null;
  resourceKey?: string | null;
  resourceName?: string | null;
  resourceContentType?: string | null;
  position: number;
  estimatedMinutes: number;
  isRequired: boolean;
};

export type AssessmentInput = {
  moduleId?: number | null;
  title: string;
  passingMark: number;
  attemptLimit: number;
};

export type AssessmentQuestionInput = {
  prompt: string;
  questionType: AssessmentQuestionType;
  choices: string[];
  correctAnswer: string;
  position: number;
};

export async function listAdminCourses() {
  const db = await getDb();
  if (!db) return [];
  const [courseRows, moduleRows, assessmentRows] = await Promise.all([
    db.select().from(courses).orderBy(desc(courses.updatedAt)),
    db.select({ courseId: courseModules.courseId, id: courseModules.id }).from(courseModules),
    db.select({ courseId: assessments.courseId, id: assessments.id }).from(assessments),
  ]);
  return courseRows.map(course => ({
    ...course,
    moduleCount: moduleRows.filter(module => module.courseId === course.id).length,
    assessmentCount: assessmentRows.filter(assessment => assessment.courseId === course.id).length,
  }));
}

export async function getAdminCourse(courseId: number) {
  const db = await getDb();
  if (!db) return null;
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return null;
  const [modules, assessmentRows] = await Promise.all([
    db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(asc(courseModules.position), asc(courseModules.id)),
    db.select().from(assessments).where(eq(assessments.courseId, courseId)).orderBy(asc(assessments.id)),
  ]);
  const assessmentIds = assessmentRows.map(assessment => assessment.id);
  const questions = assessmentIds.length
    ? await db.select().from(assessmentQuestions).where(eq(assessmentQuestions.assessmentId, assessmentIds[0]!)).orderBy(asc(assessmentQuestions.position), asc(assessmentQuestions.id))
    : [];
  return {
    course,
    modules,
    assessments: assessmentRows.map(assessment => ({ ...assessment, questions: questions.filter(question => question.assessmentId === assessment.id) })),
  };
}

export async function createCourse(input: CourseInput, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(courses).values({ ...input, audience: input.audience || null, isRequired: input.isRequired ? 1 : 0, createdBy });
  const [course] = await db.select().from(courses).where(and(eq(courses.createdBy, createdBy), eq(courses.title, input.title))).orderBy(desc(courses.id)).limit(1);
  if (!course) throw new Error("Course could not be created");
  return course;
}

export async function updateCourse(courseId: number, input: CourseInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(courses).set({ ...input, audience: input.audience || null, isRequired: input.isRequired ? 1 : 0 }).where(eq(courses.id, courseId));
  return { success: true } as const;
}

export async function saveCourseModule(courseId: number, moduleId: number | null, input: CourseModuleInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = {
    ...input,
    body: input.body || null,
    resourceUrl: input.resourceUrl || null,
    resourceKey: input.resourceKey || null,
    resourceName: input.resourceName || null,
    resourceContentType: input.resourceContentType || null,
    isRequired: input.isRequired ? 1 : 0,
  };
  if (moduleId) {
    await db.update(courseModules).set(values).where(and(eq(courseModules.id, moduleId), eq(courseModules.courseId, courseId)));
    return { id: moduleId };
  }
  await db.insert(courseModules).values({ courseId, ...values });
  const [module] = await db.select({ id: courseModules.id }).from(courseModules).where(and(eq(courseModules.courseId, courseId), eq(courseModules.title, input.title))).orderBy(desc(courseModules.id)).limit(1);
  if (!module) throw new Error("Course step could not be created");
  return module;
}

export async function deleteCourseModule(courseId: number, moduleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(courseModules).where(and(eq(courseModules.id, moduleId), eq(courseModules.courseId, courseId)));
  return { success: true } as const;
}

export async function saveAssessment(courseId: number, assessmentId: number | null, input: AssessmentInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = { ...input, moduleId: input.moduleId || null };
  if (assessmentId) {
    await db.update(assessments).set(values).where(and(eq(assessments.id, assessmentId), eq(assessments.courseId, courseId)));
    return { id: assessmentId };
  }
  await db.insert(assessments).values({ courseId, ...values });
  const [assessment] = await db.select({ id: assessments.id }).from(assessments).where(and(eq(assessments.courseId, courseId), eq(assessments.title, input.title))).orderBy(desc(assessments.id)).limit(1);
  if (!assessment) throw new Error("Assessment could not be created");
  return assessment;
}

export async function saveAssessmentQuestion(assessmentId: number, questionId: number | null, input: AssessmentQuestionInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = { prompt: input.prompt, questionType: input.questionType, choicesJson: JSON.stringify(input.choices), correctChoice: input.correctAnswer, position: input.position };
  if (questionId) {
    await db.update(assessmentQuestions).set(values).where(and(eq(assessmentQuestions.id, questionId), eq(assessmentQuestions.assessmentId, assessmentId)));
    return { id: questionId };
  }
  await db.insert(assessmentQuestions).values({ assessmentId, ...values });
  const [question] = await db.select({ id: assessmentQuestions.id }).from(assessmentQuestions).where(and(eq(assessmentQuestions.assessmentId, assessmentId), eq(assessmentQuestions.prompt, input.prompt))).orderBy(desc(assessmentQuestions.id)).limit(1);
  if (!question) throw new Error("Question could not be created");
  return question;
}

export async function deleteAssessmentQuestion(assessmentId: number, questionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(assessmentQuestions).where(and(eq(assessmentQuestions.id, questionId), eq(assessmentQuestions.assessmentId, assessmentId)));
  return { success: true } as const;
}

export async function getCourseResource(moduleId: number) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db
    .select({ moduleId: courseModules.id, resourceKey: courseModules.resourceKey, resourceUrl: courseModules.resourceUrl, resourceName: courseModules.resourceName, courseStatus: courses.status })
    .from(courseModules)
    .innerJoin(courses, eq(courses.id, courseModules.courseId))
    .where(eq(courseModules.id, moduleId))
    .limit(1);
  if (!result || result.courseStatus !== "published") return null;
  return result;
}

export async function countAssessmentAttempts(assessmentId: number, userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const attempts = await db.select({ id: assessmentAttempts.id }).from(assessmentAttempts).where(and(eq(assessmentAttempts.assessmentId, assessmentId), eq(assessmentAttempts.userId, userId)));
  return attempts.length;
}
