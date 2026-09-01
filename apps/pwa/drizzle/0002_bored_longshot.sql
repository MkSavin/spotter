CREATE TABLE `timelapses` (
	`id` text PRIMARY KEY NOT NULL,
	`camera` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`speed` text NOT NULL,
	`state` text NOT NULL,
	`video_key` text,
	`reason` text,
	`requested_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
