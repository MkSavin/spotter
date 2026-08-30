CREATE TABLE `dialog_states` (
	`tg_user_id` text NOT NULL,
	`tg_chat_id` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`tg_user_id`, `tg_chat_id`)
);
