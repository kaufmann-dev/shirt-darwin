export const reservedSubdomains = new Set([
	'www',
	'admin',
	'api',
	'mcp',
	'assets',
	'checkout',
	'webhooks',
	'health'
]);

export type HostResolution =
	| { kind: 'root' }
	| { kind: 'www' }
	| { kind: 'brand'; slug: string }
	| { kind: 'reserved'; slug: string }
	| { kind: 'unknown' };

export function resolveHost(hostname: string, rootHost: string): HostResolution {
	const host = hostname.trim().toLowerCase();
	const root = rootHost.trim().toLowerCase();
	if (host === root || (root === 'localhost' && host === '127.0.0.1')) return { kind: 'root' };
	if (host === `www.${root}`) return { kind: 'www' };
	if (!host.endsWith(`.${root}`)) return { kind: 'unknown' };

	const slug = host.slice(0, -(root.length + 1));
	if (!slug || slug.includes('.') || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return { kind: 'unknown' };
	}
	if (reservedSubdomains.has(slug)) return { kind: 'reserved', slug };
	return { kind: 'brand', slug };
}
