ALTER TABLE `access_tokens` ADD `platform` text;--> statement-breakpoint
ALTER TABLE `recipients` ADD `appercot_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recipients_appercot_user_id_unique` ON `recipients` (`appercot_user_id`);