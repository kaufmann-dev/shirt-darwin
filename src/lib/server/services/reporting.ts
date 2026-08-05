import { and, count, desc, eq, notExists, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '$lib/server/db';
import {
	adDailyMetric,
	experiment,
	integrationIssue,
	ledgerEntry,
	storefront
} from '$lib/server/db/schema';

export async function getMetricsSummary(storefrontId?: string) {
	const safeStorefrontId = storefrontId ? z.string().uuid().parse(storefrontId) : undefined;
	const experimentFilter = safeStorefrontId
		? eq(experiment.storefrontId, safeStorefrontId)
		: undefined;
	const newerLedgerEntry = alias(ledgerEntry, 'newer_ledger_entry');
	const currentLedgerFilter = and(
		experimentFilter,
		notExists(
			db
				.select({ id: newerLedgerEntry.id })
				.from(newerLedgerEntry)
				.where(eq(newerLedgerEntry.supersedesEntryId, ledgerEntry.id))
		)
	);
	const [storefrontCount, experimentCount, issueCount, ledger, ads] = await Promise.all([
		db.select({ value: count() }).from(storefront),
		db.select({ value: count() }).from(experiment).where(experimentFilter),
		db.select({ value: count() }).from(integrationIssue).where(eq(integrationIssue.status, 'open')),
		db
			.select({
				currency: ledgerEntry.currency,
				totalMinor: sum(ledgerEntry.amountMinor),
				reportingTotalMinor: sum(ledgerEntry.reportingAmountMinor),
				pendingFx: sql<number>`count(*) filter (where ${ledgerEntry.fxStatus} = 'estimated')`
			})
			.from(ledgerEntry)
			.leftJoin(experiment, eq(ledgerEntry.experimentId, experiment.id))
			.where(currentLedgerFilter)
			.groupBy(ledgerEntry.currency),
		db
			.select({
				currency: adDailyMetric.currency,
				spendMinor: sum(adDailyMetric.spendMinor),
				impressions: sum(adDailyMetric.impressions),
				clicks: sum(adDailyMetric.clicks),
				metaPurchases: sum(adDailyMetric.metaPurchases)
			})
			.from(adDailyMetric)
			.innerJoin(experiment, eq(adDailyMetric.experimentId, experiment.id))
			.where(experimentFilter)
			.groupBy(adDailyMetric.currency)
	]);
	return {
		storefrontCount: storefrontCount[0]?.value ?? 0,
		experimentCount: experimentCount[0]?.value ?? 0,
		openIssueCount: issueCount[0]?.value ?? 0,
		ledger,
		ads
	};
}

export async function listIntegrationIssues(
	options: {
		provider?: 'shopify' | 'printful' | 'meta' | 's3';
		status?: 'open' | 'resolved';
		limit?: number;
	} = {}
) {
	const parsed = z
		.object({
			provider: z.enum(['shopify', 'printful', 'meta', 's3']).optional(),
			status: z.enum(['open', 'resolved']).default('open'),
			limit: z.number().int().min(1).max(100).default(50)
		})
		.parse(options);
	const where = parsed.provider
		? and(
				eq(integrationIssue.status, parsed.status),
				eq(integrationIssue.provider, parsed.provider)
			)
		: eq(integrationIssue.status, parsed.status);
	return db
		.select({
			id: integrationIssue.id,
			provider: integrationIssue.provider,
			severity: integrationIssue.severity,
			title: integrationIssue.title,
			detail: integrationIssue.detail,
			entityType: integrationIssue.entityType,
			entityId: integrationIssue.entityId,
			status: integrationIssue.status,
			openedAt: integrationIssue.openedAt,
			updatedAt: integrationIssue.updatedAt
		})
		.from(integrationIssue)
		.where(where)
		.orderBy(desc(integrationIssue.updatedAt))
		.limit(parsed.limit);
}
