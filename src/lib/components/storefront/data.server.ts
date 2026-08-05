import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { brandManifestSchema, type BrandManifest } from '$lib/domain/brand';
import type { ConsentDecision } from '$lib/domain/consent';
import {
	createStorefrontCatalogSnapshot,
	overlayStorefrontCatalogOperationalFacts,
	storefrontCatalogSnapshotSchema,
	storefrontShopifyProductSnapshotSchema,
	type StorefrontCatalogSnapshot
} from '$lib/domain/storefront-catalog';
import { db } from '$lib/server/db';
import {
	brandAsset,
	designFamily,
	productMapping,
	storefront,
	storefrontRevision
} from '$lib/server/db/schema';
import { getShopifyCustomerPrivacyConfig } from '$lib/server/integrations/shopify';
import { serverConfig } from '$lib/server/config';
import { createAssetDownloadUrl, getAssetPublicUrl } from '$lib/server/storage';
import type {
	Garment,
	ShopifyPrivacyConfig,
	StorefrontDesign,
	StorefrontProduct,
	StorefrontView
} from './types';

const consentDecisionSchema = z.object({
	analytics: z.boolean(),
	marketing: z.boolean(),
	saleOfData: z.boolean(),
	decidedAt: z.string().datetime()
});

export const storefrontConsentCookie = 'sd_consent';

export function readConsentDecision(cookieValue: string | undefined): ConsentDecision | null {
	if (!cookieValue) return null;
	try {
		return consentDecisionSchema.parse(JSON.parse(decodeURIComponent(cookieValue)));
	} catch {
		return null;
	}
}

export function centralOrigin(): string {
	return serverConfig.appOrigin;
}

export function storefrontPrivacyConfig(): ShopifyPrivacyConfig | null {
	try {
		return getShopifyCustomerPrivacyConfig(serverConfig.rootHost);
	} catch {
		return null;
	}
}

type StorefrontIdentity = {
	id: string;
	slug: string;
	name: string;
};

export async function buildStorefrontView(input: {
	storefront: StorefrontIdentity;
	revision: number;
	manifest: BrandManifest;
	canonicalOrigin: string;
	legalBaseUrl: string;
	catalog:
		| { source: 'working' }
		| {
				source: 'published';
				snapshot: StorefrontCatalogSnapshot;
				overlayCurrentShopifyFacts?: boolean;
		  };
	includePrivateAssets?: boolean;
}): Promise<StorefrontView> {
	const manifest = brandManifestSchema.parse(input.manifest);
	const [catalogSource, assetRows] = await Promise.all([
		input.catalog.source === 'published'
			? Promise.resolve(storefrontCatalogSnapshotSchema.parse(input.catalog.snapshot))
			: loadWorkingCatalog(input.storefront.id),
		db
			.select({ id: brandAsset.id, objectKey: brandAsset.objectKey })
			.from(brandAsset)
			.where(
				input.includePrivateAssets
					? and(eq(brandAsset.storefrontId, input.storefront.id), isNotNull(brandAsset.confirmedAt))
					: and(
							eq(brandAsset.storefrontId, input.storefront.id),
							eq(brandAsset.visibility, 'public'),
							isNotNull(brandAsset.confirmedAt)
						)
			)
	]);
	const catalog =
		input.catalog.source === 'published' && input.catalog.overlayCurrentShopifyFacts
			? await withCurrentShopifyOperationalFacts(input.storefront.id, catalogSource)
			: catalogSource;

	const assetUrls: Record<string, string> = {};
	for (const asset of assetRows) {
		try {
			assetUrls[asset.id] = input.includePrivateAssets
				? await createAssetDownloadUrl(asset.objectKey)
				: getAssetPublicUrl(asset.objectKey);
		} catch {
			// A missing storage configuration makes the individual asset unavailable, not the store.
		}
	}

	const garmentOrder: Record<Garment, number> = { tshirt: 0, hoodie: 1, crewneck: 2 };
	const designs: StorefrontDesign[] = catalog.designs.map((design) => ({
		id: design.id,
		slug: design.slug,
		name: design.name,
		description: design.description,
		mockupUrl: design.mockupAssetId ? (assetUrls[design.mockupAssetId] ?? null) : null,
		products: design.products
			.map((product): StorefrontProduct => ({
				mappingId: product.mappingId,
				garment: product.garment,
				shopifyProductId: product.shopifyProductId,
				handle: product.shopifyHandle,
				title: product.productSnapshot.title,
				description: product.productSnapshot.description,
				featuredImage: product.productSnapshot.featuredImage,
				images: product.productSnapshot.images,
				variants: product.productSnapshot.variants
			}))
			.sort((left, right) => garmentOrder[left.garment] - garmentOrder[right.garment])
	}));

	return {
		id: input.storefront.id,
		slug: input.storefront.slug,
		name: input.storefront.name,
		revision: input.revision,
		manifest,
		preset: manifest.theme.preset,
		assetUrls,
		designs,
		canonicalOrigin: input.canonicalOrigin.replace(/\/$/, ''),
		legalBaseUrl: input.legalBaseUrl.replace(/\/$/, '')
	};
}

