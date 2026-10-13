CREATE TABLE `guard_quota` (
	`key_hash` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key_hash`, `day`),
	CONSTRAINT "guard_quota_nonnegative" CHECK("guard_quota"."count" >= 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_usage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`project_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`stage` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_cny` real NOT NULL,
	`latency_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_usage_records`("id", "job_id", "project_id", "provider", "model", "stage", "input_tokens", "output_tokens", "cost_cny", "latency_ms", "created_at") SELECT "id", "job_id", "project_id", "provider", "model", "stage", "input_tokens", "output_tokens", "cost_cny", "latency_ms", "created_at" FROM `usage_records`;--> statement-breakpoint
DROP TABLE `usage_records`;--> statement-breakpoint
ALTER TABLE `__new_usage_records` RENAME TO `usage_records`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `usage_job_idx` ON `usage_records` (`job_id`);--> statement-breakpoint
CREATE INDEX `usage_project_idx` ON `usage_records` (`project_id`);