import { PgBoss } from 'pg-boss';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { serverConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { providerEvent } from '$lib/server/db/schema';
import {
	refreshPrintfulOrder,
	refreshShopifyOrder,
	refreshShopifyProduct,
	runProviderSync,
	safeErrorMessage,
	type SyncProvider,
	type SyncTrigger
} from './services/sync';
import { openIntegrationIssue, resolveIntegrationIssue } from './services/issues';

const PROVIDER_EVENT_QUEUE = 'provider-event';
const PROVIDER_SYNC_QUEUE = 'provider-sync';
const NIGHTLY_QUEUE = 'nightly-reconciliation';

const providerEventJobSchema = z.object({
	providerEventId: z.string().uuid(),
	resourceId: z.string().min(1).max(255)
});
const providerSyncJobSchema = z.object({
	provider: z.enum(['shopify', 'printful', 'meta']),
	trigger: z.enum(['manual', 'nightly', 'webhook'])
});

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

export function startJobs(): Promise<PgBoss> {
	if (starting) return starting;
	starting = startJobSystem().catch((error) => {
		starting = undefined;
		boss = undefined;
		throw error;
	});
	return starting;
}

async function startJobSystem() {
	const instance = new PgBoss({
		connectionString: serverConfig.databaseUrl,
		application_name: 'shirt-darwin-jobs',
		max: 4,
		useListenNotify: true
	});
	instance.on('error', (error) => console.error('pg-boss error', error));
	await instance.start();
	await Promise.all([
		instance.createQueue(PROVIDER_EVENT_QUEUE, {
			retryLimit: 6,
			retryDelay: 5,
			retryBackoff: true,
			retryDelayMax: 900,
			expireInSeconds: 120
		}),
		instance.createQueue(PROVIDER_SYNC_QUEUE, {
			retryLimit: 3,
			retryDelay: 30,
			retryBackoff: true,
			retryDelayMax: 1800,
			expireInSeconds: 1800
		}),
		instance.createQueue(NIGHTLY_QUEUE, {
			retryLimit: 1,
			retryDelay: 300,
			expireInSeconds: 3600
		})
	]);
	await instance.work(
		PROVIDER_EVENT_QUEUE,
		{ batchSize: 1, pollingIntervalSeconds: 2 },
		async (jobs) => processProviderEventJob(providerEventJobSchema.parse(jobs[0]?.data))
	);
	await instance.work(
		PROVIDER_SYNC_QUEUE,
		{ batchSize: 1, pollingIntervalSeconds: 5 },
		async (jobs) => {
			const data = providerSyncJobSchema.parse(jobs[0]?.data);
			return runProviderSync(data.provider, data.trigger);
		}
	);
	await instance.work(NIGHTLY_QUEUE, { batchSize: 1, pollingIntervalSeconds: 30 }, async () => {
		for (const provider of ['shopify', 'printful', 'meta'] as const) {
			await instance.send(
				PROVIDER_SYNC_QUEUE,
				{ provider, trigger: 'nightly' },
				{
					singletonKey: `nightly:${provider}:${new Date().toISOString().slice(0, 10)}`
				}
			);
		}
	});
	await instance.schedule(NIGHTLY_QUEUE, '0 3 * * *', {}, { tz: 'UTC' });
	boss = instance;
	return instance;
}

export async function stopJobs() {
	if (!boss) return;
	await boss.stop({ graceful: true, timeout: 30_000 });
	boss = undefined;
	starting = undefined;
}

export async function enqueueProviderEvent(input: { providerEventId: string; resourceId: string }) {
	const parsed = providerEventJobSchema.parse(input);
	const instance = await startJobs();
	return instance.send(PROVIDER_EVENT_QUEUE, parsed, {
		singletonKey: parsed.providerEventId,
		retryLimit: 6,
		retryDelay: 5,
		retryBackoff: true,
		retryDelayMax: 900
	});
}

export async function requestProviderSync(provider: SyncProvider, trigger: SyncTrigger = 'manual') {
	const parsed = providerSyncJobSchema.parse({ provider, trigger });
	const instance = await startJobs();
	return instance.send(PROVIDER_SYNC_QUEUE, parsed, {
		singletonKey: `${parsed.trigger}:${parsed.provider}`
	});
}

export async function getJobSystemHealth() {
	if (!boss) {
		try {
			await startJobs();
		} catch {
			return { started: false, installed: false };
		}
	}
	try {
		return { started: true, installed: await boss!.isInstalled() };
	} catch {
		return { started: true, installed: false };
	}
}

async function processProviderEventJob(input: z.infer<typeof providerEventJobSchema>) {
	const [event] = await db
		.select({ id: providerEvent.id, provider: providerEvent.provider, topic: providerEvent.topic })
		.from(providerEvent)
		.where(eq(providerEvent.id, input.providerEventId))
		.limit(1);
	if (!event) throw new Error('Provider event record not found');
	try {
		if (event.provider === 'shopify') {
			if (
				event.topic.startsWith('orders/') ||
				event.topic.startsWith('refunds/') ||
				event.topic.startsWith('fulfillments/')
			) {
				await refreshShopifyOrder(input.resourceId);
			} else if (event.topic.startsWith('products/')) {
				await refreshShopifyProduct(input.resourceId);
			}
		} else if (event.provider === 'printful') {
			if (event.topic.startsWith('order_') || event.topic.startsWith('shipment_')) {
				await refreshPrintfulOrder(input.resourceId);
			}
		} else {
			throw new Error(`Unsupported provider event source ${event.provider}`);
		}
		await db
			.update(providerEvent)
			.set({ status: 'completed', processedAt: new Date(), error: null })
			.where(eq(providerEvent.id, event.id));
		await resolveIntegrationIssue(`${event.provider}:event:${event.id}`);
	} catch (error) {
		const message = safeErrorMessage(error);
		await db
			.update(providerEvent)
			.set({ status: 'failed', processedAt: new Date(), error: message })
			.where(and(eq(providerEvent.id, event.id), eq(providerEvent.provider, event.provider)));
		await openIntegrationIssue({
			issueKey: `${event.provider}:event:${event.id}`,
			provider: event.provider,
			severity: 'critical',
			title: `${event.provider} event processing failed`,
			detail: message,
			entityType: 'provider_event',
			entityId: event.id
		});
		throw error;
	}
}
