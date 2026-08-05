import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isStorefrontIndexable } from '$lib/components/storefront/data.server';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (locals.brandSlug !== params.slug) error(404, 'Storefront not found');
	const indexable = await isStorefrontIndexable(params.slug);
	const body = indexable
		? `User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`
		: 'User-agent: *\nDisallow: /\n';
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=300'
		}
	});
};
