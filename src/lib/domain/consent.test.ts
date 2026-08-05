import { describe, expect, it } from 'vitest';
import { marketingConsent, necessaryOnlyDecision } from './consent';

describe('marketing consent', () => {
	it('always honors Global Privacy Control', () => {
		expect(
			marketingConsent({
				globalPrivacyControl: true,
				regionRequiresOptIn: false,
				storedDecision: {
					analytics: true,
					marketing: true,
					saleOfData: true,
					decidedAt: '2026-08-05T00:00:00Z'
				}
			})
		).toBe(false);
	});

	it('defaults to necessary-only in opt-in regions', () => {
		expect(
			marketingConsent({
				globalPrivacyControl: false,
				regionRequiresOptIn: true,
				storedDecision: null
			})
		).toBe(false);
		expect(necessaryOnlyDecision(new Date('2026-08-05T00:00:00Z')).marketing).toBe(false);
	});
});
