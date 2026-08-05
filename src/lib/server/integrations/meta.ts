import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fetchProviderJson, ProviderError, requireProviderConfig, type FetchLike } from './errors';

const insightSchema = z.object({
	campaign_id: z.string(),
	date_start: z.string(),
	date_stop: z.string(),
	account_currency: z.string(),
	spend: z.string(),
	impressions: z.string(),
	clicks: z.string(),
	actions: z
		.array(z.object({ action_type: z.string(), value: z.string() }).passthrough())
		.optional(),
	action_values: z
		.array(z.object({ action_type: z.string(), value: z.string() }).passthrough())
		.optional()
});

export type MetaDailyInsight = z.infer<typeof insightSchema>;

const insightPageSchema = z.object({
	data: z.array(insightSchema),
	paging: z.object({ next: z.string().optional() }).passthrough().optional()
});

export type MetaConnectionConfig = {
	version: string;
	accessToken: string;
	adAccountId?: string;
	datasetId?: string;
};

function metaConfig(kind: 'insights' | 'capi', override?: MetaConnectionConfig) {
	const version = override?.version.trim() || env.META_GRAPH_API_VERSION?.trim();
	const accessToken = override?.accessToken.trim() || env.META_ACCESS_TOKEN?.trim();
	const adAccountId = override?.adAccountId?.trim() || env.META_AD_ACCOUNT_ID?.trim();
	const datasetId = override?.datasetId?.trim() || env.META_DATASET_ID?.trim();
	requireProviderConfig('meta', {
		META_GRAPH_API_VERSION: version,
		META_ACCESS_TOKEN: accessToken,
		...(kind === 'insights' ? { META_AD_ACCOUNT_ID: adAccountId } : { META_DATASET_ID: datasetId })
	});
	if (!/^v\d+\.\d+$/.test(version!)) throw new Error('Invalid META_GRAPH_API_VERSION');
	return { version: version!, accessToken: accessToken!, adAccountId, datasetId };
}

export type MetaServerEvent = {
	eventName: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';
	eventId: string;
	eventTime: number;
	eventSourceUrl: string;
	clientIpAddress?: string;
	clientUserAgent?: string;
	fbp?: string;
	fbc?: string;
	externalId?: string;
	currency?: string;
	value?: number;
	contentIds?: string[];
};

export function createMetaClient(fetchImpl?: FetchLike, configuration?: MetaConnectionConfig) {
	return {
		async listDailyInsights(options: {
			since: string;
			until: string;
			campaignIds?: string[];
		}): Promise<MetaDailyInsight[]> {
			const configured = metaConfig('insights', configuration);
			const firstPageUrl = metaInsightsUrl({
				version: configured.version,
				adAccountId: configured.adAccountId!,
				...options
			});
			return fetchMetaInsightPages(firstPageUrl, configured.accessToken, fetchImpl);
		},

		async sendEvent(event: MetaServerEvent, consented: boolean): Promise<{ sent: boolean }> {
			if (!consented) return { sent: false };
			const configured = metaConfig('capi', configuration);
			const customData =
				event.currency || event.value !== undefined || event.contentIds
					? {
							...(event.currency ? { currency: event.currency } : {}),
							...(event.value !== undefined ? { value: event.value } : {}),
							...(event.contentIds
								? { content_ids: event.contentIds, content_type: 'product' }
								: {})
						}
					: undefined;
			const body = {
				data: [
					{
						event_name: event.eventName,
						event_time: event.eventTime,
						event_id: event.eventId,
						action_source: 'website',
						event_source_url: event.eventSourceUrl,
						user_data: {
							...(event.clientIpAddress ? { client_ip_address: event.clientIpAddress } : {}),
							...(event.clientUserAgent ? { client_user_agent: event.clientUserAgent } : {}),
							...(event.fbp ? { fbp: event.fbp } : {}),
							...(event.fbc ? { fbc: event.fbc } : {}),
							...(event.externalId ? { external_id: [hashMetaExternalId(event.externalId)] } : {})
						},
						...(customData ? { custom_data: customData } : {})
					}
				],
				...(env.META_TEST_EVENT_CODE?.trim()
					? { test_event_code: env.META_TEST_EVENT_CODE.trim() }
					: {})
			};
			await fetchProviderJson({
				provider: 'meta',
				url: `https://graph.facebook.com/${configured.version}/${encodeURIComponent(configured.datasetId!)}/events`,
				init: {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${configured.accessToken}`,
						'content-type': 'application/json'
					},
					body: JSON.stringify(body)
				},
				schema: z.object({ events_received: z.number().int().positive() }),
				fetchImpl
			});
			return { sent: true };
		}
	};
}

export const meta = createMetaClient();

export function hashMetaExternalId(value: string) {
	return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function metaInsightsUrl(input: {
	version: string;
	adAccountId: string;
	since: string;
	until: string;
	campaignIds?: string[];
}) {
	const search = new URLSearchParams({
		fields:
			'campaign_id,date_start,date_stop,account_currency,spend,impressions,clicks,actions,action_values',
		level: 'campaign',
		time_increment: '1',
		time_range: JSON.stringify({ since: input.since, until: input.until }),
		limit: '500'
	});
	if (input.campaignIds?.length) {
		search.set(
			'filtering',
			JSON.stringify([
				{ field: 'campaign.id', operator: 'IN', value: input.campaignIds.slice(0, 200) }
			])
		);
	}
	const url = new URL(
		`/${input.version}/act_${input.adAccountId.replace(/^act_/, '')}/insights`,
		'https://graph.facebook.com'
	);
	url.search = search.toString();
	return url;
}

export async function fetchMetaInsightPages(
	firstPageUrl: URL,
	accessToken: string,
	fetchImpl?: FetchLike
) {
	const insights: MetaDailyInsight[] = [];
	const visited = new Set<string>();
	let pageUrl: URL | null = firstPageUrl;
	for (let page = 0; pageUrl; page += 1) {
		if (page >= 100) {
			throw new ProviderError(
				'meta',
				'invalid_pagination',
				'Meta Insights pagination exceeded the 100-page safety limit'
			);
		}
		const key = pageUrl.toString();
		if (visited.has(key)) {
			throw new ProviderError(
				'meta',
				'invalid_pagination',
				'Meta Insights pagination returned a repeated page'
			);
		}
		visited.add(key);
		const response: z.infer<typeof insightPageSchema> = await fetchProviderJson({
			provider: 'meta',
			url: pageUrl,
			init: { headers: { Authorization: `Bearer ${accessToken}` } },
			schema: insightPageSchema,
			fetchImpl,
			timeoutMs: 15_000
		});
		insights.push(...response.data);
		pageUrl = response.paging?.next
			? metaInsightsPageUrl(response.paging.next, firstPageUrl)
			: null;
	}
	return insights;
}

export function metaInsightsPageUrl(next: string, firstPageUrl: URL) {
	let pageUrl: URL;
	try {
		pageUrl = new URL(next);
	} catch (cause) {
		throw new ProviderError(
			'meta',
			'invalid_pagination',
			'Meta returned an invalid next-page URL',
			{
				cause
			}
		);
	}
	if (
		pageUrl.protocol !== 'https:' ||
		pageUrl.origin !== firstPageUrl.origin ||
		pageUrl.pathname !== firstPageUrl.pathname ||
		pageUrl.username ||
		pageUrl.password
	) {
		throw new ProviderError(
			'meta',
			'invalid_pagination',
			'Meta returned an untrusted next-page URL'
		);
	}
	pageUrl.searchParams.delete('access_token');
	return pageUrl;
}
