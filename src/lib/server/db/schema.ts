import type { BrandManifest } from '$lib/domain/brand';
import type { StorefrontCatalogSnapshot } from '$lib/domain/storefront-catalog';
import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
};

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	...timestamps
});

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		token: text('token').notNull().unique(),
		...timestamps,
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [index('session_user_id_idx').on(table.userId)]
);

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		...timestamps
	},
	(table) => [index('account_user_id_idx').on(table.userId)]
);

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		...timestamps
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

export const storefront = pgTable(
	'storefront',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		nicheBrief: text('niche_brief').default('').notNull(),
		status: text('status').default('draft').notNull(),
		draftRevision: integer('draft_revision').default(1).notNull(),
		publishedRevisionId: uuid('published_revision_id').references(
			(): AnyPgColumn => storefrontRevision.id,
			{ onDelete: 'set null' }
		),
		...timestamps
	},
	(table) => [
		uniqueIndex('storefront_slug_idx').on(table.slug),
		check('storefront_status_check', sql`${table.status} in ('draft', 'live', 'archived')`),
		check('storefront_slug_check', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
		check('storefront_draft_revision_check', sql`${table.draftRevision} > 0`)
	]
);

export const storefrontRevision = pgTable(
	'storefront_revision',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		storefrontId: uuid('storefront_id')
			.notNull()
			.references(() => storefront.id, { onDelete: 'cascade' }),
		revision: integer('revision').notNull(),
		manifest: jsonb('manifest').$type<BrandManifest>().notNull(),
		catalogSnapshot: jsonb('catalog_snapshot').$type<StorefrontCatalogSnapshot>(),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		createdBy: text('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('storefront_revision_unique_idx').on(table.storefrontId, table.revision),
		index('storefront_revision_storefront_idx').on(table.storefrontId),
		check('storefront_revision_number_check', sql`${table.revision} > 0`),
		check(
			'storefront_revision_publication_snapshot_check',
			sql`${table.publishedAt} is null or ${table.catalogSnapshot} is not null`
		)
	]
);

