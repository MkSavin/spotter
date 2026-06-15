CREATE TABLE `access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`username` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`token` text NOT NULL,
	`authorized_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`id`, `chat_id`)
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "chat_id", "role", "token", "authorized_at") SELECT "id", "chat_id", "role", "token", "authorized_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;