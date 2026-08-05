export const ATTRIBUTION_WINDOW_DAYS = 7;
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface AttributionTouch {
	experimentId: string;
	campaignId: string | null;
	clickedAt: Date;
}

export interface TrackingLinkInput {
	storefrontUrl: string;
	trackingToken: string;
	campaignId: string;
	campaignName: string;
	adSetId?: string | null;
	adId?: string | null;
}

export function createTrackingLink(input: TrackingLinkInput) {
	const url = new URL(input.storefrontUrl);
	url.searchParams.set('sd', input.trackingToken);
	url.searchParams.set('utm_source', 'meta');
	url.searchParams.set('utm_medium', 'paid-social');
	url.searchParams.set('utm_campaign', input.campaignName);
	url.searchParams.set('utm_id', input.campaignId);
	if (input.adSetId) url.searchParams.set('utm_term', input.adSetId);
	if (input.adId) url.searchParams.set('utm_content', input.adId);
	return url.toString();
}

export function isAttributable(touch: AttributionTouch, orderedAt: Date) {
	const elapsed = orderedAt.getTime() - touch.clickedAt.getTime();
	return elapsed >= 0 && elapsed <= ATTRIBUTION_WINDOW_MS;
}
