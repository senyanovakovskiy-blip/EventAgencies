CREATE TABLE `inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`search_text` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`status_changed_at` text NOT NULL,
	`closure_reason` text DEFAULT '' NOT NULL,
	`recommendations_json` text DEFAULT '[]' NOT NULL,
	`reply_text` text DEFAULT '' NOT NULL,
	`reply_basis` text DEFAULT '' NOT NULL,
	`last_mutation` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_owner_key` ON `inquiries` (`owner_id`,`key_hash`);--> statement-breakpoint
CREATE INDEX `inquiries_owner_status_id` ON `inquiries` (`owner_id`,`status`,`id`);--> statement-breakpoint
CREATE TABLE `inquiry_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inquiry_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`details_json` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiry_history_revision` ON `inquiry_history` (`inquiry_id`,`revision`);--> statement-breakpoint
CREATE INDEX `inquiry_history_owner_item` ON `inquiry_history` (`owner_id`,`inquiry_id`,`id`);