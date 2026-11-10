CREATE TABLE `project_copy_tombstones` (
	`owner_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`deleted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_copy_tombstones_owner_key` ON `project_copy_tombstones` (`owner_id`,`key_hash`);