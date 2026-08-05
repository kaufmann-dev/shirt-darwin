import { env } from '$env/dynamic/public';
import { resolveHost } from '$lib/domain/tenancy';
import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => {
	const rootHost = (env.PUBLIC_ROOT_HOST || 'localhost').toLowerCase();
	const resolution = resolveHost(url.hostname, rootHost);
	if (resolution.kind !== 'brand') return;
	return `/__brand/${encodeURIComponent(resolution.slug)}${url.pathname}`;
};
