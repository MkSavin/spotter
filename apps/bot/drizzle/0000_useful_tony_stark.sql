CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`authorized_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_messages` (
	`event_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` integer NOT NULL,
	PRIMARY KEY(`event_id`, `chat_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
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
	`type` text DEFAULT 'start' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text NOT NULL,
	`chat_id` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`token` text NOT NULL,
	`authorized_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`id`, `chat_id`)
);
