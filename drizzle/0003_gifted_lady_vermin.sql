CREATE TABLE "printful_shipment_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"printful_shipment_id" text NOT NULL,
	"status" text NOT NULL,
	"delivery_status" text,
	"carrier" text,
	"tracking_number" text,
	"tracking_url" text,
	"provider_created_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "product_mapping_family_garment_idx";--> statement-breakpoint
ALTER TABLE "attribution_touch" ADD COLUMN "fbp" text;--> statement-breakpoint
ALTER TABLE "attribution_touch" ADD COLUMN "fbc" text;--> statement-breakpoint
ALTER TABLE "attribution_touch" ADD COLUMN "marketing_consent_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_asset" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fulfillment_projection" ADD COLUMN "provider_adjustment_minor" bigint;--> statement-breakpoint
ALTER TABLE "fulfillment_projection" ADD COLUMN "total_cost_minor" bigint;--> statement-breakpoint
ALTER TABLE "product_mapping" ADD COLUMN "provider_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "storefront_revision" ADD COLUMN "catalog_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "printful_shipment_projection" ADD CONSTRAINT "printful_shipment_projection_fulfillment_id_fulfillment_projection_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillment_projection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "printful_shipment_printful_idx" ON "printful_shipment_projection" USING btree ("printful_shipment_id");--> statement-breakpoint
CREATE INDEX "printful_shipment_fulfillment_idx" ON "printful_shipment_projection" USING btree ("fulfillment_id");--> statement-breakpoint
CREATE INDEX "printful_shipment_shipped_at_idx" ON "printful_shipment_projection" USING btree ("shipped_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_mapping_experiment_idx" ON "campaign_mapping" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_mapping_active_family_garment_idx" ON "product_mapping" USING btree ("design_family_id","garment") WHERE "product_mapping"."active" = true;--> statement-breakpoint
ALTER TABLE "storefront_revision" ADD CONSTRAINT "storefront_revision_publication_snapshot_check" CHECK ("storefront_revision"."published_at" is null or "storefront_revision"."catalog_snapshot" is not null);