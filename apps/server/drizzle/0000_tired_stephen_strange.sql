CREATE TABLE `access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`username` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`camera` text NOT NULL,
	`label` text,
	`start_time` real NOT NULL,
	`end_time` real,
	`score` real NOT NULL,
	`stationary` integer DEFAULT false NOT NULL,
	`has_clip` integer DEFAULT false NOT NULL,
	`has_snapshot` integer DEFAULT false NOT NULL,
	`type` text DEFAULT 'start' NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE TABLE `recipients` (
	`uuid` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`tg_user_id` text,
	`username` text,
	`authorized_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipients_tg_user_id_unique` ON `recipients` (`tg_user_id`);