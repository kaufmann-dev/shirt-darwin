import { describe, expect, it } from 'vitest';
import {
	createStorefrontCatalogSnapshot,
	overlayStorefrontCatalogOperationalFacts,
	storefrontCatalogSnapshotsEqual
} from './storefront-catalog';

const designId = '10000000-0000-4000-8000-000000000001';
const mockupId = '10000000-0000-4000-8000-000000000002';
const mappingId = '10000000-0000-4000-8000-000000000003';
const inactiveMappingId = '10000000-0000-4000-8000-000000000004';

function productSnapshot() {
	return {
		id: 'gid://shopify/Product/1',
		handle: 'orbit-tee',
		title: 'Orbit tee',
		description: 'A heavyweight tee.',
		featuredImage: null,
		images: [],
		variants: [
			{
				id: 'gid://shopify/ProductVariant/1',
				title: 'Black / M',
				availableForSale: true,
				price: { amount: '28.00', currencyCode: 'USD' },
				selectedOptions: [
					{ name: 'Color', value: 'Black' },
					{ name: 'Size', value: 'M' }
				],
				image: null
			}
		]
	};
}

function workingCatalog() {
	return [
		{
			id: designId,
			slug: 'orbit',
			name: 'Orbit',
			description: 'A geometric orbit design.',
			mockupAssetId: mockupId,
			mappings: [
				{
					id: mappingId,
					garment: 'tshirt',
					shopifyProductId: 'gid://shopify/Product/1',
					shopifyHandle: 'orbit-tee',
					active: true,
					providerAvailable: true,
					productSnapshot: productSnapshot()
				},
				{
					id: inactiveMappingId,
					garment: 'hoodie',
					shopifyProductId: 'gid://shopify/Product/2',
					shopifyHandle: 'retired-orbit-hoodie',
					active: false,
					providerAvailable: true,
					productSnapshot: {
						...productSnapshot(),
						id: 'gid://shopify/Product/2',
						handle: 'retired-orbit-hoodie'
					}
				}
			]
		}
	];
}

