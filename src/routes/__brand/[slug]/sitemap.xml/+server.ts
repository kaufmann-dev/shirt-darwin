import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { centralOrigin, getPublishedStorefrontView } from '$lib/components/storefront/data.server';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (locals.brandSlug !== params.slug) error(404, 'Storefront not found');
	const storefront = await getPublishedStorefrontView(params.slug, url.origin, centralOrigin());
	if (!storefront) error(404, 'Storefront not found');

	const urls = [
		`${url.origin}/`,
		...storefront.designs.map((design) => `${url.origin}/design/${encodeURIComponent(design.slug)}`)
	];
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((location) => `  <url><loc>${escapeXml(location)}</loc></url>`).join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=300'
		}
	});
};

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
