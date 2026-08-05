import {
	hashWebhookPayload,
	isConfiguredShopifyDomain,
	parseShopifyWebhookReference,
	verifyShopifyWebhook
} from '$lib/server/integrations/shopify';
import { ProviderError } from '$lib/server/integrations/errors';
import { enqueueProviderEvent } from '$lib/server/jobs';
import { recordProviderEvent } from '$lib/server/services/provider-events';
import { json } from '@sveltejs/kit';

export const POST = async ({ request }) => {
	const body = new Uint8Array(await request.arrayBuffer());
	try {
		if (!verifyShopifyWebhook(body, request.headers.get('x-shopify-hmac-sha256'))) {
			return json({ error: 'invalid_signature' }, { status: 401 });
		}
		if (!isConfiguredShopifyDomain(request.headers.get('x-shopify-shop-domain'))) {
			return json({ error: 'invalid_shop' }, { status: 403 });
		}
		const webhookId = request.headers.get('x-shopify-webhook-id')?.trim();
		const topic = request.headers.get('x-shopify-topic')?.trim().toLowerCase();
		if (!webhookId || !topic) return json({ error: 'missing_headers' }, { status: 400 });
		const resourceId = parseShopifyWebhookReference(body, topic);
		const event = await recordProviderEvent({
			provider: 'shopify',
			externalKey: webhookId,
			topic,
			payloadHash: hashWebhookPayload(body),
			resourceId
		});
		if (event.status !== 'completed') {
			await enqueueProviderEvent({ providerEventId: event.id, resourceId });
		}
		return new Response(null, { status: event.duplicate ? 200 : 202 });
	} catch (error) {
		if (error instanceof ProviderError && error.code === 'not_configured') {
			return json({ error: 'shopify_not_configured' }, { status: 503 });
		}
		if (error instanceof ProviderError && error.code === 'invalid_webhook') {
			return json({ error: 'invalid_webhook' }, { status: 400 });
		}
		return json({ error: 'webhook_unavailable' }, { status: 503 });
	}
};
