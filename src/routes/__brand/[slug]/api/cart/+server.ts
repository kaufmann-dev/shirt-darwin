import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	centralOrigin,
	containsVariant,
	getPublishedStorefrontView,
	readConsentDecision,
	storefrontConsentCookie
} from '$lib/components/storefront/data.server';
import { marketingConsent } from '$lib/domain/consent';
import { shopifyStorefront } from '$lib/server/integrations/shopify';
import { ProviderError } from '$lib/server/integrations/errors';
import { getCartAttributionAttributes, revokeAttribution } from '$lib/server/services/attribution';

const requestSchema = z.object({
	merchandiseId: z.string().startsWith('gid://shopify/ProductVariant/'),
	quantity: z.number().int().min(1).max(10).default(1)
});

export const POST: RequestHandler = async ({ cookies, locals, params, request, url }) => {
	if (locals.brandSlug !== params.slug)
		return json({ error: 'Storefront not found' }, { status: 404 });
	if (!isSameOrigin(request, url))
		return json({ error: 'Invalid request origin' }, { status: 403 });

	let input: z.infer<typeof requestSchema>;
	try {
		input = requestSchema.parse(await request.json());
	} catch {
		return json({ error: 'Choose a valid product option and try again.' }, { status: 400 });
	}

	const storefront = await getPublishedStorefrontView(params.slug, url.origin, centralOrigin());
	if (!storefront) return json({ error: 'Storefront not found' }, { status: 404 });
	if (!containsVariant(storefront, input.merchandiseId)) {
		return json({ error: 'That product option is no longer available.' }, { status: 409 });
	}

	try {
		const canTrack = marketingConsent({
			globalPrivacyControl: request.headers.get('sec-gpc') === '1',
			regionRequiresOptIn: true,
			storedDecision: readConsentDecision(cookies.get(storefrontConsentCookie))
		});
		const attributes = canTrack ? await getCartAttributionAttributes(cookies, storefront.id) : [];
		if (!canTrack) await revokeAttribution(cookies);
		const cart = await shopifyStorefront.createCart(
			[{ merchandiseId: input.merchandiseId, quantity: input.quantity }],
			attributes
		);
		return json(cart, { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		const status = cause instanceof ProviderError && cause.retryable ? 503 : 502;
		return json(
			{ error: 'Checkout is temporarily unavailable. Please try again.' },
			{ status, headers: { 'cache-control': 'no-store' } }
		);
	}
};

function isSameOrigin(request: Request, url: URL): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return false;
	try {
		return new URL(origin).origin === url.origin;
	} catch {
		return false;
	}
}
