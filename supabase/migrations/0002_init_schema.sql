CREATE TYPE "public"."event_kind" AS ENUM('detection', 'recognition', 'sniper_match');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('pending', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."fusion_layer_name" AS ENUM('identity', 'web_presence', 'geographic', 'authenticity');--> statement-breakpoint
CREATE TYPE "public"."fusion_layer_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fusion_report_status" AS ENUM('processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."poi_category" AS ENUM('vip', 'guest', 'staff', 'banned', 'missing');--> statement-breakpoint
CREATE TYPE "public"."profile_role" AS ENUM('admin', 'operator');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_id" uuid,
	"kind" "event_kind" NOT NULL,
	"camera_id" text,
	"score" real NOT NULL,
	"frame_storage_path" text,
	"bbox" jsonb,
	"operator_id" uuid,
	"status" "event_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "face_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_id" uuid NOT NULL,
	"embedding" vector(512) NOT NULL,
	"source_storage_path" text NOT NULL,
	"quality_score" real NOT NULL,
	"authenticity_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fusion_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"layer" "fusion_layer_name" NOT NULL,
	"status" "fusion_layer_status" DEFAULT 'pending' NOT NULL,
	"latency_ms" integer,
	"payload" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fusion_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid,
	"query_storage_path" text NOT NULL,
	"status" "fusion_report_status" DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"category" "poi_category" NOT NULL,
	"notes" text,
	"threshold" real DEFAULT 0.55 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"role" "profile_role" DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_poi_id_poi_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."poi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_embeddings" ADD CONSTRAINT "face_embeddings_poi_id_poi_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."poi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fusion_layers" ADD CONSTRAINT "fusion_layers_report_id_fusion_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fusion_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_poi_idx" ON "events" USING btree ("poi_id");--> statement-breakpoint
CREATE INDEX "events_operator_idx" ON "events" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "face_embeddings_poi_idx" ON "face_embeddings" USING btree ("poi_id");--> statement-breakpoint
CREATE INDEX "fusion_layers_report_idx" ON "fusion_layers" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fusion_layers_report_layer_uniq" ON "fusion_layers" USING btree ("report_id","layer");--> statement-breakpoint
CREATE INDEX "fusion_reports_requested_by_idx" ON "fusion_reports" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "fusion_reports_created_at_idx" ON "fusion_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "poi_category_idx" ON "poi" USING btree ("category");--> statement-breakpoint
CREATE INDEX "poi_created_at_idx" ON "poi" USING btree ("created_at");