ALTER TABLE `assessment_questions` ADD `questionType` enum('multiple_choice','short_answer') DEFAULT 'multiple_choice' NOT NULL;--> statement-breakpoint
ALTER TABLE `course_modules` ADD `resourceKey` varchar(512);--> statement-breakpoint
ALTER TABLE `course_modules` ADD `resourceName` varchar(255);--> statement-breakpoint
ALTER TABLE `course_modules` ADD `resourceContentType` varchar(160);