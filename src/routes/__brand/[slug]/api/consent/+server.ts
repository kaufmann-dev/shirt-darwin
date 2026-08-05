import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { storefrontConsentCookie } from '$lib/components/storefront/data.server';
import type { ConsentDecision } from '$lib/domain/consent';
import { revokeAttribution } from '$lib/server/services/attribution';

const requestSchema = z.object({ analytics: z.boolean(), marketing: z.boolean() });

export const POST: RequestHandler = async ({ cookies, locals, params, request, url }) => {
	if (locals.brandSlug !== params.slug)
		return json({ error: 'Storefront not found' }, { status: 404 });
	if (!isSameOrigin(request, url))
		return json({ error: 'Invalid request origin' }, { status: 403 });

	let input: z.infer<typeof requestSchema>;
	try {
		input = requestSchema.parse(await request.json());
	} catch {
		return json({ error: 'Invalid privacy choice' }, { status: 400 });
	}

	const globalPrivacyControl = request.headers.get('sec-gpc') === '1';
	const decision: ConsentDecision = {
		analytics: globalPrivacyControl ? false : input.analytics,
		marketing: globalPrivacyControl ? false : input.marketing,
		saleOfData: globalPrivacyControl ? false : input.marketing,
		decidedAt: new Date().toISOString()
	};
	cookies.set(storefrontConsentCookie, encodeURIComponent(JSON.stringify(decision)), {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
	if (!decision.marketing || !decision.saleOfData) await revokeAttribution(cookies);

	return json({ decision }, { headers: { 'cache-control': 'no-store' } });
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
