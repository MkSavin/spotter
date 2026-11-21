ALTER TABLE `requests` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `delivered` integer DEFAULT false NOT NULL;