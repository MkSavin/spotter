CREATE TABLE `clip_waits` (
	`event_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
