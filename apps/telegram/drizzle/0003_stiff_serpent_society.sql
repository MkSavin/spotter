CREATE TABLE `catalog_snapshots` (
	`source` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