export async function getPublishedStorefrontView(
	slug: string,
	canonicalOrigin: string,
	legalBaseUrl: string
): Promise<StorefrontView | null> {
	const [row] = await db
		.select({
			id: storefront.id,
			slug: storefront.slug,
			name: storefront.name,
			revision: storefrontRevision.revision,
			manifest: storefrontRevision.manifest,
			catalogSnapshot: storefrontRevision.catalogSnapshot
		})
		.from(storefront)
		.innerJoin(
			storefrontRevision,
			and(
				eq(storefrontRevision.id, storefront.publishedRevisionId),
				eq(storefrontRevision.storefrontId, storefront.id)
			)
		)
		.where(and(eq(storefront.slug, slug), eq(storefront.status, 'live')))
		.limit(1);

	if (!row) return null;
	const snapshot = storefrontCatalogSnapshotSchema.safeParse(row.catalogSnapshot);
	if (!snapshot.success) return null;
	return buildStorefrontView({
		storefront: row,
		revision: row.revision,
		manifest: brandManifestSchema.parse(row.manifest),
		canonicalOrigin,
		legalBaseUrl,
		catalog: {
			source: 'published',
			snapshot: snapshot.data,
			overlayCurrentShopifyFacts: true
		}
	});
}

export async function isStorefrontIndexable(slug: string): Promise<boolean> {
	const [row] = await db
		.select({ id: storefront.id })
		.from(storefront)
		.innerJoin(
			storefrontRevision,
			and(
				eq(storefrontRevision.id, storefront.publishedRevisionId),
				eq(storefrontRevision.storefrontId, storefront.id)
			)
		)
		.where(
			and(
				eq(storefront.slug, slug),
				eq(storefront.status, 'live'),
				isNotNull(storefront.publishedRevisionId),
				isNotNull(storefrontRevision.catalogSnapshot)
			)
		)
		.limit(1);
	return Boolean(row);
}

export function containsVariant(storefrontView: StorefrontView, variantId: string): boolean {
	return storefrontView.designs.some((design) =>
		design.products.some((product) =>
			product.variants.some((variant) => variant.id === variantId && variant.availableForSale)
		)
	);
}

async function loadWorkingCatalog(storefrontId: string): Promise<StorefrontCatalogSnapshot> {
	const designRows = await db
		.select({
			id: designFamily.id,
			slug: designFamily.slug,
			name: designFamily.name,
			description: designFamily.description,
			mockupAssetId: designFamily.mockupAssetId
		})
		.from(designFamily)
		.where(eq(designFamily.storefrontId, storefrontId))
		.orderBy(asc(designFamily.createdAt));
	const mappingRows =
		designRows.length === 0
			? []
			: await db
					.select({
						id: productMapping.id,
						designFamilyId: productMapping.designFamilyId,
						garment: productMapping.garment,
						shopifyProductId: productMapping.shopifyProductId,
						shopifyHandle: productMapping.shopifyHandle,
						active: productMapping.active,
						providerAvailable: productMapping.providerAvailable,
						productSnapshot: productMapping.productSnapshot
					})
					.from(productMapping)
					.where(
						inArray(
							productMapping.designFamilyId,
							designRows.map((design) => design.id)
						)
					);

	return createStorefrontCatalogSnapshot(
		designRows.map((design) => ({
			...design,
			mappings: mappingRows.filter((mapping) => mapping.designFamilyId === design.id)
		}))
	);
}

async function withCurrentShopifyOperationalFacts(
	storefrontId: string,
	snapshot: StorefrontCatalogSnapshot
): Promise<StorefrontCatalogSnapshot> {
	const mappingIds = snapshot.designs.flatMap((design) =>
		design.products.map((product) => product.mappingId)
	);
	if (mappingIds.length === 0) return snapshot;
	const rows = await db
		.select({
			id: productMapping.id,
			providerAvailable: productMapping.providerAvailable,
			shopifyProductId: productMapping.shopifyProductId,
			productSnapshot: productMapping.productSnapshot
		})
		.from(productMapping)
		.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
		.where(
			and(eq(designFamily.storefrontId, storefrontId), inArray(productMapping.id, mappingIds))
		);
	const facts = rows.flatMap((row) => {
		const current = storefrontShopifyProductSnapshotSchema.safeParse(row.productSnapshot);
		if (!current.success || current.data.id !== row.shopifyProductId) {
			return [];
		}
		return [
			{
				mappingId: row.id,
				providerAvailable: row.providerAvailable,
				shopifyProductId: row.shopifyProductId,
				variants: current.data.variants.map((variant) => ({
					id: variant.id,
					availableForSale: variant.availableForSale,
					price: variant.price
				}))
			}
		];
	});
	return overlayStorefrontCatalogOperationalFacts(snapshot, facts);
}
