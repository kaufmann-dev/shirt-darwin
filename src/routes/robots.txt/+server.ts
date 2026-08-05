import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response('User-agent: *\nAllow: /\n', {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=300'
		}
	});
