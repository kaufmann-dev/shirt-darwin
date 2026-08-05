import { deriveExperimentLifecycle, experimentOutcomeSchema } from '$lib/domain/experiment';
import { createTrackingLink } from '$lib/domain/attribution';
import { signedLedgerAmount } from '$lib/domain/ledger';
import { db } from '$lib/server/db';
import {
	adDailyMetric,
	brandAsset,
	campaignMapping,
	designFamily,
	experiment,
	experimentDecision,
	ledgerEntry,
	orderAttribution,
	orderProjection,
	productMapping,
	storefront
} from '$lib/server/db/schema';
import { serverConfig } from '$lib/server/config';
import {
	ExperimentFrozenError,
	ExperimentHeroProductError,
	ExperimentWindowConflictError,
	endExperiment,
	savePlannedCampaignMapping,
	updateNonOverlappingPlannedExperiment
} from '$lib/server/services/experiments';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { recordAdminAction, requireAdmin } from '../../_auth.server';
import type { Actions, PageServerLoad } from './$types';

const idSchema = z.string().uuid();
const editSchema = z.object({
	name: z.string().trim().min(2).max(120),
	heroProductMappingId: z.string().uuid(),
	heroCreativeAssetId: z.union([z.string().uuid(), z.literal('')]).optional(),
	startsAt: z.string().datetime({ local: true }),
	endsAt: z.string().datetime({ local: true }),
	budgetUsd: z.string().regex(/^\d{1,7}(?:\.\d{1,2})?$/)
});
const campaignSchema = z.object({
	campaignId: z.string().trim().min(1).max(120),
	adSetId: z.string().trim().max(120).optional(),
	adId: z.string().trim().max(120).optional()
});
const outcomeSchema = z.object({
	outcome: experimentOutcomeSchema,
	notes: z.string().trim().min(1).max(2000)
});
const manualLedgerKinds = [
	'chargeback',
	'provider-adjustment',
	'replacement-cost',
	'shopify-payment-fee',
	'shopify-fx-fee'
] as const;
const manualLedgerSchema = z.object({
	kind: z.enum(manualLedgerKinds),
	sourceReference: z.string().trim().min(2).max(160),
	amount: z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/),
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/),
	reportingAmountEur: z
		.union([z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/), z.literal('')])
		.optional(),
	orderId: z.union([z.string().uuid(), z.literal('')]).optional(),
	occurredAt: z.string().datetime({ local: true })
});

