CREATE TABLE `devices` (
	`device_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`recipient_uuid` text NOT NULL,
	`role` text NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_unique` ON `devices` (`token`);