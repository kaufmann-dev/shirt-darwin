import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	centralOrigin,
	getPublishedStorefrontView,
	readConsentDecision,
	storefrontConsentCookie,
	storefrontPrivacyConfig
} from '$lib/components/storefront/data.server';
import { marketingConsent } from '$lib/domain/consent';
import { captureAttributionFromUrl, revokeAttribution } from '$lib/server/services/attribution';

export const load: PageServerLoad = async ({ cookies, locals, params, request, url }) => {
	if (locals.brandSlug !== params.slug) error(404, 'Storefront not found');

	const storefront = await getPublishedStorefrontView(params.slug, url.origin, centralOrigin());
	if (!storefront) error(404, 'Storefront not found');
	const design = storefront.designs.find((candidate) => candidate.slug === params.designSlug);
	if (!design) error(404, 'Design not found');
	const initialConsent = readConsentDecision(cookies.get(storefrontConsentCookie));
	const canTrack = marketingConsent({
		globalPrivacyControl: request.headers.get('sec-gpc') === '1',
		regionRequiresOptIn: true,
		storedDecision: initialConsent
	});
	if (canTrack) await captureAttributionFromUrl(url, cookies, storefront.id);
	else await revokeAttribution(cookies);

	return {
		storefront,
		design,
		privacyConfig: storefrontPrivacyConfig(),
		initialConsent
	};
};
