CREATE TABLE `timelapse_waits` (
	`camera` text NOT NULL,
	`tg_chat_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`message_id` integer,
	`started_at` integer,
	`requested_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`camera`, `start`, `tg_chat_id`)
);
