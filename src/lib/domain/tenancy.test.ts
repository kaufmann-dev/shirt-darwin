import { describe, expect, it } from 'vitest';
import { resolveHost } from './tenancy';

describe('hostname resolution', () => {
	it('resolves root and www hosts', () => {
		expect(resolveHost('example.com', 'example.com')).toEqual({ kind: 'root' });
		expect(resolveHost('www.example.com', 'example.com')).toEqual({ kind: 'www' });
	});

	it('resolves one valid brand label', () => {
		expect(resolveHost('bird-club.example.com', 'example.com')).toEqual({
			kind: 'brand',
			slug: 'bird-club'
		});
	});

	it('rejects reserved, nested and unrelated hosts', () => {
		expect(resolveHost('admin.example.com', 'example.com')).toEqual({
			kind: 'reserved',
			slug: 'admin'
		});
		expect(resolveHost('a.b.example.com', 'example.com')).toEqual({ kind: 'unknown' });
		expect(resolveHost('attacker.test', 'example.com')).toEqual({ kind: 'unknown' });
		expect(resolveHost('localhost', 'example.com')).toEqual({ kind: 'unknown' });
	});
});
