import { z } from 'zod';

const productImageSchema = z.object({
	url: z.string().url(),
	altText: z.string().nullable()
});

export const storefrontShopifyProductSnapshotSchema = z.object({
	id: z.string().min(1),
	handle: z.string().min(1),
	title: z.string().min(1),
	description: z.string(),
	featuredImage: productImageSchema.nullable(),
	images: z.array(productImageSchema),
	variants: z.array(
		z.object({
			id: z.string().min(1),
			title: z.string(),
			availableForSale: z.boolean(),
			price: z.object({ amount: z.string(), currencyCode: z.string().length(3) }),
			selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
			image: productImageSchema.nullable()
		})
	)
});

const catalogProductSchema = z
	.object({
		mappingId: z.string().uuid(),
		garment: z.enum(['tshirt', 'hoodie', 'crewneck']),
		shopifyProductId: z.string().min(1),
		shopifyHandle: z.string().min(1),
		productSnapshot: storefrontShopifyProductSnapshotSchema
	})
	.superRefine((product, context) => {
		if (product.productSnapshot.id !== product.shopifyProductId) {
			context.addIssue({
				code: 'custom',
				path: ['productSnapshot', 'id'],
				message: 'The Shopify snapshot product ID must match the mapped product ID'
			});
		}
		if (product.productSnapshot.handle !== product.shopifyHandle) {
			context.addIssue({
				code: 'custom',
				path: ['productSnapshot', 'handle'],
				message: 'The Shopify snapshot handle must match the mapped product handle'
			});
		}
	});

const catalogDesignSchema = z.object({
	id: z.string().uuid(),
	slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	name: z.string().min(1),
	description: z.string(),
	mockupAssetId: z.string().uuid().nullable(),
	products: z.array(catalogProductSchema)
});

export const storefrontCatalogSnapshotSchema = z.object({
	version: z.literal(1),
	designs: z.array(catalogDesignSchema)
});

export type StorefrontCatalogSnapshot = z.infer<typeof storefrontCatalogSnapshotSchema>;

export type StorefrontCatalogOperationalFacts = {
	mappingId: string;
	providerAvailable: boolean;
	shopifyProductId: string;
	variants: Array<{
		id: string;
		availableForSale: boolean;
		price: { amount: string; currencyCode: string };
	}>;
};

export type WorkingCatalogDesign = {
	id: string;
	slug: string;
	name: string;
	description: string;
	mockupAssetId: string | null;
	mappings: Array<{
		id: string;
		garment: string;
		shopifyProductId: string;
		shopifyHandle: string;
		active: boolean;
		providerAvailable: boolean;
		productSnapshot: unknown;
	}>;
};

function compareStrings(left: string, right: string) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalizeStorefrontCatalogSnapshot(
	snapshot: StorefrontCatalogSnapshot
): StorefrontCatalogSnapshot {
	return {
		...snapshot,
		designs: snapshot.designs
			.map((design) => ({
				...design,
				products: [...design.products].sort(
					(left, right) =>
						compareStrings(left.garment, right.garment) ||
						compareStrings(left.mappingId, right.mappingId)
				)
			}))
			.sort(
				(left, right) => compareStrings(left.slug, right.slug) || compareStrings(left.id, right.id)
			)
	};
}

function storefrontCatalogContentForEquality(snapshot: StorefrontCatalogSnapshot) {
	const canonical = canonicalizeStorefrontCatalogSnapshot(snapshot);
	return {
		...canonical,
		designs: canonical.designs.map((design) => ({
			...design,
			products: design.products.map((product) => ({
				...product,
				productSnapshot: {
					...product.productSnapshot,
					variants: product.productSnapshot.variants.map((variant) => ({
						id: variant.id,
						title: variant.title,
						selectedOptions: variant.selectedOptions,
						image: variant.image
					}))
				}
			}))
		}))
	};
}

/** Builds a detached, display-only copy of the working catalog for one publication. */
export function createStorefrontCatalogSnapshot(
	designs: WorkingCatalogDesign[]
): StorefrontCatalogSnapshot {
	const snapshot = storefrontCatalogSnapshotSchema.parse({
		version: 1,
		designs: designs.map((design) => ({
			id: design.id,
			slug: design.slug,
			name: design.name,
			description: design.description,
			mockupAssetId: design.mockupAssetId,
			products: design.mappings
				.filter((mapping) => mapping.active && mapping.providerAvailable)
				.map((mapping) => ({
					mappingId: mapping.id,
					garment: mapping.garment,
					shopifyProductId: mapping.shopifyProductId,
					shopifyHandle: mapping.shopifyHandle,
					productSnapshot: mapping.productSnapshot
				}))
		}))
	});
	return canonicalizeStorefrontCatalogSnapshot(snapshot);
}

export function storefrontCatalogSnapshotsEqual(left: unknown, right: unknown): boolean {
	const parsedLeft = storefrontCatalogSnapshotSchema.safeParse(left);
	const parsedRight = storefrontCatalogSnapshotSchema.safeParse(right);
	return (
		parsedLeft.success &&
		parsedRight.success &&
		JSON.stringify(storefrontCatalogContentForEquality(parsedLeft.data)) ===
			JSON.stringify(storefrontCatalogContentForEquality(parsedRight.data))
	);
}

/** Keeps frozen content while applying only current Shopify availability and USD prices. */
export function overlayStorefrontCatalogOperationalFacts(
	snapshot: unknown,
	facts: StorefrontCatalogOperationalFacts[]
): StorefrontCatalogSnapshot {
	const frozen = storefrontCatalogSnapshotSchema.parse(snapshot);
	const factsByMapping = new Map(facts.map((item) => [item.mappingId, item]));
	return storefrontCatalogSnapshotSchema.parse({
		...frozen,
		designs: frozen.designs.map((design) => ({
			...design,
			products: design.products.map((product) => {
				const current = factsByMapping.get(product.mappingId);
				const identityMatches =
					current?.providerAvailable === true &&
					current.shopifyProductId === product.shopifyProductId &&
					current.variants.every((variant) => variant.price.currencyCode === 'USD');
				const variantsById = identityMatches
					? new Map(current.variants.map((variant) => [variant.id, variant]))
					: new Map<string, StorefrontCatalogOperationalFacts['variants'][number]>();
				return {
					...product,
					productSnapshot: {
						...product.productSnapshot,
						variants: product.productSnapshot.variants.map((variant) => {
							const operational = variantsById.get(variant.id);
							if (!operational || operational.price.currencyCode !== 'USD') {
								return { ...variant, availableForSale: false };
							}
							return {
								...variant,
								availableForSale: operational.availableForSale,
								price: operational.price
							};
						})
					}
				};
			})
		}))
	});
}
