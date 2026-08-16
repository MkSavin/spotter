CREATE TABLE `service_versions` (
	`node` text NOT NULL,
	`service` text NOT NULL,
	`version` text NOT NULL,
	`seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`node`, `service`)
);
