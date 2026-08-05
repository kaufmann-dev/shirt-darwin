import { db } from '$lib/server/db';
import { integrationIssue, ledgerEntry, syncRun } from '$lib/server/db/schema';
import { getJobSystemHealth, requestProviderSync } from '$lib/server/jobs';
import { and, desc, eq, isNull, notExists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { recordAdminAction, requireAdmin } from '../_auth.server';
import type { Actions, PageServerLoad } from './$types';

const providerSchema = z.enum(['shopify', 'printful', 'meta']);
const issueSchema = z.string().uuid();
const fxSchema = z.object({
	entryId: z.string().uuid(),
	reportingAmountEur: z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/)
});

function amountToMinor(value: string) {
	const [whole, fraction = ''] = value.split('.');
	return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export const load: PageServerLoad = async () => {
	const newerEntry = alias(ledgerEntry, 'newer_ledger_entry');
	const [runs, issues, pendingFxEntries, jobHealth] = await Promise.all([
		db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(100),
		db.select().from(integrationIssue).orderBy(desc(integrationIssue.updatedAt)).limit(100),
		db
			.select()
			.from(ledgerEntry)
			.where(
				and(
					or(isNull(ledgerEntry.reportingAmountMinor), eq(ledgerEntry.fxStatus, 'estimated')),
					notExists(
						db
							.select({ id: newerEntry.id })
							.from(newerEntry)
							.where(eq(newerEntry.supersedesEntryId, ledgerEntry.id))
					)
				)
			)
			.orderBy(desc(ledgerEntry.occurredAt))
			.limit(200),
		getJobSystemHealth()
	]);
	return { runs, issues, pendingFxEntries, jobHealth };
};

export const actions: Actions = {
	sync: async (event) => {
		requireAdmin(event.locals);
		const form = await event.request.formData();
		const provider = providerSchema.safeParse(form.get('provider'));
		if (!provider.success) return fail(400, { action: 'sync', error: 'Unknown provider.' });
		try {
			const runId = await requestProviderSync(provider.data, 'manual');
			if (!runId) return fail(503, { action: 'sync', error: 'The job worker is not ready.' });
			await recordAdminAction(event, {
				action: 'provider-sync.request',
				entityType: 'sync-run',
				entityId: runId
			});
			return { action: 'sync', success: `${provider.data} sync queued.` };
		} catch (cause) {
			console.error('Could not request provider sync', cause);
			return fail(502, { action: 'sync', error: `${provider.data} sync could not be queued.` });
		}
	},

	resolve: async (event) => {
		requireAdmin(event.locals);
		const form = await event.request.formData();
		const issueId = issueSchema.safeParse(form.get('issueId'));
		if (!issueId.success) return fail(400, { action: 'resolve', error: 'Invalid issue.' });
		const [updated] = await db
			.update(integrationIssue)
			.set({ status: 'resolved', resolvedAt: new Date() })
			.where(eq(integrationIssue.id, issueId.data))
			.returning({ id: integrationIssue.id });
		if (!updated) error(404, 'Issue not found');
		await recordAdminAction(event, {
			action: 'integration-issue.resolve',
			entityType: 'integration-issue',
			entityId: updated.id
		});
		return {
			action: 'resolve',
			success: 'Issue marked resolved. A later sync may reopen it if the problem remains.'
		};
	},

	fx: async (event) => {
		requireAdmin(event.locals);
		const input = fxSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) {
			return fail(400, {
				action: 'fx',
				error: 'Choose a pending ledger entry and enter its actual EUR value.'
			});
		}
		const current = (
			await db.select().from(ledgerEntry).where(eq(ledgerEntry.id, input.data.entryId)).limit(1)
		)[0];
		if (!current) error(404, 'Ledger entry not found');
		const newer = await db
			.select({ id: ledgerEntry.id })
			.from(ledgerEntry)
			.where(eq(ledgerEntry.supersedesEntryId, current.id))
			.limit(1);
		if (newer.length > 0) {
			return fail(409, {
				action: 'fx',
				error: 'That ledger entry was already reconciled. Reload and use the current revision.'
			});
		}
		const absoluteReportingMinor = amountToMinor(input.data.reportingAmountEur);
		const reportingAmountMinor =
			current.amountMinor < 0
				? -absoluteReportingMinor
				: current.amountMinor > 0
					? absoluteReportingMinor
					: 0;
		try {
			const [created] = await db
				.insert(ledgerEntry)
				.values({
					experimentId: current.experimentId,
					orderId: current.orderId,
					kind: current.kind,
					source: current.source,
					sourceReference: current.sourceReference,
					revision: current.revision + 1,
					supersedesEntryId: current.id,
					amountMinor: current.amountMinor,
					currency: current.currency,
					reportingAmountMinor,
					fxRate:
						current.amountMinor === 0 ? 1 : Math.abs(reportingAmountMinor / current.amountMinor),
					fxStatus: 'actual',
					occurredAt: current.occurredAt
				})
				.returning({ id: ledgerEntry.id, revision: ledgerEntry.revision });
			await recordAdminAction(event, {
				action: 'ledger-entry.reconcile-fx',
				entityType: 'ledger-entry',
				entityId: created.id,
				beforeRevision: current.revision,
				afterRevision: created.revision
			});
			return { action: 'fx', success: 'Actual EUR value appended to the ledger.' };
		} catch (cause) {
			console.error('Could not reconcile ledger entry', cause);
			return fail(409, {
				action: 'fx',
				error: 'The ledger changed while reconciling. Reload and try again.'
			});
		}
	}
};
