CREATE TABLE `event_clip_parts` (
	`event_id` text NOT NULL,
	`tg_chat_id` text NOT NULL,
	`part` integer NOT NULL,
	`message_id` integer NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `tg_chat_id`, `part`)
);
