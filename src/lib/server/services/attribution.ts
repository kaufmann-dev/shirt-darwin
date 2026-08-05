import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { attributionTouch, campaignMapping, experiment } from '$lib/server/db/schema';
import { SHOPIFY_ATTRIBUTION_ATTRIBUTES } from './sync';
import type { ShopifyCartAttribute } from '../integrations/shopify';

export const attributionCookie = 'sd_click';
const metaBrowserId = z
	.string()
	.max(255)
	.regex(/^fb\.\d+\.\d+\.[a-zA-Z0-9_-]+$/);

export async function captureAttributionFromUrl(url: URL, cookies: Cookies, storefrontId: string) {
	const safeStorefrontId = z.string().uuid().parse(storefrontId);
	const token = url.searchParams.get('sd');
	if (!token || token.length > 255) return null;
	const now = new Date();
	const previousClickId = z.string().uuid().safeParse(cookies.get(attributionCookie));
	const captured = await db.transaction(async (tx) => {
		const [campaign] = await tx
			.select({
				experimentId: campaignMapping.experimentId,
				campaignId: campaignMapping.campaignId
			})
			.from(campaignMapping)
			.innerJoin(experiment, eq(campaignMapping.experimentId, experiment.id))
			.where(
				and(
					eq(campaignMapping.trackingToken, token),
					eq(experiment.storefrontId, safeStorefrontId),
					lte(experiment.startsAt, now),
					gte(experiment.endsAt, now),
					isNull(experiment.endedAt)
				)
			)
			.limit(1);
		if (!campaign) return null;

		if (previousClickId.success) {
			const [previous] = await tx
				.select({
					id: attributionTouch.id,
					experimentId: attributionTouch.experimentId,
					campaignId: attributionTouch.campaignId,
					marketingConsentRevokedAt: attributionTouch.marketingConsentRevokedAt
				})
				.from(attributionTouch)
				.where(eq(attributionTouch.clickId, previousClickId.data))
				.limit(1);
			if (
				previous &&
				previous.marketingConsentRevokedAt === null &&
				previous.experimentId === campaign.experimentId &&
				previous.campaignId === campaign.campaignId
			) {
				await tx
					.update(attributionTouch)
					.set({
						clickedAt: now,
						utmSource: safeQuery(url, 'utm_source'),
						utmMedium: safeQuery(url, 'utm_medium'),
						utmCampaign: safeQuery(url, 'utm_campaign')
					})
					.where(eq(attributionTouch.id, previous.id));
				return { clickId: previousClickId.data, experimentId: campaign.experimentId };
			}
			if (previous?.marketingConsentRevokedAt === null) {
				await tx
					.update(attributionTouch)
					.set({ marketingConsentRevokedAt: now })
					.where(eq(attributionTouch.id, previous.id));
			}
		}

		const clickId = crypto.randomUUID();
		await tx.insert(attributionTouch).values({
			clickId,
			experimentId: campaign.experimentId,
			campaignId: campaign.campaignId,
			utmSource: safeQuery(url, 'utm_source'),
			utmMedium: safeQuery(url, 'utm_medium'),
			utmCampaign: safeQuery(url, 'utm_campaign'),
			clickedAt: now
		});
		return { clickId, experimentId: campaign.experimentId };
	});
	if (!captured) return null;
	cookies.set(attributionCookie, captured.clickId, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 7 * 24 * 60 * 60
	});
	return captured;
}

export async function getCartAttributionAttributes(
	cookies: Cookies,
	storefrontId: string
): Promise<ShopifyCartAttribute[]> {
	const safeStorefrontId = z.string().uuid().parse(storefrontId);
	const parsed = z.string().uuid().safeParse(cookies.get(attributionCookie));
	if (!parsed.success) return [];
	const now = new Date();
	const earliestClick = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const [touch] = await db
		.select({ clickId: attributionTouch.clickId, experimentId: attributionTouch.experimentId })
		.from(attributionTouch)
		.innerJoin(experiment, eq(attributionTouch.experimentId, experiment.id))
		.where(
			and(
				eq(attributionTouch.clickId, parsed.data),
				eq(experiment.storefrontId, safeStorefrontId),
				isNull(attributionTouch.marketingConsentRevokedAt),
				gte(attributionTouch.clickedAt, earliestClick),
				lte(attributionTouch.clickedAt, now)
			)
		)
		.limit(1);
	if (!touch) return [];
	return [
		{ key: SHOPIFY_ATTRIBUTION_ATTRIBUTES.clickId, value: touch.clickId },
		{ key: SHOPIFY_ATTRIBUTION_ATTRIBUTES.experimentId, value: touch.experimentId }
	];
}

export async function revokeAttribution(cookies: Cookies) {
	const parsed = z.string().uuid().safeParse(cookies.get(attributionCookie));
	if (parsed.success) {
		await db
			.update(attributionTouch)
			.set({ marketingConsentRevokedAt: new Date() })
			.where(
				and(
					eq(attributionTouch.clickId, parsed.data),
					isNull(attributionTouch.marketingConsentRevokedAt)
				)
			);
	}
	cookies.delete(attributionCookie, { path: '/' });
}

export async function storeAttributionBrowserIds(
	clickId: string | undefined,
	input: { fbp?: string; fbc?: string }
) {
	const parsed = z
		.object({
			clickId: z.string().uuid(),
			fbp: metaBrowserId.optional(),
			fbc: metaBrowserId.optional()
		})
		.safeParse({ clickId, ...input });
	if (!parsed.success || (!parsed.data.fbp && !parsed.data.fbc)) return;
	await db
		.update(attributionTouch)
		.set({
			...(parsed.data.fbp ? { fbp: parsed.data.fbp } : {}),
			...(parsed.data.fbc ? { fbc: parsed.data.fbc } : {})
		})
		.where(
			and(
				eq(attributionTouch.clickId, parsed.data.clickId),
				isNull(attributionTouch.marketingConsentRevokedAt)
			)
		);
}

function safeQuery(url: URL, key: string) {
	const value = url.searchParams.get(key);
	return value ? value.slice(0, 255) : null;
}