function dollarsToMinor(value: string) {
	const [whole, fraction = ''] = value.split('.');
	return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function parseUtcLocal(value: string) {
	return new Date(`${value}Z`);
}

function trackingUrl(
	slug: string,
	campaignId: string,
	campaignName: string,
	token: string,
	adSetId: string | null,
	adId: string | null
) {
	const base = new URL(serverConfig.appOrigin);
	base.hostname =
		serverConfig.rootHost === 'localhost'
			? `${slug}.localhost`
			: `${slug}.${serverConfig.rootHost}`;
	base.pathname = '/';
	return createTrackingLink({
		storefrontUrl: base.toString(),
		trackingToken: token,
		campaignId,
		campaignName,
		adSetId,
		adId
	});
}

async function loadExperiment(id: string) {
	const row = (
		await db
			.select({
				id: experiment.id,
				storefrontId: experiment.storefrontId,
				storefrontRevisionId: experiment.storefrontRevisionId,
				heroProductMappingId: experiment.heroProductMappingId,
				heroCreativeAssetId: experiment.heroCreativeAssetId,
				name: experiment.name,
				startsAt: experiment.startsAt,
				endsAt: experiment.endsAt,
				endedAt: experiment.endedAt,
				budgetMinor: experiment.budgetMinor,
				budgetCurrency: experiment.budgetCurrency,
				outcome: experiment.outcome,
				outcomeNotes: experiment.outcomeNotes,
				storefrontName: storefront.name,
				storefrontSlug: storefront.slug
			})
			.from(experiment)
			.innerJoin(storefront, eq(experiment.storefrontId, storefront.id))
			.where(eq(experiment.id, id))
			.limit(1)
	)[0];
	if (!row) error(404, 'Experiment not found');

	const [campaigns, decisions, heroProducts, heroAssets, ledgerRows, adMetrics, attributedOrders] =
		await Promise.all([
			db
				.select()
				.from(campaignMapping)
				.where(eq(campaignMapping.experimentId, id))
				.orderBy(desc(campaignMapping.createdAt)),
			db
				.select()
				.from(experimentDecision)
				.where(eq(experimentDecision.experimentId, id))
				.orderBy(desc(experimentDecision.decidedAt)),
			db
				.select({
					id: productMapping.id,
					designName: designFamily.name,
					shopifyHandle: productMapping.shopifyHandle
				})
				.from(productMapping)
				.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
				.where(
					and(
						eq(designFamily.storefrontId, row.storefrontId),
						eq(productMapping.garment, 'tshirt'),
						eq(productMapping.active, true),
						eq(productMapping.providerAvailable, true)
					)
				),
			db
				.select({ id: brandAsset.id, originalName: brandAsset.originalName })
				.from(brandAsset)
				.where(
					and(
						eq(brandAsset.storefrontId, row.storefrontId),
						eq(brandAsset.kind, 'video'),
						isNotNull(brandAsset.confirmedAt)
					)
				),
			db
				.select({
					id: ledgerEntry.id,
					kind: ledgerEntry.kind,
					source: ledgerEntry.source,
					sourceReference: ledgerEntry.sourceReference,
					revision: ledgerEntry.revision,
					orderId: ledgerEntry.orderId,
					amountMinor: ledgerEntry.amountMinor,
					currency: ledgerEntry.currency,
					reportingAmountMinor: ledgerEntry.reportingAmountMinor,
					fxStatus: ledgerEntry.fxStatus,
					supersedesEntryId: ledgerEntry.supersedesEntryId,
					occurredAt: ledgerEntry.occurredAt
				})
				.from(ledgerEntry)
				.where(eq(ledgerEntry.experimentId, id)),
			db
				.select({
					currency: adDailyMetric.currency,
					spendMinor: sql<number>`coalesce(sum(${adDailyMetric.spendMinor}), 0)`,
					impressions: sql<number>`coalesce(sum(${adDailyMetric.impressions}), 0)`,
					clicks: sql<number>`coalesce(sum(${adDailyMetric.clicks}), 0)`,
					metaPurchases: sql<number>`coalesce(sum(${adDailyMetric.metaPurchases}), 0)`
				})
				.from(adDailyMetric)
				.where(eq(adDailyMetric.experimentId, id))
				.groupBy(adDailyMetric.currency),
			db
				.select({
					id: orderProjection.id,
					orderNumber: orderProjection.orderNumber,
					orderedAt: orderProjection.orderedAt
				})
				.from(orderAttribution)
				.innerJoin(orderProjection, eq(orderAttribution.orderId, orderProjection.id))
				.where(eq(orderAttribution.experimentId, id))
		]);
	const superseded = new Set(
		ledgerRows.flatMap((entry) => (entry.supersedesEntryId ? [entry.supersedesEntryId] : []))
	);
	const currentEntries = ledgerRows.filter((entry) => !superseded.has(entry.id));
	const revenueKinds = new Set(['merchandise-revenue', 'shipping-revenue']);
	const revenue = currentEntries
		.filter((entry) => revenueKinds.has(entry.kind))
		.reduce((sum, entry) => sum + (entry.reportingAmountMinor ?? 0), 0);
	const contribution = currentEntries.reduce(
		(sum, entry) => sum + (entry.reportingAmountMinor ?? 0),
		0
	);
	const pendingLedger = currentEntries.filter(
		(entry) => entry.reportingAmountMinor === null || entry.fxStatus === 'estimated'
	).length;
	const pendingRevenue = currentEntries.some(
		(entry) =>
			revenueKinds.has(entry.kind) &&
			(entry.reportingAmountMinor === null || entry.fxStatus === 'estimated')
	);
	const matchingAdMetrics = adMetrics.filter((metric) => metric.currency === row.budgetCurrency);
	const metaCurrencyMismatch = adMetrics.some((metric) => metric.currency !== row.budgetCurrency);
	const campaign = campaigns[0] ?? null;

	return {
		experiment: {
			...row,
			lifecycle: deriveExperimentLifecycle(row.startsAt, row.endsAt, row.endedAt)
		},
		campaign,
		trackingUrl: campaign
			? trackingUrl(
					row.storefrontSlug,
					campaign.campaignId,
					row.name,
					campaign.trackingToken,
					campaign.adSetId,
					campaign.adId
				)
			: null,
		decisions,
		heroProducts,
		heroAssets,
		metrics: {
			revenue,
			contribution,
			pendingLedger,
			revenueComplete: !pendingRevenue,
			contributionComplete: pendingLedger === 0,
			internalPurchases: attributedOrders.length,
			metaSpendMinor: matchingAdMetrics.reduce(
				(sum, metric) => sum + Number(metric.spendMinor ?? 0),
				0
			),
			metaSpendCurrency: row.budgetCurrency,
			metaCurrencyMismatch,
			metaImpressions: matchingAdMetrics.reduce(
				(sum, metric) => sum + Number(metric.impressions ?? 0),
				0
			),
			metaClicks: matchingAdMetrics.reduce((sum, metric) => sum + Number(metric.clicks ?? 0), 0),
			metaPurchases: matchingAdMetrics.reduce(
				(sum, metric) => sum + Number(metric.metaPurchases ?? 0),
				0
			)
		},
		attributedOrders,
		ledgerEntries: currentEntries
	};
}

export const load: PageServerLoad = async ({ params }) => {
	if (!idSchema.safeParse(params.id).success) error(404, 'Experiment not found');
	return loadExperiment(params.id);
};

export const actions: Actions = {
	edit: async (event) => {
		requireAdmin(event.locals);
		const input = editSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, { action: 'edit', error: 'Experiment fields are invalid.' });
		const current = await loadExperiment(event.params.id);
		if (current.experiment.lifecycle !== 'planned') {
			return fail(409, {
				action: 'edit',
				error:
					'A running or ended experiment is frozen. Create a new experiment for changed inputs.'
			});
		}
		const startsAt = parseUtcLocal(input.data.startsAt);
		const endsAt = parseUtcLocal(input.data.endsAt);
		if (!(endsAt > startsAt))
			return fail(400, { action: 'edit', error: 'End must be after start.' });
		const hero = (
			await db
				.select({ id: productMapping.id })
				.from(productMapping)
				.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
				.where(
					and(
						eq(productMapping.id, input.data.heroProductMappingId),
						eq(productMapping.garment, 'tshirt'),
						eq(productMapping.active, true),
						eq(productMapping.providerAvailable, true),
						eq(designFamily.storefrontId, current.experiment.storefrontId)
					)
				)
				.limit(1)
		)[0];
		if (!hero)
			return fail(400, {
				action: 'edit',
				error: 'Hero must be an active T-shirt for this storefront.'
			});
		if (input.data.heroCreativeAssetId) {
			const [asset] = await db
				.select({ id: brandAsset.id })
				.from(brandAsset)
				.where(
					and(
						eq(brandAsset.id, input.data.heroCreativeAssetId),
						eq(brandAsset.storefrontId, current.experiment.storefrontId),
						eq(brandAsset.kind, 'video'),
						isNotNull(brandAsset.confirmedAt)
					)
				)
				.limit(1);
			if (!asset)
				return fail(400, { action: 'edit', error: 'Hero video must belong to this storefront.' });
		}
		try {
			await updateNonOverlappingPlannedExperiment({
				id: event.params.id,
				storefrontId: current.experiment.storefrontId,
				changes: {
					name: input.data.name,
					heroProductMappingId: input.data.heroProductMappingId,
					heroCreativeAssetId: input.data.heroCreativeAssetId || null,
					startsAt,
					endsAt,
					budgetMinor: dollarsToMinor(input.data.budgetUsd)
				}
			});
		} catch (cause) {
			if (
				cause instanceof ExperimentWindowConflictError ||
				cause instanceof ExperimentFrozenError ||
				cause instanceof ExperimentHeroProductError
			) {
				return fail(409, { action: 'edit', error: cause.message });
			}
			throw cause;
		}
		await recordAdminAction(event, {
			action: 'experiment.update',
			entityType: 'experiment',
			entityId: event.params.id
		});
		return { action: 'edit', success: 'Experiment updated.' };
	},

	campaign: async (event) => {
		requireAdmin(event.locals);
		const input = campaignSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, { action: 'campaign', error: 'Campaign IDs are invalid.' });
		try {
			await savePlannedCampaignMapping({
				experimentId: event.params.id,
				campaignId: input.data.campaignId,
				adSetId: input.data.adSetId || null,
				adId: input.data.adId || null
			});
		} catch (cause) {
			if (cause instanceof ExperimentFrozenError) {
				return fail(409, { action: 'campaign', error: cause.message });
			}
			console.error('Could not save campaign mapping', cause);
			return fail(409, {
				action: 'campaign',
				error: 'Campaign mapping could not be saved. Check that the campaign is not already mapped.'
			});
		}
		await recordAdminAction(event, {
			action: 'campaign-mapping.save',
			entityType: 'experiment',
			entityId: event.params.id
		});
		return { action: 'campaign', success: 'Campaign mapping and tracking URL saved.' };
	},

	end: async (event) => {
		requireAdmin(event.locals);
		const updated = await endExperiment({ experimentId: event.params.id });
		if (!updated) error(404, 'Experiment not found');
		if (updated.changed) {
			await recordAdminAction(event, {
				action: 'experiment.end',
				entityType: 'experiment',
				entityId: event.params.id
			});
		}
		return {
			action: 'end',
			success: updated.changed
				? 'Experiment ended. Pause the Meta campaign manually if it is still active.'
				: 'Experiment was already ended; its original end timestamp was preserved.'
		};
	},

	outcome: async (event) => {
		const user = requireAdmin(event.locals);
		const input = outcomeSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, { action: 'outcome', error: 'Choose an outcome and record the reason.' });
		const current = await loadExperiment(event.params.id);
		if (current.experiment.lifecycle !== 'ended') {
			return fail(409, {
				action: 'outcome',
				error: 'End the experiment before recording an outcome.'
			});
		}
		await db.transaction(async (tx) => {
			await tx.insert(experimentDecision).values({
				experimentId: event.params.id,
				outcome: input.data.outcome,
				notes: input.data.notes,
				decidedBy: user.id
			});
			await tx
				.update(experiment)
				.set({ outcome: input.data.outcome, outcomeNotes: input.data.notes })
				.where(eq(experiment.id, event.params.id));
		});
		await recordAdminAction(event, {
			action: 'experiment.decide',
			entityType: 'experiment',
			entityId: event.params.id
		});
		return { action: 'outcome', success: `Outcome recorded: ${input.data.outcome}.` };
	},

	ledger: async (event) => {
		requireAdmin(event.locals);
		const input = manualLedgerSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) {
			return fail(400, {
				action: 'ledger',
				error: 'Manual ledger fields are invalid. Enter absolute amounts with at most two decimals.'
			});
		}
		const current = await loadExperiment(event.params.id);
		if (
			input.data.orderId &&
			!current.attributedOrders.some((order) => order.id === input.data.orderId)
		) {
			return fail(400, {
				action: 'ledger',
				error: 'The selected order is not attributed to this experiment.'
			});
		}
		const amountMinor = signedLedgerAmount(input.data.kind, dollarsToMinor(input.data.amount));
		const explicitReporting = input.data.reportingAmountEur
			? signedLedgerAmount(input.data.kind, dollarsToMinor(input.data.reportingAmountEur))
			: null;
		const reportingAmountMinor =
			explicitReporting ?? (input.data.currency === 'EUR' ? amountMinor : null);
		const previous = (
			await db
				.select()
				.from(ledgerEntry)
				.where(
					and(
						eq(ledgerEntry.source, 'manual'),
						eq(ledgerEntry.sourceReference, input.data.sourceReference),
						eq(ledgerEntry.kind, input.data.kind)
					)
				)
				.orderBy(desc(ledgerEntry.revision))
				.limit(1)
		)[0];
		if (previous?.experimentId && previous.experimentId !== event.params.id) {
			return fail(409, {
				action: 'ledger',
				error: 'That source reference is already attached to another experiment.'
			});
		}
		const [created] = await db
			.insert(ledgerEntry)
			.values({
				experimentId: event.params.id,
				orderId: input.data.orderId || null,
				kind: input.data.kind,
				source: 'manual',
				sourceReference: input.data.sourceReference,
				revision: (previous?.revision ?? 0) + 1,
				supersedesEntryId: previous?.id ?? null,
				amountMinor,
				currency: input.data.currency,
				reportingAmountMinor,
				fxRate:
					reportingAmountMinor !== null && amountMinor !== 0
						? Math.abs(reportingAmountMinor / amountMinor)
						: null,
				fxStatus: reportingAmountMinor !== null ? 'actual' : 'estimated',
				occurredAt: parseUtcLocal(input.data.occurredAt)
			})
			.returning();
		await recordAdminAction(event, {
			action: 'ledger-entry.append',
			entityType: 'ledger-entry',
			entityId: created.id,
			afterRevision: created.revision
		});
		return {
			action: 'ledger',
			success: previous
				? `Ledger correction appended as revision ${created.revision}.`
				: 'Manual ledger entry added.'
		};
	}
};
