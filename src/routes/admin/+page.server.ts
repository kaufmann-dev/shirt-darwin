import { db } from '$lib/server/db';
import {
	adDailyMetric,
	experiment,
	fulfillmentProjection,
	integrationIssue,
	ledgerEntry,
	orderProjection,
	portfolioOverhead,
	storefront,
	syncRun
} from '$lib/server/db/schema';
import { count, desc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { recordAdminAction, requireAdmin } from './_auth.server';
import type { Actions, PageServerLoad } from './$types';

const overheadSchema = z.object({
	month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
	label: z.string().trim().min(2).max(120),
	amount: z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/),
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
});

function amountToMinor(value: string) {
	const [whole, fraction = ''] = value.split('.');
	return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export const load: PageServerLoad = async () => {
	const [
		storefrontCount,
		activeExperiments,
		orderCount,
		issues,
		syncRuns,
		ledgerRows,
		adSpendRows,
		orderFulfillmentRows,
		overheadRows
	] = await Promise.all([
		db.select({ value: count() }).from(storefront),
		db.select().from(experiment).orderBy(desc(experiment.startsAt)).limit(100),
		db.select({ value: count() }).from(orderProjection),
		db
			.select()
			.from(integrationIssue)
			.where(eq(integrationIssue.status, 'open'))
			.orderBy(desc(integrationIssue.updatedAt))
			.limit(8),
		db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(50),
		db
			.select({
				id: ledgerEntry.id,
				kind: ledgerEntry.kind,
				reportingAmountMinor: ledgerEntry.reportingAmountMinor,
				fxStatus: ledgerEntry.fxStatus,
				supersedesEntryId: ledgerEntry.supersedesEntryId
			})
			.from(ledgerEntry),
		db
			.select({
				experimentId: adDailyMetric.experimentId,
				currency: adDailyMetric.currency,
				spendMinor: sql<number>`coalesce(sum(${adDailyMetric.spendMinor}), 0)`
			})
			.from(adDailyMetric)
			.groupBy(adDailyMetric.experimentId, adDailyMetric.currency),
		db
			.select({
				id: orderProjection.id,
				orderNumber: orderProjection.orderNumber,
				orderedAt: orderProjection.orderedAt,
				fulfillmentId: fulfillmentProjection.id
			})
			.from(orderProjection)
			.leftJoin(fulfillmentProjection, eq(fulfillmentProjection.orderId, orderProjection.id))
			.orderBy(desc(orderProjection.orderedAt))
			.limit(200),
		db
			.select()
			.from(portfolioOverhead)
			.orderBy(desc(portfolioOverhead.month), desc(portfolioOverhead.createdAt))
			.limit(36)
	]);

	const now = new Date();
	const runningCount = activeExperiments.filter(
		(row) => !row.endedAt && now >= row.startsAt && now < row.endsAt
	).length;
	const superseded = new Set(
		ledgerRows.flatMap((row) => (row.supersedesEntryId ? [row.supersedesEntryId] : []))
	);
	const currentLedger = ledgerRows.filter((row) => !superseded.has(row.id));
	const revenueKinds = new Set(['merchandise-revenue', 'shipping-revenue']);
	const revenue = currentLedger
		.filter((row) => revenueKinds.has(row.kind))
		.reduce((sum, row) => sum + (row.reportingAmountMinor ?? 0), 0);
	const metaSpend = Math.abs(
		currentLedger
			.filter((row) => row.kind === 'meta-spend')
			.reduce((sum, row) => sum + (row.reportingAmountMinor ?? 0), 0)
	);
	const contribution = currentLedger.reduce((sum, row) => sum + (row.reportingAmountMinor ?? 0), 0);
	const pendingLedger = currentLedger.filter(
		(row) => row.reportingAmountMinor === null || row.fxStatus === 'estimated'
	).length;
	const pendingRevenue = currentLedger.some(
		(row) =>
			revenueKinds.has(row.kind) &&
			(row.reportingAmountMinor === null || row.fxStatus === 'estimated')
	);
	const pendingMetaSpend = currentLedger.some(
		(row) =>
			row.kind === 'meta-spend' &&
			(row.reportingAmountMinor === null || row.fxStatus === 'estimated')
	);
	const adSpendByExperiment = new Map<string, number>();
	for (const row of adSpendRows) {
		const expectedCurrency = activeExperiments.find(
			(item) => item.id === row.experimentId
		)?.budgetCurrency;
		if (row.currency !== expectedCurrency) continue;
		adSpendByExperiment.set(
			row.experimentId,
			(adSpendByExperiment.get(row.experimentId) ?? 0) + Number(row.spendMinor)
		);
	}
	const nextActions: Array<{
		key: string;
		severity: 'info' | 'warning' | 'critical';
		title: string;
		detail: string;
		destination: 'experiment' | 'orders' | 'integrations';
		experimentId?: string;
	}> = [];
	for (const item of activeExperiments) {
		const ended = Boolean(item.endedAt) || now >= item.endsAt;
		if (ended && !item.outcome) {
			nextActions.push({
				key: `outcome:${item.id}`,
				severity: 'warning',
				title: `${item.name} needs an outcome`,
				detail: 'The test window ended. Review evidence and record keep, iterate, or retire.',
				destination: 'experiment',
				experimentId: item.id
			});
		}
		const spendMinor = adSpendByExperiment.get(item.id) ?? 0;
		if (!ended && item.budgetMinor > 0 && spendMinor >= item.budgetMinor * 0.8) {
			const reached = spendMinor >= item.budgetMinor;
			nextActions.push({
				key: `budget:${item.id}`,
				severity: reached ? 'critical' : 'warning',
				title: reached ? `${item.name} reached its budget` : `${item.name} is near its budget`,
				detail: reached
					? 'Meta reporting can lag. Inspect and pause the campaign manually if it is still delivering.'
					: `${Math.round((spendMinor / item.budgetMinor) * 100)}% of the configured budget is reported spent.`,
				destination: 'experiment',
				experimentId: item.id
			});
		}
	}
	if (pendingLedger > 0) {
		nextActions.push({
			key: 'ledger:pending',
			severity: 'warning',
			title: 'Economics need reconciliation',
			detail: `${pendingLedger} current ledger ${pendingLedger === 1 ? 'entry is' : 'entries are'} estimated or missing an actual EUR value.`,
			destination: 'integrations'
		});
	}
	const staleUnlinked = orderFulfillmentRows.filter(
		(row) => !row.fulfillmentId && now.getTime() - row.orderedAt.getTime() >= 48 * 60 * 60 * 1000
	);
	if (staleUnlinked.length > 0) {
		nextActions.push({
			key: 'fulfillment:unlinked',
			severity: 'critical',
			title: 'Orders are missing Printful fulfillment',
			detail: `${staleUnlinked.length} ${staleUnlinked.length === 1 ? 'order is' : 'orders are'} more than 48 hours old without a linked Printful record.`,
			destination: 'orders'
		});
	}

	const latestSyncByProvider = new Map<string, (typeof syncRuns)[number]>();
	for (const run of syncRuns) {
		if (!latestSyncByProvider.has(run.provider)) latestSyncByProvider.set(run.provider, run);
	}

	return {
		metrics: {
			storefronts: storefrontCount[0]?.value ?? 0,
			runningExperiments: runningCount,
			orders: orderCount[0]?.value ?? 0,
			revenue,
			metaSpend,
			contribution,
			pendingLedger,
			contributionComplete: pendingLedger === 0,
			revenueComplete: !pendingRevenue,
			metaSpendComplete: !pendingMetaSpend
		},
		issues,
		nextActions,
		overhead: overheadRows,
		latestSyncs: ['shopify', 'printful', 'meta'].map((provider) => ({
			provider,
			run: latestSyncByProvider.get(provider) ?? null
		}))
	};
};

export const actions: Actions = {
	overhead: async (event) => {
		requireAdmin(event.locals);
		const input = overheadSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, {
				action: 'overhead',
				error: 'Enter a month, label, amount, and three-letter currency.'
			});
		const [created] = await db
			.insert(portfolioOverhead)
			.values({
				month: input.data.month,
				label: input.data.label,
				amountMinor: amountToMinor(input.data.amount),
				currency: input.data.currency
			})
			.returning();
		await recordAdminAction(event, {
			action: 'portfolio-overhead.append',
			entityType: 'portfolio-overhead',
			entityId: created.id
		});
		return {
			action: 'overhead',
			success: 'Portfolio overhead added outside experiment contribution.'
		};
	}
};
