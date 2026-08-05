import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { providerEvent } from '$lib/server/db/schema';

export type ProviderEventInput = {
	provider: 'shopify' | 'printful';
	externalKey: string;
	topic: string;
	payloadHash: string;
	resourceId: string;
};

export async function recordProviderEvent(input: ProviderEventInput) {
	const [inserted] = await db
		.insert(providerEvent)
		.values({
			provider: input.provider,
			externalKey: input.externalKey,
			topic: input.topic,
			payloadHash: input.payloadHash
		})
		.onConflictDoNothing()
		.returning({ id: providerEvent.id });
	if (inserted) return { id: inserted.id, duplicate: false, status: 'pending' };
	const [existing] = await db
		.select({ id: providerEvent.id, status: providerEvent.status })
		.from(providerEvent)
		.where(
			and(
				eq(providerEvent.provider, input.provider),
				eq(providerEvent.externalKey, input.externalKey)
			)
		)
		.limit(1);
	if (!existing) throw new Error('Provider event could not be recorded');
	return { id: existing.id, duplicate: true, status: existing.status };
}
