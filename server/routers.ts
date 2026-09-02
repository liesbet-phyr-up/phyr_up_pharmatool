import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { ASSESSMENT_QUESTION_TYPES, COURSE_CATEGORIES, COURSE_MODULE_TYPES } from "../shared/course";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as courseAdmin from "./courseAdmin";
import * as db from "./db";
import { importVaginalPHStarterCourse } from "./starterCourse";
import { getTrainingResourceUrl, uploadTrainingResource } from "./storage";

const reportingFilters = z.object({
  branch: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  jobRole: z.string().min(1).optional(),
  managerName: z.string().min(1).optional(),
  productTeam: z.string().min(1).optional(),
});

const courseInput = z.object({
  title: z.string().trim().min(3).max(240),
  summary: z.string().trim().min(10).max(4000),
  category: z.enum(COURSE_CATEGORIES),
  audience: z.string().trim().max(160).nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(480),
  isRequired: z.boolean(),
  status: z.enum(["draft", "published", "archived"]),
});

const courseModuleInput = z.object({
  title: z.string().trim().min(3).max(240),
  moduleType: z.enum(COURSE_MODULE_TYPES),
  body: z.string().trim().max(30000).nullable().optional(),
  resourceUrl: z.string().url().max(4000).nullable().optional(),
  resourceKey: z.string().trim().max(512).nullable().optional(),
  resourceName: z.string().trim().max(255).nullable().optional(),
  resourceContentType: z.string().trim().max(160).nullable().optional(),
  position: z.number().int().min(1).max(1000),
  estimatedMinutes: z.number().int().min(0).max(480),
  isRequired: z.boolean(),
});

const assessmentInput = z.object({
  moduleId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(3).max(240),
  passingMark: z.number().int().min(0).max(100),
  attemptLimit: z.number().int().min(1).max(20),
});

const assessmentQuestionInput = z.object({
  prompt: z.string().trim().min(3).max(4000),
  questionType: z.enum(ASSESSMENT_QUESTION_TYPES),
  choices: z.array(z.string().trim().min(1).max(500)).max(10),
  correctAnswer: z.string().trim().min(1).max(1000),
  position: z.number().int().min(1).max(1000),
});

const resourceUploadInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(160),
  dataBase64: z.string().min(1).max(14_000_000),
});

const activeAccessProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await db.ensureActiveAccess(ctx.user.id);
  return next({ ctx });
});

const staffRoleProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role === "learner") throw new TRPCError({ code: "FORBIDDEN", message: "Trainer access is required." });
  return next({ ctx });
});

const staffProcedure = staffRoleProcedure.use(async ({ ctx, next }) => {
  await db.ensureActiveAccess(ctx.user.id);
  return next({ ctx });
});

const adminRoleProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  return next({ ctx });
});

