import { describe, expect, it } from 'vitest';
import { createTrackingLink, isAttributable } from './attribution';

describe('first-party attribution', () => {
	it('creates deterministic Meta tracking parameters', () => {
		const url = new URL(
			createTrackingLink({
				storefrontUrl: 'https://birds.example.com/',
				trackingToken: 'token-1',
				campaignId: '123',
				campaignName: 'Bird launch',
				adSetId: '456',
				adId: '789'
			})
		);
		expect(url.searchParams.get('sd')).toBe('token-1');
		expect(url.searchParams.get('utm_source')).toBe('meta');
		expect(url.searchParams.get('utm_id')).toBe('123');
	});

	it('uses an inclusive seven-day click window', () => {
		const clickedAt = new Date('2026-08-01T00:00:00Z');
		expect(
			isAttributable(
				{ experimentId: 'experiment', campaignId: 'campaign', clickedAt },
				new Date('2026-08-08T00:00:00Z')
			)
		).toBe(true);
		expect(
			isAttributable(
				{ experimentId: 'experiment', campaignId: 'campaign', clickedAt },
				new Date('2026-08-08T00:00:00.001Z')
			)
		).toBe(false);
	});
});
