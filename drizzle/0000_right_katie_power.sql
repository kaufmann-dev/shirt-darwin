CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_daily_metric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"metric_date" text NOT NULL,
	"currency" text NOT NULL,
	"spend_minor" bigint DEFAULT 0 NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"meta_purchases" numeric(14, 4) DEFAULT 0 NOT NULL,
	"meta_purchase_value_minor" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_touch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"click_id" text NOT NULL,
	"experiment_id" uuid NOT NULL,
	"campaign_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"clicked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_subject" text NOT NULL,
	"actor_client" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"input_hash" text,
	"before_revision" integer,
	"after_revision" integer,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"original_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_asset_visibility_check" CHECK ("brand_asset"."visibility" in ('private', 'public'))
);
--> statement-breakpoint
CREATE TABLE "campaign_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_set_id" text,
	"ad_id" text,
	"tracking_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_family" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"mockup_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"storefront_revision_id" uuid,
	"hero_product_mapping_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"budget_minor" bigint NOT NULL,
	"budget_currency" text NOT NULL,
	"outcome" text,
	"outcome_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_dates_check" CHECK ("experiment"."ends_at" > "experiment"."starts_at"),
	CONSTRAINT "experiment_outcome_check" CHECK ("experiment"."outcome" is null or "experiment"."outcome" in ('keep', 'iterate', 'retire'))
);
--> statement-breakpoint
CREATE TABLE "experiment_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"notes" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_decision_outcome_check" CHECK ("experiment_decision"."outcome" in ('keep', 'iterate', 'retire'))
);
--> statement-breakpoint
CREATE TABLE "fulfillment_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"printful_order_id" text NOT NULL,
	"status" text NOT NULL,
	"currency" text,
	"product_cost_minor" bigint,
	"shipping_cost_minor" bigint,
	"tax_minor" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_key" text NOT NULL,
	"provider" text,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_issue_severity_check" CHECK ("integration_issue"."severity" in ('info', 'warning', 'critical')),
	CONSTRAINT "integration_issue_status_check" CHECK ("integration_issue"."status" in ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid,
	"order_id" uuid,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_reference" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"supersedes_entry_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reporting_amount_minor" bigint,
	"fx_rate" numeric(20, 10),
	"fx_status" text DEFAULT 'estimated' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_fx_status_check" CHECK ("ledger_entry"."fx_status" in ('estimated', 'actual'))
);
--> statement-breakpoint
CREATE TABLE "legal_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"version" integer NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"touch_id" uuid,
	"experiment_id" uuid NOT NULL,
	"is_hero_order" boolean DEFAULT false NOT NULL,
	"attribution_method" text DEFAULT 'first-party-last-click' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_line_item_id" text NOT NULL,
	"product_mapping_id" uuid,
	"quantity" integer NOT NULL,
	"revenue_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_order_id" text NOT NULL,
	"order_number" text NOT NULL,
	"region_code" text,
	"currency" text NOT NULL,
	"merchandise_revenue_minor" bigint DEFAULT 0 NOT NULL,
	"shipping_revenue_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_collected_minor" bigint DEFAULT 0 NOT NULL,
	"refund_minor" bigint DEFAULT 0 NOT NULL,
	"financial_status" text NOT NULL,
	"fulfillment_status" text,
	"ordered_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_overhead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_family_id" uuid NOT NULL,
	"garment" text NOT NULL,
	"shopify_product_id" text NOT NULL,
	"shopify_handle" text NOT NULL,
	"printful_product_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_mapping_garment_check" CHECK ("product_mapping"."garment" in ('tshirt', 'hoodie', 'crewneck'))
);
--> statement-breakpoint
CREATE TABLE "provider_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_key" text NOT NULL,
	"topic" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "storefront" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"published_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_status_check" CHECK ("storefront"."status" in ('draft', 'live', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "storefront_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_daily_metric" ADD CONSTRAINT "ad_daily_metric_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touch" ADD CONSTRAINT "attribution_touch_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_asset" ADD CONSTRAINT "brand_asset_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_mapping" ADD CONSTRAINT "campaign_mapping_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_family" ADD CONSTRAINT "design_family_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_family" ADD CONSTRAINT "design_family_mockup_asset_id_brand_asset_id_fk" FOREIGN KEY ("mockup_asset_id") REFERENCES "public"."brand_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_storefront_revision_id_storefront_revision_id_fk" FOREIGN KEY ("storefront_revision_id") REFERENCES "public"."storefront_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment" ADD CONSTRAINT "experiment_hero_product_mapping_id_product_mapping_id_fk" FOREIGN KEY ("hero_product_mapping_id") REFERENCES "public"."product_mapping"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_decision" ADD CONSTRAINT "experiment_decision_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_projection" ADD CONSTRAINT "fulfillment_projection_order_id_order_projection_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_projection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_order_id_order_projection_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_projection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_supersedes_entry_id_ledger_entry_id_fk" FOREIGN KEY ("supersedes_entry_id") REFERENCES "public"."ledger_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attribution" ADD CONSTRAINT "order_attribution_order_id_order_projection_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_projection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attribution" ADD CONSTRAINT "order_attribution_touch_id_attribution_touch_id_fk" FOREIGN KEY ("touch_id") REFERENCES "public"."attribution_touch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attribution" ADD CONSTRAINT "order_attribution_experiment_id_experiment_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_projection" ADD CONSTRAINT "order_line_projection_order_id_order_projection_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_projection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_projection" ADD CONSTRAINT "order_line_projection_product_mapping_id_product_mapping_id_fk" FOREIGN KEY ("product_mapping_id") REFERENCES "public"."product_mapping"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mapping" ADD CONSTRAINT "product_mapping_design_family_id_design_family_id_fk" FOREIGN KEY ("design_family_id") REFERENCES "public"."design_family"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_revision" ADD CONSTRAINT "storefront_revision_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_daily_metric_unique_idx" ON "ad_daily_metric" USING btree ("campaign_id","metric_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attribution_click_idx" ON "attribution_touch" USING btree ("click_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_asset_object_key_idx" ON "brand_asset" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "brand_asset_storefront_idx" ON "brand_asset" USING btree ("storefront_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_mapping_campaign_idx" ON "campaign_mapping" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_mapping_tracking_idx" ON "campaign_mapping" USING btree ("tracking_token");--> statement-breakpoint
CREATE UNIQUE INDEX "design_family_storefront_slug_idx" ON "design_family" USING btree ("storefront_id","slug");--> statement-breakpoint
CREATE INDEX "experiment_storefront_idx" ON "experiment" USING btree ("storefront_id");--> statement-breakpoint
CREATE INDEX "experiment_decision_experiment_idx" ON "experiment_decision" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_printful_idx" ON "fulfillment_projection" USING btree ("printful_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_issue_key_idx" ON "integration_issue" USING btree ("issue_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_source_reference_idx" ON "ledger_entry" USING btree ("source","source_reference","kind","revision");--> statement-breakpoint
CREATE INDEX "ledger_experiment_idx" ON "ledger_entry" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_document_type_version_idx" ON "legal_document" USING btree ("type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_attribution_order_idx" ON "order_attribution" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_line_shopify_idx" ON "order_line_projection" USING btree ("shopify_line_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_projection_shopify_idx" ON "order_projection" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_mapping_family_garment_idx" ON "product_mapping" USING btree ("design_family_id","garment");--> statement-breakpoint
CREATE UNIQUE INDEX "product_mapping_shopify_idx" ON "product_mapping" USING btree ("shopify_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_event_key_idx" ON "provider_event" USING btree ("provider","external_key");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_slug_idx" ON "storefront" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_revision_unique_idx" ON "storefront_revision" USING btree ("storefront_id","revision");--> statement-breakpoint
CREATE INDEX "storefront_revision_storefront_idx" ON "storefront_revision" USING btree ("storefront_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");