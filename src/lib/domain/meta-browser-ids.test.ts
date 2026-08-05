import { describe, expect, it } from 'vitest';
import { resolveMetaFbc } from './meta-browser-ids';

describe('Meta browser identifiers', () => {
	it('replaces an old fbc when a new paid click is present', () => {
		expect(
			resolveMetaFbc({
				existingFbc: 'fb.1.100.old-click',
				fbclid: 'new-click',
				timestamp: 200
			})
		).toBe('fb.1.200.new-click');
	});

	it('preserves an existing fbc without a valid paid click', () => {
		expect(
			resolveMetaFbc({
				existingFbc: 'fb.1.100.old-click',
				fbclid: 'invalid click',
				timestamp: 200
			})
		).toBe('fb.1.100.old-click');
	});
});