describe('storefront catalog publication snapshot', () => {
	it('copies display data and excludes inactive or provider-unavailable mappings', () => {
		const working = workingCatalog();
		working[0].mappings.push({
			...working[0].mappings[1],
			id: '10000000-0000-4000-8000-000000000005',
			shopifyProductId: 'gid://shopify/Product/3',
			shopifyHandle: 'unavailable-orbit-crewneck',
			active: true,
			providerAvailable: false,
			productSnapshot: {
				...productSnapshot(),
				id: 'gid://shopify/Product/3',
				handle: 'unavailable-orbit-crewneck'
			}
		});
		const snapshot = createStorefrontCatalogSnapshot(working);

		working[0].name = 'Changed after publication';
		working[0].mappings[0].productSnapshot = { ...productSnapshot(), title: 'Changed title' };

		expect(snapshot.designs[0].name).toBe('Orbit');
		expect(snapshot.designs[0].products).toHaveLength(1);
		expect(snapshot.designs[0].products[0].productSnapshot.title).toBe('Orbit tee');
		expect(
			storefrontCatalogSnapshotsEqual(snapshot, createStorefrontCatalogSnapshot(working))
		).toBe(false);
	});

	it('rejects a Shopify snapshot that does not match its mapped identity', () => {
		const working = workingCatalog();
		working[0].mappings[0].productSnapshot = {
			...productSnapshot(),
			id: 'gid://shopify/Product/different'
		};

		expect(() => createStorefrontCatalogSnapshot(working)).toThrow(
			'The Shopify snapshot product ID must match the mapped product ID'
		);
	});

	it('overlays only matching frozen variants with current availability and USD price', () => {
		const working = workingCatalog();
		const frozenProduct = working[0].mappings[0].productSnapshot as ReturnType<
			typeof productSnapshot
		>;
		frozenProduct.variants.push({
			...frozenProduct.variants[0],
			id: 'gid://shopify/ProductVariant/2',
			title: 'Black / L',
			availableForSale: true
		});
		const snapshot = createStorefrontCatalogSnapshot(working);
		const overlaid = overlayStorefrontCatalogOperationalFacts(snapshot, [
			{
				mappingId,
				providerAvailable: true,
				shopifyProductId: 'gid://shopify/Product/1',
				variants: [
					{
						id: 'gid://shopify/ProductVariant/1',
						availableForSale: false,
						price: { amount: '31.00', currencyCode: 'USD' }
					},
					{
						id: 'gid://shopify/ProductVariant/new',
						availableForSale: true,
						price: { amount: '35.00', currencyCode: 'USD' }
					}
				]
			}
		]);

		const product = overlaid.designs[0].products[0];
		expect(overlaid.designs[0].name).toBe('Orbit');
		expect(product.productSnapshot.title).toBe('Orbit tee');
		expect(product.productSnapshot.variants).toHaveLength(2);
		expect(product.productSnapshot.variants[0]).toMatchObject({
			id: 'gid://shopify/ProductVariant/1',
			availableForSale: false,
			price: { amount: '31.00', currencyCode: 'USD' }
		});
		expect(product.productSnapshot.variants[1]).toMatchObject({
			id: 'gid://shopify/ProductVariant/2',
			availableForSale: false,
			price: { amount: '28.00', currencyCode: 'USD' }
		});
	});

	it('fails every frozen variant closed for missing, provider-unavailable, or remapped products', () => {
		const snapshot = createStorefrontCatalogSnapshot(workingCatalog());
		const unavailable = overlayStorefrontCatalogOperationalFacts(snapshot, [
			{
				mappingId,
				providerAvailable: false,
				shopifyProductId: 'gid://shopify/Product/1',
				variants: []
			}
		]);
		const remapped = overlayStorefrontCatalogOperationalFacts(snapshot, [
			{
				mappingId,
				providerAvailable: true,
				shopifyProductId: 'gid://shopify/Product/different',
				variants: []
			}
		]);
		const invalidCurrency = overlayStorefrontCatalogOperationalFacts(snapshot, [
			{
				mappingId,
				providerAvailable: true,
				shopifyProductId: 'gid://shopify/Product/1',
				variants: [
					{
						id: 'gid://shopify/ProductVariant/1',
						availableForSale: true,
						price: { amount: '28.00', currencyCode: 'EUR' }
					}
				]
			}
		]);
		const missing = overlayStorefrontCatalogOperationalFacts(snapshot, []);

		for (const catalog of [unavailable, remapped, invalidCurrency, missing]) {
			expect(catalog.designs[0].products[0].productSnapshot.variants[0].availableForSale).toBe(
				false
			);
		}
	});

	it('canonicalizes design and product order for stable snapshots and equality', () => {
		const designs = workingCatalog();
		designs[0].mappings[1] = {
			...designs[0].mappings[1],
			active: true
		};
		const secondDesign = {
			...designs[0],
			id: '10000000-0000-4000-8000-000000000006',
			slug: 'alpha',
			name: 'Alpha',
			mappings: []
		};
		const canonical = createStorefrontCatalogSnapshot([designs[0], secondDesign]);
		const reordered = {
			...canonical,
			designs: [...canonical.designs]
				.reverse()
				.map((design) => ({ ...design, products: [...design.products].reverse() }))
		};

		expect(canonical.designs.map((design) => design.slug)).toEqual(['alpha', 'orbit']);
		expect(canonical.designs[1].products.map((product) => product.garment)).toEqual([
			'hoodie',
			'tshirt'
		]);
		expect(storefrontCatalogSnapshotsEqual(canonical, reordered)).toBe(true);
	});

	it('ignores live price and availability drift when comparing frozen catalog content', () => {
		const frozen = createStorefrontCatalogSnapshot(workingCatalog());
		const current = structuredClone(frozen);
		current.designs[0].products[0].productSnapshot.variants[0].availableForSale = false;
		current.designs[0].products[0].productSnapshot.variants[0].price.amount = '34.00';

		expect(storefrontCatalogSnapshotsEqual(frozen, current)).toBe(true);

		current.designs[0].products[0].productSnapshot.variants[0].title = 'Black / Large';
		expect(storefrontCatalogSnapshotsEqual(frozen, current)).toBe(false);
	});
});
