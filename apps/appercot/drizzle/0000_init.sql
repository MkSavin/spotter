CREATE TABLE `catalogs` (
	`source` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient_uuid` text,
	`role` text,
	`blocked` integer DEFAULT false NOT NULL,
	`muted_until` integer
);
--> statement-breakpoint
CREATE TABLE `event_messages` (
	`event_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text NOT NULL,
	`photo_key` text,
	`file_id` text,
	PRIMARY KEY(`event_id`, `chat_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_messages_chat_id_message_id_unique` ON `event_messages` (`chat_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`snapshot_key` text,
	`clip_key` text,
	`clip_until` integer,
	`clip_status` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text,
	`sent` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`recipient_uuid` text NOT NULL,
	`message_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`key` text,
	`file_id` text,
	`created_at` integer NOT NULL
);
