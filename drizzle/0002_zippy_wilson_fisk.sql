ALTER TABLE "design_family" ADD COLUMN "print_file_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "design_family" ADD COLUMN "provenance_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "design_family" ADD COLUMN "rights_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "experiment" ADD COLUMN "hero_creative_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "storefront" ADD COLUMN "niche_brief" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "design_family" ADD CONSTRAINT "design_family_print_file_asset_id_brand_asset_id_fk" FOREIGN KEY ("print_file_asset_id") REFERENCES "public"."brand_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_hero_creative_asset_id_brand_asset_id_fk" FOREIGN KEY ("hero_creative_asset_id") REFERENCES "public"."brand_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_created_at_idx" ON "audit_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "experiment_window_idx" ON "experiment" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "integration_issue_status_idx" ON "integration_issue" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "ledger_order_idx" ON "ledger_entry" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_occurred_at_idx" ON "ledger_entry" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "legal_document_published_idx" ON "legal_document" USING btree ("type","published_at");--> statement-breakpoint
CREATE INDEX "order_projection_ordered_at_idx" ON "order_projection" USING btree ("ordered_at");--> statement-breakpoint
CREATE INDEX "sync_run_provider_started_idx" ON "sync_run" USING btree ("provider","started_at");--> statement-breakpoint
ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_size_check" CHECK ("brand_asset"."size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_budget_check" CHECK ("experiment"."budget_minor" >= 0);--> statement-breakpoint
ALTER TABLE "legal_document" ADD CONSTRAINT "legal_document_version_check" CHECK ("legal_document"."version" > 0);--> statement-breakpoint
ALTER TABLE "order_line_projection" ADD CONSTRAINT "order_line_quantity_check" CHECK ("order_line_projection"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_slug_check" CHECK ("storefront"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "storefront" ADD CONSTRAINT "storefront_draft_revision_check" CHECK ("storefront"."draft_revision" > 0);--> statement-breakpoint
ALTER TABLE "storefront_revision" ADD CONSTRAINT "storefront_revision_number_check" CHECK ("storefront_revision"."revision" > 0);