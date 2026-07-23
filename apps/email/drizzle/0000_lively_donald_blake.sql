CREATE TABLE `notified_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`notified_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
