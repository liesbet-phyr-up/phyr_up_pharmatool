CREATE TABLE `assessment_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessmentId` int NOT NULL,
	`userId` int NOT NULL,
	`attemptNumber` int NOT NULL,
	`scorePercent` int NOT NULL,
	`passed` int NOT NULL DEFAULT 0,
	`answersJson` text,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assessment_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `assessment_attempts_user_attempt_unique` UNIQUE(`assessmentId`,`userId`,`attemptNumber`)
);
--> statement-breakpoint
CREATE TABLE `assessment_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessmentId` int NOT NULL,
	`prompt` text NOT NULL,
	`choicesJson` text NOT NULL,
	`correctChoice` varchar(255) NOT NULL,
	`position` int NOT NULL DEFAULT 1,
	CONSTRAINT `assessment_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`moduleId` int,
	`title` varchar(240) NOT NULL,
	`passingMark` int NOT NULL DEFAULT 80,
	`attemptLimit` int NOT NULL DEFAULT 3,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('not_started','in_progress','completed','overdue') NOT NULL DEFAULT 'not_started',
	`progressPercent` int NOT NULL DEFAULT 0,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`dueAt` timestamp,
	CONSTRAINT `course_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_enrollments_user_course_unique` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
CREATE TABLE `course_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`moduleType` enum('video','document','slides','lesson','quiz','acknowledgement') NOT NULL,
	`body` text,
	`resourceUrl` text,
	`position` int NOT NULL DEFAULT 1,
	`estimatedMinutes` int NOT NULL DEFAULT 0,
	`isRequired` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(240) NOT NULL,
	`summary` text,
	`category` enum('product_training','self_development','business_training_101','kpis','regulatory_training') NOT NULL,
	`audience` varchar(160),
	`estimatedMinutes` int NOT NULL DEFAULT 0,
	`isRequired` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`branch` varchar(160),
	`region` varchar(160),
	`jobRole` varchar(160),
	`managerName` varchar(160),
	`productTeam` varchar(160),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `module_completions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleId` int NOT NULL,
	`userId` int NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`acknowledgementConfirmedAt` timestamp,
	CONSTRAINT `module_completions_id` PRIMARY KEY(`id`),
	CONSTRAINT `module_completions_user_module_unique` UNIQUE(`userId`,`moduleId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('learner','trainer','admin') NOT NULL DEFAULT 'learner';--> statement-breakpoint
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_assessmentId_assessments_id_fk` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assessment_questions` ADD CONSTRAINT `assessment_questions_assessmentId_assessments_id_fk` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_moduleId_course_modules_id_fk` FOREIGN KEY (`moduleId`) REFERENCES `course_modules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_modules` ADD CONSTRAINT `course_modules_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD CONSTRAINT `employee_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `module_completions` ADD CONSTRAINT `module_completions_moduleId_course_modules_id_fk` FOREIGN KEY (`moduleId`) REFERENCES `course_modules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `module_completions` ADD CONSTRAINT `module_completions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assessment_attempts_assessment_user_idx` ON `assessment_attempts` (`assessmentId`,`userId`);--> statement-breakpoint
CREATE INDEX `assessment_questions_assessment_position_idx` ON `assessment_questions` (`assessmentId`,`position`);--> statement-breakpoint
CREATE INDEX `assessments_course_idx` ON `assessments` (`courseId`);--> statement-breakpoint
CREATE INDEX `course_enrollments_course_status_idx` ON `course_enrollments` (`courseId`,`status`);--> statement-breakpoint
CREATE INDEX `course_enrollments_user_status_idx` ON `course_enrollments` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `course_modules_course_position_idx` ON `course_modules` (`courseId`,`position`);--> statement-breakpoint
CREATE INDEX `courses_category_idx` ON `courses` (`category`);--> statement-breakpoint
CREATE INDEX `courses_status_idx` ON `courses` (`status`);