CREATE TABLE `admin_invitations` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invitations_token_hash` ON `admin_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admin_invitations_owner_expiry` ON `admin_invitations` (`owner_id`,`expires_at`);