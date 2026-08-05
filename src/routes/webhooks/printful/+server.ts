import { ProviderError } from '$lib/server/integrations/errors';
import {
	isConfiguredPrintfulStore,
	parsePrintfulWebhookReference,
	verifyPrintfulWebhook
} from '$lib/server/integrations/printful';
import { enqueueProviderEvent } from '$lib/server/jobs';
import { recordProviderEvent } from '$lib/server/services/provider-events';
import { json } from '@sveltejs/kit';

export const POST = async ({ request }) => {
	const body = new Uint8Array(await request.arrayBuffer());
	try {
		if (
			!verifyPrintfulWebhook(
				body,
				request.headers.get('x-pf-webhook-public-key'),
				request.headers.get('x-pf-webhook-signature')
			)
		) {
			return json({ error: 'invalid_signature' }, { status: 401 });
		}
		const reference = parsePrintfulWebhookReference(body);
		if (!isConfiguredPrintfulStore(reference.storeId)) {
			return json({ error: 'invalid_store' }, { status: 403 });
		}
		const event = await recordProviderEvent({
			provider: 'printful',
			externalKey: reference.externalKey,
			topic: reference.topic,
			payloadHash: reference.payloadHash,
			resourceId: reference.resourceId
		});
		if (event.status !== 'completed') {
			await enqueueProviderEvent({ providerEventId: event.id, resourceId: reference.resourceId });
		}
		return new Response(null, { status: event.duplicate ? 200 : 202 });
	} catch (error) {
		if (error instanceof ProviderError && error.code === 'not_configured') {
			return json({ error: 'printful_not_configured' }, { status: 503 });
		}
		if (error instanceof ProviderError && error.code === 'invalid_webhook') {
			return json({ error: 'invalid_webhook' }, { status: 400 });
		}
		return json({ error: 'webhook_unavailable' }, { status: 503 });
	}
};
