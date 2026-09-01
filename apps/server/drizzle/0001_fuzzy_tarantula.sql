ALTER TABLE `recipients` ADD `device_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `recipients_device_id_unique` ON `recipients` (`device_id`);