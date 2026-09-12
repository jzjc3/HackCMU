CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`original_name` text NOT NULL,
	`kind` text NOT NULL,
	`byte_size` integer NOT NULL,
	`request_key` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_unique` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_user_request_unique` ON `attachments` (`user_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `attachments_user_created_idx` ON `attachments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `worlds` (
	`user_id` text PRIMARY KEY NOT NULL,
	`document_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