export const brandAsset = pgTable(
	'brand_asset',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		storefrontId: uuid('storefront_id')
			.notNull()
			.references(() => storefront.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		visibility: text('visibility').default('private').notNull(),
		objectKey: text('object_key').notNull(),
		contentType: text('content_type').notNull(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
		originalName: text('original_name').notNull(),
		confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('brand_asset_object_key_idx').on(table.objectKey),
		index('brand_asset_storefront_idx').on(table.storefrontId),
		check('brand_asset_visibility_check', sql`${table.visibility} in ('private', 'public')`),
		check('brand_asset_size_check', sql`${table.sizeBytes} > 0`)
	]
);

export const designFamily = pgTable(
	'design_family',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		storefrontId: uuid('storefront_id')
			.notNull()
			.references(() => storefront.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull(),
		mockupAssetId: uuid('mockup_asset_id').references(() => brandAsset.id, {
			onDelete: 'set null'
		}),
		printFileAssetId: uuid('print_file_asset_id').references(() => brandAsset.id, {
			onDelete: 'set null'
		}),
		provenanceNotes: text('provenance_notes').default('').notNull(),
		rightsReviewedAt: timestamp('rights_reviewed_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [uniqueIndex('design_family_storefront_slug_idx').on(table.storefrontId, table.slug)]
);

export const productMapping = pgTable(
	'product_mapping',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		designFamilyId: uuid('design_family_id')
			.notNull()
			.references(() => designFamily.id, { onDelete: 'cascade' }),
		garment: text('garment').notNull(),
		shopifyProductId: text('shopify_product_id').notNull(),
		shopifyHandle: text('shopify_handle').notNull(),
		printfulProductId: text('printful_product_id'),
		active: boolean('active').default(true).notNull(),
		providerAvailable: boolean('provider_available').default(true).notNull(),
		productSnapshot: jsonb('product_snapshot').$type<Record<string, unknown>>().notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('product_mapping_active_family_garment_idx')
			.on(table.designFamilyId, table.garment)
			.where(sql`${table.active} = true`),
		uniqueIndex('product_mapping_shopify_idx').on(table.shopifyProductId),
		check(
			'product_mapping_garment_check',
			sql`${table.garment} in ('tshirt', 'hoodie', 'crewneck')`
		)
	]
);

export const experiment = pgTable(
	'experiment',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		storefrontId: uuid('storefront_id')
			.notNull()
			.references(() => storefront.id),
		storefrontRevisionId: uuid('storefront_revision_id').references(() => storefrontRevision.id),
		heroProductMappingId: uuid('hero_product_mapping_id')
			.notNull()
			.references(() => productMapping.id),
		heroCreativeAssetId: uuid('hero_creative_asset_id').references(() => brandAsset.id, {
			onDelete: 'set null'
		}),
		name: text('name').notNull(),
		startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
		endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
		endedAt: timestamp('ended_at', { withTimezone: true }),
		budgetMinor: bigint('budget_minor', { mode: 'number' }).notNull(),
		budgetCurrency: text('budget_currency').notNull(),
		outcome: text('outcome'),
		outcomeNotes: text('outcome_notes'),
		...timestamps
	},
	(table) => [
		index('experiment_storefront_idx').on(table.storefrontId),
		index('experiment_window_idx').on(table.startsAt, table.endsAt),
		check('experiment_dates_check', sql`${table.endsAt} > ${table.startsAt}`),
		check('experiment_budget_check', sql`${table.budgetMinor} >= 0`),
		check(
			'experiment_outcome_check',
			sql`${table.outcome} is null or ${table.outcome} in ('keep', 'iterate', 'retire')`
		)
	]
);

export const campaignMapping = pgTable(
	'campaign_mapping',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		experimentId: uuid('experiment_id')
			.notNull()
			.references(() => experiment.id, { onDelete: 'cascade' }),
		campaignId: text('campaign_id').notNull(),
		adSetId: text('ad_set_id'),
		adId: text('ad_id'),
		trackingToken: text('tracking_token').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('campaign_mapping_experiment_idx').on(table.experimentId),
		uniqueIndex('campaign_mapping_campaign_idx').on(table.campaignId),
		uniqueIndex('campaign_mapping_tracking_idx').on(table.trackingToken)
	]
);

export const experimentDecision = pgTable(
	'experiment_decision',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		experimentId: uuid('experiment_id')
			.notNull()
			.references(() => experiment.id, { onDelete: 'cascade' }),
		outcome: text('outcome').notNull(),
		notes: text('notes').notNull(),
		decidedBy: text('decided_by').notNull(),
		decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('experiment_decision_experiment_idx').on(table.experimentId),
		check(
			'experiment_decision_outcome_check',
			sql`${table.outcome} in ('keep', 'iterate', 'retire')`
		)
	]
);

export const orderProjection = pgTable(
	'order_projection',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		shopifyOrderId: text('shopify_order_id').notNull(),
		orderNumber: text('order_number').notNull(),
		regionCode: text('region_code'),
		currency: text('currency').notNull(),
		merchandiseRevenueMinor: bigint('merchandise_revenue_minor', { mode: 'number' })
			.default(0)
			.notNull(),
		shippingRevenueMinor: bigint('shipping_revenue_minor', { mode: 'number' }).default(0).notNull(),
		discountMinor: bigint('discount_minor', { mode: 'number' }).default(0).notNull(),
		taxCollectedMinor: bigint('tax_collected_minor', { mode: 'number' }).default(0).notNull(),
		refundMinor: bigint('refund_minor', { mode: 'number' }).default(0).notNull(),
		financialStatus: text('financial_status').notNull(),
		fulfillmentStatus: text('fulfillment_status'),
		orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('order_projection_shopify_idx').on(table.shopifyOrderId),
		index('order_projection_ordered_at_idx').on(table.orderedAt)
	]
);

