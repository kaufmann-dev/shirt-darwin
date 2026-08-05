import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { serverConfig } from '$lib/server/config';
import { startJobs } from '$lib/server/jobs';
import { resolveHost } from '$lib/domain/tenancy';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { error, redirect, type Handle } from '@sveltejs/kit';

const securityHeaders: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

if (!building) {
	void startJobs().catch((cause: unknown) => console.error('job startup failed', cause));
}

export const handle: Handle = async ({ event, resolve }) => {
	const suppliedRequestId = event.request.headers.get('x-request-id');
	event.locals.requestId =
		suppliedRequestId && /^[a-zA-Z0-9._:-]{1,128}$/.test(suppliedRequestId)
			? suppliedRequestId
			: crypto.randomUUID();
	event.locals.brandSlug = null;
	event.locals.session = null;
	event.locals.user = null;

	const hostname = event.url.hostname.toLowerCase();
	const rootHost = serverConfig.rootHost.toLowerCase();
	const hostResolution = resolveHost(hostname, rootHost);
	const isInternalHealthProbe =
		(hostname === 'localhost' || hostname === '127.0.0.1') &&
		(event.url.pathname === '/health/live' || event.url.pathname === '/health/ready');
	if (hostResolution.kind === 'unknown' && !isInternalHealthProbe) error(421, 'Unknown host');
	if (hostResolution.kind === 'reserved') error(404, 'Not found');
	if (hostResolution.kind === 'www') {
		const destination = new URL(event.url.pathname + event.url.search, serverConfig.appOrigin);
		redirect(308, destination);
	}
	const isBrandHost = hostResolution.kind === 'brand';
	if (hostResolution.kind === 'brand') event.locals.brandSlug = hostResolution.slug;

	const needsOperatorSession =
		!isBrandHost &&
		(event.url.pathname.startsWith('/admin') || event.url.pathname.startsWith('/api/auth'));
	if (needsOperatorSession) {
		const current = await auth.api.getSession({ headers: event.request.headers });
		if (current) {
			event.locals.session = current.session;
			event.locals.user = current.user;
		}
	}

	const response = await svelteKitHandler({ event, resolve, auth, building });
	response.headers.set('x-request-id', event.locals.requestId);
	for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
	const assetOrigins = serverConfig.assetOrigins.join(' ');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"base-uri 'self'",
			"frame-ancestors 'self'",
			"object-src 'none'",
			"script-src 'self' 'unsafe-inline' https://cdn.shopify.com https://connect.facebook.net",
			"style-src 'self' 'unsafe-inline'",
			`img-src 'self' data: blob: https: ${assetOrigins}`.trim(),
			`font-src 'self' data: https: ${assetOrigins}`.trim(),
			`media-src 'self' blob: https: ${assetOrigins}`.trim(),
			`connect-src 'self' https://connect.facebook.net https://graph.facebook.com https://www.facebook.com https://*.myshopify.com https://*.shopify.com ${assetOrigins}`.trim(),
			"form-action 'self' https://*.myshopify.com"
		].join('; ')
	);
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	return response;
};