const maximedAdminProcedure = adminRoleProcedure.use(async ({ ctx, next }) => {
  await db.ensureActiveAccess(ctx.user.id);
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  learning: router({
    catalog: activeAccessProcedure.query(({ ctx }) => db.getLearnerCatalog(ctx.user.id)),
    course: activeAccessProcedure.input(z.object({ courseId: z.number().int().positive() })).query(({ ctx, input }) => db.getCourseWorkspace(input.courseId, ctx.user.id)),
    completeModule: activeAccessProcedure.input(z.object({ moduleId: z.number().int().positive(), acknowledgement: z.boolean().default(false) })).mutation(({ ctx, input }) => db.recordModuleCompletion(ctx.user.id, input.moduleId, input.acknowledgement)),
    assessment: activeAccessProcedure.input(z.object({ assessmentId: z.number().int().positive() })).query(({ ctx, input }) => db.getLearnerAssessment(input.assessmentId, ctx.user.id)),
    submitAssessment: activeAccessProcedure.input(z.object({ assessmentId: z.number().int().positive(), answers: z.record(z.string(), z.string()) })).mutation(({ ctx, input }) => db.submitLearnerAssessment(input.assessmentId, ctx.user.id, input.answers)),
    resource: activeAccessProcedure.input(z.object({ moduleId: z.number().int().positive() })).query(async ({ input }) => {
      const resource = await courseAdmin.getCourseResource(input.moduleId);
      if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "This course resource is unavailable." });
      if (resource.resourceKey) return { url: await getTrainingResourceUrl(resource.resourceKey), name: resource.resourceName ?? "Training resource" };
      if (resource.resourceUrl) return { url: resource.resourceUrl, name: resource.resourceName ?? "Training resource" };
      throw new TRPCError({ code: "NOT_FOUND", message: "This learning step does not have a downloadable resource." });
    }),
  }),
  staff: router({
    overview: staffProcedure.input(reportingFilters).query(({ input }) => db.getStaffReporting(input)),
    learners: staffProcedure.input(reportingFilters).query(({ input }) => db.getStaffReporting(input)),
  }),
  admin: router({
    people: maximedAdminProcedure.query(() => db.getPeople()),
    invites: maximedAdminProcedure.query(() => db.getStaffInvites()),
    createInvite: maximedAdminProcedure.input(z.object({
      email: z.string().email(),
      role: z.enum(["learner", "trainer", "admin"]),
      branch: z.string().max(160).optional(),
      region: z.string().max(160).optional(),
      jobRole: z.string().max(160).optional(),
      managerName: z.string().max(160).optional(),
      productTeam: z.string().max(160).optional(),
      origin: z.string().url(),
    })).mutation(({ ctx, input }) => db.createStaffInvite({ ...input, invitedBy: ctx.user.id })),
    updatePerson: maximedAdminProcedure.input(z.object({
      userId: z.number().int().positive(),
      role: z.enum(["learner", "trainer", "admin"]),
      branch: z.string().max(160).optional(),
      region: z.string().max(160).optional(),
      jobRole: z.string().max(160).optional(),
      managerName: z.string().max(160).optional(),
      productTeam: z.string().max(160).optional(),
    })).mutation(({ input }) => db.updatePerson(input.userId, input)),
    listCourses: maximedAdminProcedure.query(() => courseAdmin.listAdminCourses()),
    importVaginalPHStarter: maximedAdminProcedure.mutation(({ ctx }) => importVaginalPHStarterCourse(ctx.user.id)),
    course: maximedAdminProcedure.input(z.object({ courseId: z.number().int().positive() })).query(({ input }) => courseAdmin.getAdminCourse(input.courseId)),
    createCourse: maximedAdminProcedure.input(courseInput).mutation(({ ctx, input }) => courseAdmin.createCourse(input, ctx.user.id)),
    updateCourse: maximedAdminProcedure.input(z.object({ courseId: z.number().int().positive(), data: courseInput })).mutation(({ input }) => courseAdmin.updateCourse(input.courseId, input.data)),
    saveCourseModule: maximedAdminProcedure.input(z.object({ courseId: z.number().int().positive(), moduleId: z.number().int().positive().nullable(), data: courseModuleInput })).mutation(({ input }) => courseAdmin.saveCourseModule(input.courseId, input.moduleId, input.data)),
    deleteCourseModule: maximedAdminProcedure.input(z.object({ courseId: z.number().int().positive(), moduleId: z.number().int().positive() })).mutation(({ input }) => courseAdmin.deleteCourseModule(input.courseId, input.moduleId)),
    saveAssessment: maximedAdminProcedure.input(z.object({ courseId: z.number().int().positive(), assessmentId: z.number().int().positive().nullable(), data: assessmentInput })).mutation(({ input }) => courseAdmin.saveAssessment(input.courseId, input.assessmentId, input.data)),
    saveAssessmentQuestion: maximedAdminProcedure.input(z.object({ assessmentId: z.number().int().positive(), questionId: z.number().int().positive().nullable(), data: assessmentQuestionInput })).mutation(({ input }) => courseAdmin.saveAssessmentQuestion(input.assessmentId, input.questionId, input.data)),
    deleteAssessmentQuestion: maximedAdminProcedure.input(z.object({ assessmentId: z.number().int().positive(), questionId: z.number().int().positive() })).mutation(({ input }) => courseAdmin.deleteAssessmentQuestion(input.assessmentId, input.questionId)),
    uploadResource: maximedAdminProcedure.input(resourceUploadInput).mutation(async ({ input }) => {
      const data = Buffer.from(input.dataBase64, "base64");
      return uploadTrainingResource(input.fileName, data, input.contentType);
    }),
  }),
});

export type AppRouter = typeof appRouter;
