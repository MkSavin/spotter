CREATE TABLE `event_messages` (
	`event_id` text NOT NULL,
	`tg_chat_id` text NOT NULL,
	`message_id` integer NOT NULL,
	PRIMARY KEY(`event_id`, `tg_chat_id`)
);
--> statement-breakpoint
CREATE TABLE `tg_bindings` (
	`tg_user_id` text NOT NULL,
	`tg_chat_id` text NOT NULL,
	`recipient_uuid` text NOT NULL,
	`username` text,
	`role` text DEFAULT 'VIEWER' NOT NULL,
	`authorized_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`tg_user_id`, `tg_chat_id`)
);
--> statement-breakpoint
CREATE TABLE `tg_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`authorized_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
