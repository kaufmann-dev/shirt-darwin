import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from './errors';
import {
	fetchMetaInsightPages,
	hashMetaExternalId,
	createMetaClient,
	metaInsightsPageUrl,
	metaInsightsUrl
} from './meta';

const insight = (campaignId: string, date: string) => ({
	campaign_id: campaignId,
	date_start: date,
	date_stop: date,
	account_currency: 'USD',
	spend: '1.00',
	impressions: '10',
	clicks: '2'
});

describe('Meta Insights pagination', () => {
	it('reads every page at campaign level without carrying a query-string access token', async () => {
		const responses = [
			{
				data: [insight('campaign-1', '2026-01-01')],
				paging: {
					next: 'https://graph.facebook.com/v25.0/act_123/insights?after=cursor&access_token=leaked-token'
				}
			},
			{ data: [insight('campaign-1', '2026-01-02')] }
		];
		const requestedUrls: string[] = [];
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			requestedUrls.push(String(input));
			return new Response(JSON.stringify(responses.shift()), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		const firstPageUrl = metaInsightsUrl({
			version: 'v25.0',
			adAccountId: 'act_123',
			since: '2026-01-01',
			until: '2026-01-02',
			campaignIds: ['campaign-1']
		});
		const result = await fetchMetaInsightPages(firstPageUrl, 'test-access-token', fetchMock);

		expect(result).toHaveLength(2);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const firstUrl = new URL(requestedUrls[0]!);
		const secondUrl = new URL(requestedUrls[1]!);
		expect(firstUrl.searchParams.get('level')).toBe('campaign');
		expect(secondUrl.searchParams.get('access_token')).toBeNull();
	});

	it('rejects pagination onto an untrusted origin', () => {
		const firstPage = new URL('https://graph.facebook.com/v25.0/act_123/insights');

		expect(() =>
			metaInsightsPageUrl('https://attacker.invalid/collect?after=cursor', firstPage)
		).toThrowError(ProviderError);
	});
});

describe('Meta user-data hashing', () => {
	it('normalizes and hashes the anonymous external identifier', () => {
		expect(hashMetaExternalId('  Click-ID  ')).toBe(
			'ab0a15b2fdc58239dc770317df40fb10ba1c0dbeb4f8cb33d32da26789d59944'
		);
	});
});

describe('Meta Conversions API acknowledgement', () => {
	it('rejects a successful HTTP response that received no events', async () => {
		const fetchMock = async () => Response.json({ events_received: 0 }, { status: 200 });
		const client = createMetaClient(fetchMock, {
			version: 'v25.0',
			accessToken: 'test-token',
			datasetId: 'dataset-1'
		});

		await expect(
			client.sendEvent(
				{
					eventName: 'Purchase',
					eventId: 'event-1',
					eventTime: 1_785_928_000,
					eventSourceUrl: 'https://bird-club.example.com/',
					currency: 'USD',
					value: 42
				},
				true
			)
		).rejects.toBeInstanceOf(ProviderError);
	});
});
