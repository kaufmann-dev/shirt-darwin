import { describe, expect, it } from 'vitest';
import { normalizePrintfulTrackingUrl } from './printful';

describe('Printful shipment projection', () => {
	it('keeps only safe HTTPS tracking links', () => {
		expect(normalizePrintfulTrackingUrl('https://carrier.example/track/123')).toBe(
			'https://carrier.example/track/123'
		);
		expect(normalizePrintfulTrackingUrl('http://carrier.example/track/123')).toBeNull();
		expect(normalizePrintfulTrackingUrl('javascript:alert(1)')).toBeNull();
	});
});