export const orderLineProjection = pgTable(
	'order_line_projection',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderId: uuid('order_id')
			.notNull()
			.references(() => orderProjection.id, { onDelete: 'cascade' }),
		shopifyLineItemId: text('shopify_line_item_id').notNull(),
		productMappingId: uuid('product_mapping_id').references(() => productMapping.id),
		quantity: integer('quantity').notNull(),
		revenueMinor: bigint('revenue_minor', { mode: 'number' }).notNull()
	},
	(table) => [
		uniqueIndex('order_line_shopify_idx').on(table.shopifyLineItemId),
		check('order_line_quantity_check', sql`${table.quantity} > 0`)
	]
);

export const fulfillmentProjection = pgTable(
	'fulfillment_projection',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderId: uuid('order_id')
			.notNull()
			.references(() => orderProjection.id, { onDelete: 'cascade' }),
		printfulOrderId: text('printful_order_id').notNull(),
		status: text('status').notNull(),
		currency: text('currency'),
		productCostMinor: bigint('product_cost_minor', { mode: 'number' }),
		shippingCostMinor: bigint('shipping_cost_minor', { mode: 'number' }),
		taxMinor: bigint('tax_minor', { mode: 'number' }),
		providerAdjustmentMinor: bigint('provider_adjustment_minor', { mode: 'number' }),
		totalCostMinor: bigint('total_cost_minor', { mode: 'number' }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [uniqueIndex('fulfillment_printful_idx').on(table.printfulOrderId)]
);

export const printfulShipmentProjection = pgTable(
	'printful_shipment_projection',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		fulfillmentId: uuid('fulfillment_id')
			.notNull()
			.references(() => fulfillmentProjection.id, { onDelete: 'cascade' }),
		printfulShipmentId: text('printful_shipment_id').notNull(),
		status: text('status').notNull(),
		deliveryStatus: text('delivery_status'),
		carrier: text('carrier'),
		trackingNumber: text('tracking_number'),
		trackingUrl: text('tracking_url'),
		providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }),
		shippedAt: timestamp('shipped_at', { withTimezone: true }),
		deliveredAt: timestamp('delivered_at', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('printful_shipment_printful_idx').on(table.printfulShipmentId),
		index('printful_shipment_fulfillment_idx').on(table.fulfillmentId),
		index('printful_shipment_shipped_at_idx').on(table.shippedAt)
	]
);

export const attributionTouch = pgTable(
	'attribution_touch',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		clickId: text('click_id').notNull(),
		experimentId: uuid('experiment_id')
			.notNull()
			.references(() => experiment.id, { onDelete: 'cascade' }),
		campaignId: text('campaign_id'),
		utmSource: text('utm_source'),
		utmMedium: text('utm_medium'),
		utmCampaign: text('utm_campaign'),
		fbp: text('fbp'),
		fbc: text('fbc'),
		clickedAt: timestamp('clicked_at', { withTimezone: true }).notNull(),
		marketingConsentRevokedAt: timestamp('marketing_consent_revoked_at', { withTimezone: true })
	},
	(table) => [uniqueIndex('attribution_click_idx').on(table.clickId)]
);

export const orderAttribution = pgTable(
	'order_attribution',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderId: uuid('order_id')
			.notNull()
			.references(() => orderProjection.id, { onDelete: 'cascade' }),
		touchId: uuid('touch_id').references(() => attributionTouch.id),
		experimentId: uuid('experiment_id')
			.notNull()
			.references(() => experiment.id),
		isHeroOrder: boolean('is_hero_order').default(false).notNull(),
		attributionMethod: text('attribution_method').default('first-party-last-click').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [uniqueIndex('order_attribution_order_idx').on(table.orderId)]
);

export const adDailyMetric = pgTable(
	'ad_daily_metric',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		experimentId: uuid('experiment_id')
			.notNull()
			.references(() => experiment.id, { onDelete: 'cascade' }),
		campaignId: text('campaign_id').notNull(),
		metricDate: text('metric_date').notNull(),
		currency: text('currency').notNull(),
		spendMinor: bigint('spend_minor', { mode: 'number' }).default(0).notNull(),
		impressions: bigint('impressions', { mode: 'number' }).default(0).notNull(),
		clicks: bigint('clicks', { mode: 'number' }).default(0).notNull(),
		metaPurchases: numeric('meta_purchases', { precision: 14, scale: 4, mode: 'number' })
			.default(0)
			.notNull(),
		metaPurchaseValueMinor: bigint('meta_purchase_value_minor', { mode: 'number' })
			.default(0)
			.notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [uniqueIndex('ad_daily_metric_unique_idx').on(table.campaignId, table.metricDate)]
);

