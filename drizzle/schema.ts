import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { ASSESSMENT_QUESTION_TYPES, COURSE_CATEGORIES, COURSE_MODULE_TYPES } from "../shared/course";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["learner", "trainer", "admin"]).default("learner").notNull(),
  accessStatus: mysqlEnum("accessStatus", ["pending", "active", "revoked"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const employeeProfiles = mysqlTable(
  "employee_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    branch: varchar("branch", { length: 160 }),
    region: varchar("region", { length: 160 }),
    jobRole: varchar("jobRole", { length: 160 }),
    managerName: varchar("managerName", { length: 160 }),
    productTeam: varchar("productTeam", { length: 160 }),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("employee_profiles_user_unique").on(table.userId)],
);

export const staffInvites = mysqlTable(
  "staff_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    token: varchar("token", { length: 80 }).notNull(),
    role: mysqlEnum("role", ["learner", "trainer", "admin"]).default("learner").notNull(),
    branch: varchar("branch", { length: 160 }),
    region: varchar("region", { length: 160 }),
    jobRole: varchar("jobRole", { length: 160 }),
    managerName: varchar("managerName", { length: 160 }),
    productTeam: varchar("productTeam", { length: 160 }),
    invitedBy: int("invitedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt"),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("staff_invites_token_unique").on(table.token), index("staff_invites_email_idx").on(table.email)],
);

export const courses = mysqlTable(
  "courses",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 240 }).notNull(),
    summary: text("summary"),
    category: mysqlEnum("category", COURSE_CATEGORIES).notNull(),
    audience: varchar("audience", { length: 160 }),
    estimatedMinutes: int("estimatedMinutes").default(0).notNull(),
    isRequired: int("isRequired").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
    createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("courses_category_idx").on(table.category), index("courses_status_idx").on(table.status)],
);

export const courseModules = mysqlTable(
  "course_modules",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 240 }).notNull(),
    moduleType: mysqlEnum("moduleType", COURSE_MODULE_TYPES).notNull(),
    body: text("body"),
    resourceUrl: text("resourceUrl"),
    resourceKey: varchar("resourceKey", { length: 512 }),
    resourceName: varchar("resourceName", { length: 255 }),
    resourceContentType: varchar("resourceContentType", { length: 160 }),
    position: int("position").default(1).notNull(),
    estimatedMinutes: int("estimatedMinutes").default(0).notNull(),
    isRequired: int("isRequired").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("course_modules_course_position_idx").on(table.courseId, table.position)],
);

export const courseEnrollments = mysqlTable(
  "course_enrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["not_started", "in_progress", "completed", "overdue"]).default("not_started").notNull(),
    progressPercent: int("progressPercent").default(0).notNull(),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    dueAt: timestamp("dueAt"),
  },
  table => [
    uniqueIndex("course_enrollments_user_course_unique").on(table.userId, table.courseId),
    index("course_enrollments_course_status_idx").on(table.courseId, table.status),
    index("course_enrollments_user_status_idx").on(table.userId, table.status),
  ],
);

export const moduleCompletions = mysqlTable(
  "module_completions",
  {
    id: int("id").autoincrement().primaryKey(),
    moduleId: int("moduleId").notNull().references(() => courseModules.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    completedAt: timestamp("completedAt").defaultNow().notNull(),
    acknowledgementConfirmedAt: timestamp("acknowledgementConfirmedAt"),
  },
  table => [uniqueIndex("module_completions_user_module_unique").on(table.userId, table.moduleId)],
);

export const assessments = mysqlTable(
  "assessments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
    moduleId: int("moduleId").references(() => courseModules.id, { onDelete: "set null" }),
    title: varchar("title", { length: 240 }).notNull(),
    passingMark: int("passingMark").default(80).notNull(),
    attemptLimit: int("attemptLimit").default(3).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("assessments_course_idx").on(table.courseId)],
);

export const assessmentQuestions = mysqlTable(
  "assessment_questions",
  {
    id: int("id").autoincrement().primaryKey(),
    assessmentId: int("assessmentId").notNull().references(() => assessments.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    questionType: mysqlEnum("questionType", ASSESSMENT_QUESTION_TYPES).notNull().default("multiple_choice"),
    choicesJson: text("choicesJson").notNull(),
    correctChoice: varchar("correctChoice", { length: 255 }).notNull(),
    position: int("position").default(1).notNull(),
  },
  table => [index("assessment_questions_assessment_position_idx").on(table.assessmentId, table.position)],
);

export const assessmentAttempts = mysqlTable(
  "assessment_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    assessmentId: int("assessmentId").notNull().references(() => assessments.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    attemptNumber: int("attemptNumber").notNull(),
    scorePercent: int("scorePercent").notNull(),
    passed: int("passed").default(0).notNull(),
    answersJson: text("answersJson"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("assessment_attempts_user_attempt_unique").on(table.assessmentId, table.userId, table.attemptNumber),
    index("assessment_attempts_assessment_user_idx").on(table.assessmentId, table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
