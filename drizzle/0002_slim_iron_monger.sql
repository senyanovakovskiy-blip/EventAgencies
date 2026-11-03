CREATE TABLE `project_copies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`snapshot_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_copies_owner_key` ON `project_copies` (`owner_id`,`key_hash`);--> statement-breakpoint
CREATE INDEX `project_copies_owner_id` ON `project_copies` (`owner_id`,`id`);