export const ledgerEntry = pgTable(
	'ledger_entry',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		experimentId: uuid('experiment_id').references(() => experiment.id),
		orderId: uuid('order_id').references(() => orderProjection.id),
		kind: text('kind').notNull(),
		source: text('source').notNull(),
		sourceReference: text('source_reference').notNull(),
		revision: integer('revision').default(1).notNull(),
		supersedesEntryId: uuid('supersedes_entry_id').references((): AnyPgColumn => ledgerEntry.id),
		amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
		currency: text('currency').notNull(),
		reportingAmountMinor: bigint('reporting_amount_minor', { mode: 'number' }),
		fxRate: numeric('fx_rate', { precision: 20, scale: 10, mode: 'number' }),
		fxStatus: text('fx_status').default('estimated').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('ledger_source_reference_idx').on(
			table.source,
			table.sourceReference,
			table.kind,
			table.revision
		),
		index('ledger_experiment_idx').on(table.experimentId),
		index('ledger_order_idx').on(table.orderId),
		index('ledger_occurred_at_idx').on(table.occurredAt),
		check('ledger_fx_status_check', sql`${table.fxStatus} in ('estimated', 'actual')`)
	]
);

export const portfolioOverhead = pgTable('portfolio_overhead', {
	id: uuid('id').defaultRandom().primaryKey(),
	month: text('month').notNull(),
	label: text('label').notNull(),
	amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
	currency: text('currency').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const providerEvent = pgTable(
	'provider_event',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		provider: text('provider').notNull(),
		externalKey: text('external_key').notNull(),
		topic: text('topic').notNull(),
		payloadHash: text('payload_hash').notNull(),
		status: text('status').default('pending').notNull(),
		error: text('error'),
		receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true })
	},
	(table) => [uniqueIndex('provider_event_key_idx').on(table.provider, table.externalKey)]
);

export const syncRun = pgTable(
	'sync_run',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		provider: text('provider').notNull(),
		trigger: text('trigger').notNull(),
		status: text('status').default('running').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		recordsRead: integer('records_read').default(0).notNull(),
		recordsWritten: integer('records_written').default(0).notNull(),
		error: text('error')
	},
	(table) => [index('sync_run_provider_started_idx').on(table.provider, table.startedAt)]
);

export const integrationIssue = pgTable(
	'integration_issue',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		issueKey: text('issue_key').notNull(),
		provider: text('provider'),
		severity: text('severity').notNull(),
		title: text('title').notNull(),
		detail: text('detail').notNull(),
		entityType: text('entity_type'),
		entityId: text('entity_id'),
		status: text('status').default('open').notNull(),
		openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('integration_issue_key_idx').on(table.issueKey),
		index('integration_issue_status_idx').on(table.status, table.severity),
		check(
			'integration_issue_severity_check',
			sql`${table.severity} in ('info', 'warning', 'critical')`
		),
		check('integration_issue_status_check', sql`${table.status} in ('open', 'resolved')`)
	]
);

export const auditEvent = pgTable(
	'audit_event',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		actorSubject: text('actor_subject').notNull(),
		actorClient: text('actor_client'),
		action: text('action').notNull(),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		inputHash: text('input_hash'),
		beforeRevision: integer('before_revision'),
		afterRevision: integer('after_revision'),
		requestId: text('request_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('audit_event_created_at_idx').on(table.createdAt)]
);

export const legalDocument = pgTable(
	'legal_document',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		type: text('type').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull(),
		version: integer('version').notNull(),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('legal_document_type_version_idx').on(table.type, table.version),
		index('legal_document_published_idx').on(table.type, table.publishedAt),
		check('legal_document_version_check', sql`${table.version} > 0`)
	]
);

export const globalSetting = pgTable('global_setting', {
	key: text('key').primaryKey(),
	value: jsonb('value').$type<unknown>().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
