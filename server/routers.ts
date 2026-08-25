import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

const reportingFilters = z.object({
  branch: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  jobRole: z.string().min(1).optional(),
  managerName: z.string().min(1).optional(),
  productTeam: z.string().min(1).optional(),
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
    redeemInvite: protectedProcedure.input(z.object({ token: z.string().min(20).max(80) })).mutation(({ ctx, input }) => db.redeemStaffInvite(ctx.user.id, input.token)),
  }),
  learning: router({
    catalog: activeAccessProcedure.query(({ ctx }) => db.getLearnerCatalog(ctx.user.id)),
    course: activeAccessProcedure.input(z.object({ courseId: z.number().int().positive() })).query(({ ctx, input }) => db.getCourseWorkspace(input.courseId, ctx.user.id)),
    completeModule: activeAccessProcedure.input(z.object({ moduleId: z.number().int().positive(), acknowledgement: z.boolean().default(false) })).mutation(({ ctx, input }) => db.recordModuleCompletion(ctx.user.id, input.moduleId, input.acknowledgement)),
    assessment: activeAccessProcedure.input(z.object({ assessmentId: z.number().int().positive() })).query(({ ctx, input }) => db.getLearnerAssessment(input.assessmentId, ctx.user.id)),
    submitAssessment: activeAccessProcedure.input(z.object({ assessmentId: z.number().int().positive(), answers: z.record(z.string(), z.string()) })).mutation(({ ctx, input }) => db.submitLearnerAssessment(input.assessmentId, ctx.user.id, input.answers)),
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
  }),
});

export type AppRouter = typeof appRouter;
