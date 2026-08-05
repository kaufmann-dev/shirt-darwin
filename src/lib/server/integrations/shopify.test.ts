import { describe, expect, it } from 'vitest';
import { createShopifyStorefrontClient, shopifyProductSupportsUsMarket } from './shopify';

const configuration = {
	storeDomain: 'shirt-darwin.myshopify.com',
	apiVersion: '2026-07',
	token: 'storefront-token'
};

function productPage(variantId: string, hasNextPage: boolean, endCursor: string | null) {
	return {
		id: 'gid://shopify/Product/1',
		handle: 'bird-shirt',
		title: 'Bird Shirt',
		description: 'A shirt for bird people.',
		featuredImage: null,
		images: { nodes: [] },
		variants: {
			nodes: [
				{
					id: variantId,
					title: 'Black / M',
					availableForSale: true,
					price: { amount: '24.00', currencyCode: 'USD' },
					selectedOptions: [
						{ name: 'Color', value: 'Black' },
						{ name: 'Size', value: 'M' }
					],
					image: null
				}
			],
			pageInfo: { hasNextPage, endCursor }
		}
	};
}

describe('Shopify US storefront client', () => {
	it('paginates every product variant in US context', async () => {
		const requests: Array<{ query: string; variables: Record<string, unknown> }> = [];
		const fetchImpl: typeof fetch = async (_input, init) => {
			const request = JSON.parse(String(init?.body)) as (typeof requests)[number];
			requests.push(request);
			const page =
				requests.length === 1
					? productPage('gid://shopify/ProductVariant/1', true, 'next-page')
					: productPage('gid://shopify/ProductVariant/2', false, null);
			return Response.json({ data: { product: page } });
		};

		const product = await createShopifyStorefrontClient(
			fetchImpl,
			configuration
		).getProductByHandle('bird-shirt');

		expect(product?.variants.map((variant) => variant.id)).toEqual([
			'gid://shopify/ProductVariant/1',
			'gid://shopify/ProductVariant/2'
		]);
		expect(requests).toHaveLength(2);
		expect(requests[0]?.query).toContain('@inContext(country: US)');
		expect(requests[1]?.variables.after).toBe('next-page');
		expect(product && shopifyProductSupportsUsMarket(product)).toBe(true);
	});

	it('creates a US-buyer cart and retains first-party attributes', async () => {
		let requestBody: { query: string; variables: Record<string, unknown> } | undefined;
		const fetchImpl: typeof fetch = async (_input, init) => {
			requestBody = JSON.parse(String(init?.body));
			return Response.json({
				data: {
					cartCreate: {
						cart: {
							id: 'gid://shopify/Cart/1',
							checkoutUrl: 'https://shirt-darwin.myshopify.com/checkouts/1'
						},
						userErrors: []
					}
				}
			});
		};

		await createShopifyStorefrontClient(fetchImpl, configuration).createCart(
			[{ merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 }],
			[{ key: '_sd_click_id', value: 'click-id' }]
		);

		expect(requestBody?.query).toContain('@inContext(country: US)');
		expect(requestBody?.variables).toMatchObject({
			input: {
				buyerIdentity: { countryCode: 'US' },
				attributes: [{ key: '_sd_click_id', value: 'click-id' }]
			}
		});
	});
});
