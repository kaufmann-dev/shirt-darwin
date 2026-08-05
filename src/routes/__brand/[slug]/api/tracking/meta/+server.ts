import {
	readConsentDecision,
	storefrontConsentCookie
} from '$lib/components/storefront/data.server';
import { marketingConsent } from '$lib/domain/consent';
import { ProviderError } from '$lib/server/integrations/errors';
import { meta } from '$lib/server/integrations/meta';
import { attributionCookie, storeAttributionBrowserIds } from '$lib/server/services/attribution';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const inputSchema = z.object({
	eventName: z.enum(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout']),
	eventId: z.string().uuid(),
	eventTime: z.number().int().positive(),
	eventSourceUrl: z.string().url(),
	fbp: z
		.string()
		.max(255)
		.regex(/^fb\.\d+\.\d+\.[a-zA-Z0-9_-]+$/)
		.optional(),
	fbc: z
		.string()
		.max(255)
		.regex(/^fb\.\d+\.\d+\.[a-zA-Z0-9_-]+$/)
		.optional(),
	currency: z.string().length(3).optional(),
	value: z.number().finite().nonnegative().optional(),
	contentIds: z.array(z.string().min(1).max(255)).max(50).optional()
});

export const POST: RequestHandler = async ({
	request,
	url,
	getClientAddress,
	locals,
	params,
	cookies
}) => {
	if (locals.brandSlug !== params.slug)
		return json({ error: 'storefront_not_found' }, { status: 404 });
	const origin = request.headers.get('origin');
	if (!origin) return json({ error: 'invalid_origin' }, { status: 403 });
	let originValue: URL;
	try {
		originValue = new URL(origin);
	} catch {
		return json({ error: 'invalid_origin' }, { status: 403 });
	}
	if (originValue.origin !== url.origin) return json({ error: 'invalid_origin' }, { status: 403 });
	const parsed = inputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'invalid_event' }, { status: 400 });
	if (Math.abs(parsed.data.eventTime * 1000 - Date.now()) > 10 * 60 * 1000) {
		return json({ error: 'invalid_event_time' }, { status: 400 });
	}
	const sourceUrl = new URL(parsed.data.eventSourceUrl);
	if (sourceUrl.origin !== url.origin) return json({ error: 'invalid_source' }, { status: 403 });

	const consented = marketingConsent({
		globalPrivacyControl: request.headers.get('sec-gpc') === '1',
		regionRequiresOptIn: true,
		storedDecision: readConsentDecision(cookies.get(storefrontConsentCookie))
	});
	try {
		const clickId = z.string().uuid().safeParse(cookies.get(attributionCookie));
		if (consented && clickId.success) {
			await storeAttributionBrowserIds(clickId.data, {
				fbp: parsed.data.fbp,
				fbc: parsed.data.fbc
			});
		}
		const result = await meta.sendEvent(
			{
				...parsed.data,
				...(clickId.success ? { externalId: clickId.data } : {}),
				clientIpAddress: getClientAddress(),
				clientUserAgent: request.headers.get('user-agent') ?? undefined
			},
			consented
		);
		return new Response(null, { status: result.sent ? 204 : 202 });
	} catch (error) {
		if (error instanceof ProviderError && error.code === 'not_configured') {
			return json({ error: 'meta_not_configured' }, { status: 503 });
		}
		return json({ error: 'tracking_unavailable' }, { status: 503 });
	}
};
