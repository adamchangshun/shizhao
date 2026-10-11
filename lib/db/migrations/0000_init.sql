CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text,
	`width` integer,
	`height` integer,
	`sha256` text,
	`bytes` integer,
	`text` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_project_idx` ON `assets` (`project_id`);--> statement-breakpoint
CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`field` text NOT NULL,
	`suggested_value` text NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`result_revision` integer,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`processing_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "corrections_suggested_value_len" CHECK(length("corrections"."suggested_value") <= 100),
	CONSTRAINT "corrections_note_len" CHECK("corrections"."note" IS NULL OR length("corrections"."note") <= 200)
);
--> statement-breakpoint
CREATE INDEX `corrections_project_status_idx` ON `corrections` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `fact_sheets` (
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`json` text NOT NULL,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `revision`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fact_revision` integer NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`seed` integer NOT NULL,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_active_per_project` ON `jobs` (`project_id`) WHERE status NOT IN ('succeeded','failed','timed_out');--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`published_version_id` text,
	`unpublished_at` text,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `usage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`project_id` text NOT NULL,
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
CREATE INDEX `usage_job_idx` ON `usage_records` (`job_id`);--> statement-breakpoint
CREATE INDEX `usage_project_idx` ON `usage_records` (`project_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text,
	`origin` text NOT NULL,
	`fact_revision` integer NOT NULL,
	`design_spec` text NOT NULL,
	`copy` text NOT NULL,
	`copy_refs` text NOT NULL,
	`guard` text NOT NULL,
	`html_path` text NOT NULL,
	`qa` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `versions_project_idx` ON `versions` (`project_id`);--> statement-breakpoint
CREATE TABLE `visit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`source` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `visit_project_created_idx` ON `visit_events` (`project_id`,`created_at`);