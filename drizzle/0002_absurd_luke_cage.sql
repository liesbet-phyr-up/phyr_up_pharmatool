CREATE TABLE `staff_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(80) NOT NULL,
	`role` enum('learner','trainer','admin') NOT NULL DEFAULT 'learner',
	`branch` varchar(160),
	`region` varchar(160),
	`jobRole` varchar(160),
	`managerName` varchar(160),
	`productTeam` varchar(160),
	`invitedBy` int NOT NULL,
	`expiresAt` timestamp,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `accessStatus` enum('pending','active','revoked') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff_invites` ADD CONSTRAINT `staff_invites_invitedBy_users_id_fk` FOREIGN KEY (`invitedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_invites_email_idx` ON `staff_invites` (`email`);