import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { integrationIssue } from '$lib/server/db/schema';

export async function openIntegrationIssue(input: {
	issueKey: string;
	provider?: string;
	severity: 'info' | 'warning' | 'critical';
	title: string;
	detail: string;
	entityType?: string;
	entityId?: string;
}) {
	await db
		.insert(integrationIssue)
		.values(input)
		.onConflictDoUpdate({
			target: integrationIssue.issueKey,
			set: {
				provider: input.provider,
				severity: input.severity,
				title: input.title,
				detail: input.detail,
				entityType: input.entityType,
				entityId: input.entityId,
				status: 'open',
				resolvedAt: null,
				updatedAt: new Date()
			}
		});
}

export async function resolveIntegrationIssue(issueKey: string) {
	await db
		.update(integrationIssue)
		.set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
		.where(eq(integrationIssue.issueKey, issueKey));
}
