-- Added nullable and backfilled, rather than with a DEFAULT: SQLite refuses a
-- non-constant default on ALTER TABLE ADD COLUMN when the table already has
-- rows, which is every deployment that has ever sent a message. New rows get
-- their stamp from the application (`$defaultFn` on the column).
ALTER TABLE `event_messages` ADD `sent_at` integer;--> statement-breakpoint
UPDATE `event_messages` SET `sent_at` = (unixepoch() * 1000) WHERE `sent_at` IS NULL;
