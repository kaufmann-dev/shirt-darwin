import { env } from '$env/dynamic/private';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { fetchProviderJson, ProviderError, requireProviderConfig, type FetchLike } from './errors';

const moneySchema = z.object({ amount: z.string(), currencyCode: z.string().length(3) });
const imageSchema = z.object({ url: z.string().url(), altText: z.string().nullable() });

export const shopifyProductSnapshotSchema = z.object({
	id: z.string().min(1),
	handle: z.string().min(1),
	title: z.string().min(1),
	description: z.string(),
	featuredImage: imageSchema.nullable(),
	images: z.array(imageSchema),
	variants: z.array(
		z.object({
			id: z.string().min(1),
			title: z.string(),
			availableForSale: z.boolean(),
			price: moneySchema,
			selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
			image: imageSchema.nullable()
		})
	)
});

export type ShopifyProductSnapshot = z.infer<typeof shopifyProductSnapshotSchema>;
export type ShopifyCartLine = { merchandiseId: string; quantity: number };
export type ShopifyCartAttribute = { key: string; value: string };
export type ShopifyCartResult = { cartId: string; checkoutUrl: string };
export type ShopifyConnectionConfig = { storeDomain: string; apiVersion: string; token: string };

const graphqlEnvelope = z.object({
	data: z.unknown().optional(),
	errors: z.array(z.object({ message: z.string() }).passthrough()).optional()
});

function config(kind: 'storefront' | 'admin', override?: ShopifyConnectionConfig) {
	const storeDomain = override?.storeDomain.trim() || env.SHOPIFY_STORE_DOMAIN?.trim();
	const apiVersion = override?.apiVersion.trim() || env.SHOPIFY_API_VERSION?.trim();
	const token =
		override?.token.trim() ||
		(kind === 'storefront'
			? env.SHOPIFY_STOREFRONT_TOKEN?.trim()
			: env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim());
	requireProviderConfig('shopify', {
		SHOPIFY_STORE_DOMAIN: storeDomain,
		SHOPIFY_API_VERSION: apiVersion,
		[kind === 'storefront' ? 'SHOPIFY_STOREFRONT_TOKEN' : 'SHOPIFY_ADMIN_ACCESS_TOKEN']: token
	});
	if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(storeDomain!)) {
		throw new ProviderError('shopify', 'invalid_configuration', 'Invalid Shopify store domain');
	}
	return { storeDomain: storeDomain!, apiVersion: apiVersion!, token: token! };
}

async function graphql<T>(
	kind: 'storefront' | 'admin',
	query: string,
	variables: Record<string, unknown>,
	dataSchema: z.ZodType<T>,
	fetchImpl?: FetchLike,
	configuration?: ShopifyConnectionConfig
): Promise<T> {
	const configured = config(kind, configuration);
	const prefix = kind === 'admin' ? '/admin' : '';
	const tokenHeader =
		kind === 'admin' ? 'X-Shopify-Access-Token' : 'X-Shopify-Storefront-Access-Token';
	const response = await fetchProviderJson({
		provider: 'shopify',
		url: `https://${configured.storeDomain}${prefix}/api/${configured.apiVersion}/graphql.json`,
		init: {
			method: 'POST',
			headers: { 'content-type': 'application/json', [tokenHeader]: configured.token },
			body: JSON.stringify({ query, variables })
		},
		schema: graphqlEnvelope,
		fetchImpl
	});
	if (response.errors?.length) {
		throw new ProviderError(
			'shopify',
			'graphql_error',
			`Shopify GraphQL request failed: ${response.errors.map((item) => item.message).join('; ')}`
		);
	}
	const parsed = dataSchema.safeParse(response.data);
	if (!parsed.success) {
		throw new ProviderError(
			'shopify',
			'invalid_response',
			'Shopify returned an unexpected GraphQL response',
			{ cause: parsed.error }
		);
	}
	return parsed.data;
}

const cartPayloadSchema = z.object({
	cart: z.object({ id: z.string(), checkoutUrl: z.string().url() }).nullable(),
	userErrors: z.array(
		z.object({ field: z.array(z.string()).nullable().optional(), message: z.string() })
	)
});

function cartResult(payload: z.infer<typeof cartPayloadSchema>): ShopifyCartResult {
	if (payload.userErrors.length > 0) {
		throw new ProviderError(
			'shopify',
			'user_error',
			`Shopify rejected the cart: ${payload.userErrors.map((error) => error.message).join('; ')}`
		);
	}
	if (!payload.cart) {
		throw new ProviderError('shopify', 'missing_cart', 'Shopify did not return a cart');
	}
	return { cartId: payload.cart.id, checkoutUrl: payload.cart.checkoutUrl };
}

const cartInputSchema = z
	.array(
		z.object({
			merchandiseId: z.string().startsWith('gid://shopify/ProductVariant/'),
			quantity: z.number().int().min(1).max(20)
		})
	)
	.min(1)
	.max(50);

const attributeInputSchema = z
	.array(z.object({ key: z.string().min(1).max(255), value: z.string().max(1024) }))
	.max(20);

const storefrontProductSchema = shopifyProductSnapshotSchema.extend({
	images: z.object({ nodes: z.array(imageSchema) }),
	variants: z.object({
		nodes: shopifyProductSnapshotSchema.shape.variants,
		pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
	})
});

export function shopifyProductSupportsUsMarket(product: ShopifyProductSnapshot) {
	return (
		product.variants.some((variant) => variant.availableForSale) &&
		product.variants.every((variant) => variant.price.currencyCode === 'USD')
	);
}

export function createShopifyStorefrontClient(
	fetchImpl?: FetchLike,
	configuration?: ShopifyConnectionConfig
) {
	return {
		async createCart(
			lines: ShopifyCartLine[],
			attributes: ShopifyCartAttribute[] = []
		): Promise<ShopifyCartResult> {
			const safeLines = cartInputSchema.parse(lines);
			const safeAttributes = attributeInputSchema.parse(attributes);
			const result = await graphql(
				'storefront',
				`
					mutation CartCreate($input: CartInput!) @inContext(country: US) {
						cartCreate(input: $input) {
							cart {
								id
								checkoutUrl
							}
							userErrors {
								field
								message
							}
						}
					}
				`,
				{
					input: {
						lines: safeLines,
						attributes: safeAttributes,
						buyerIdentity: { countryCode: 'US' }
					}
				},
				z.object({ cartCreate: cartPayloadSchema }),
				fetchImpl,
				configuration
			);
			return cartResult(result.cartCreate);
		},

		async addCartLines(cartId: string, lines: ShopifyCartLine[]): Promise<ShopifyCartResult> {
			if (!cartId.startsWith('gid://shopify/Cart/')) {
				throw new ProviderError('shopify', 'invalid_cart_id', 'Invalid Shopify cart ID');
			}
			const safeLines = cartInputSchema.parse(lines);
			const result = await graphql(
				'storefront',
				`
					mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) @inContext(country: US) {
						cartLinesAdd(cartId: $cartId, lines: $lines) {
							cart {
								id
								checkoutUrl
							}
							userErrors {
								field
								message
							}
						}
					}
				`,
				{ cartId, lines: safeLines },
				z.object({ cartLinesAdd: cartPayloadSchema }),
				fetchImpl,
				configuration
			);
			return cartResult(result.cartLinesAdd);
		},

		async getProductByHandle(handle: string): Promise<ShopifyProductSnapshot | null> {
			let after: string | undefined;
			let product: ShopifyProductSnapshot | null = null;
			for (let page = 0; page < 25; page += 1) {
				const result = await graphql(
					'storefront',
					`
						query Product($handle: String!, $after: String) @inContext(country: US) {
							product(handle: $handle) {
								id
								handle
								title
								description
								featuredImage {
									url
									altText
								}
								images(first: 20) {
									nodes {
										url
										altText
									}
								}
								variants(first: 100, after: $after) {
									nodes {
										id
										title
										availableForSale
										price {
											amount
											currencyCode
										}
										selectedOptions {
											name
											value
										}
										image {
											url
											altText
										}
									}
									pageInfo {
										hasNextPage
										endCursor
									}
								}
							}
						}
					`,
					{ handle, after },
					z.object({ product: storefrontProductSchema.nullable() }),
					fetchImpl,
					configuration
				);
				if (!result.product) return null;
				if (product === null) {
					product = {
						...result.product,
						images: result.product.images.nodes,
						variants: []
					};
				}
				product.variants.push(...result.product.variants.nodes);
				if (!result.product.variants.pageInfo.hasNextPage) return product;
				after = result.product.variants.pageInfo.endCursor ?? undefined;
				if (!after) break;
			}
			throw new ProviderError(
				'shopify',
				'invalid_response',
				'Shopify product variants exceeded the supported pagination boundary'
			);
		}
	};
}

const adminOrderSchema = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	displayFinancialStatus: z.string().nullable(),
	displayFulfillmentStatus: z.string(),
	currencyCode: z.string(),
	subtotalPriceSet: z.object({ shopMoney: moneySchema }).nullable(),
	currentSubtotalPriceSet: z.object({ shopMoney: moneySchema }),
	totalShippingPriceSet: z.object({ shopMoney: moneySchema }),
	currentShippingPriceSet: z.object({ shopMoney: moneySchema }),
	totalDiscountsSet: z.object({ shopMoney: moneySchema }).nullable(),
	totalTaxSet: z.object({ shopMoney: moneySchema }).nullable(),
	refunds: z.array(
		z.object({
			id: z.string(),
			createdAt: z.string(),
			totalRefundedSet: z.object({ shopMoney: moneySchema })
		})
	),
	shippingAddress: z.object({ provinceCode: z.string().nullable() }).nullable(),
	customAttributes: z.array(z.object({ key: z.string(), value: z.string().nullable() })),
	lineItems: z.object({
		nodes: z.array(
			z.object({
				id: z.string(),
				quantity: z.number().int(),
				discountedTotalSet: z.object({ shopMoney: moneySchema }),
				product: z.object({ id: z.string() }).nullable()
			})
		)
	})
});

export type ShopifyAdminOrder = z.infer<typeof adminOrderSchema>;

const balanceTransactionSchema = z.object({
	id: z.string(),
	type: z.string(),
	transactionDate: z.string(),
	fee: moneySchema,
	net: moneySchema,
	amount: moneySchema,
	associatedOrder: z.object({ id: z.string() }).nullable()
});

export type ShopifyBalanceTransaction = z.infer<typeof balanceTransactionSchema>;

const orderFields = `
	id name createdAt updatedAt displayFinancialStatus displayFulfillmentStatus currencyCode
	subtotalPriceSet { shopMoney { amount currencyCode } }
	currentSubtotalPriceSet { shopMoney { amount currencyCode } }
	totalShippingPriceSet { shopMoney { amount currencyCode } }
	currentShippingPriceSet { shopMoney { amount currencyCode } }
	totalDiscountsSet { shopMoney { amount currencyCode } }
	totalTaxSet { shopMoney { amount currencyCode } }
	refunds { id createdAt totalRefundedSet { shopMoney { amount currencyCode } } }
	shippingAddress { provinceCode }
	customAttributes { key value }
	lineItems(first: 100) { nodes { id quantity discountedTotalSet { shopMoney { amount currencyCode } } product { id } } }
`;

export function createShopifyAdminClient(fetchImpl?: FetchLike) {
	return {
		async getOrder(id: string): Promise<ShopifyAdminOrder | null> {
			const result = await graphql(
				'admin',
				`query Order($id: ID!) { order(id: $id) { ${orderFields} } }`,
				{ id },
				z.object({ order: adminOrderSchema.nullable() }),
				fetchImpl
			);
			return result.order;
		},
		async listOrdersUpdatedSince(
			updatedSince: Date,
			first = 50,
			after?: string
		): Promise<{ orders: ShopifyAdminOrder[]; next?: string }> {
			const result = await graphql(
				'admin',
				`query Orders($first: Int!, $after: String, $query: String!) {
					orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
						nodes { ${orderFields} }
						pageInfo { hasNextPage endCursor }
					}
				}`,
				{
					first: Math.max(1, Math.min(first, 100)),
					after,
					query: `updated_at:>=${updatedSince.toISOString()}`
				},
				z.object({
					orders: z.object({
						nodes: z.array(adminOrderSchema),
						pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
					})
				}),
				fetchImpl
			);
			return {
				orders: result.orders.nodes,
				next: result.orders.pageInfo.hasNextPage
					? (result.orders.pageInfo.endCursor ?? undefined)
					: undefined
			};
		},

		async listBalanceTransactionsSince(
			processedSince: Date,
			first = 50,
			after?: string
		): Promise<{ transactions: ShopifyBalanceTransaction[]; next?: string }> {
			const result = await graphql(
				'admin',
				`
					query BalanceTransactions($first: Int!, $after: String, $query: String!) {
						shopifyPaymentsAccount {
							balanceTransactions(
								first: $first
								after: $after
								query: $query
								sortKey: PROCESSED_AT
							) {
								nodes {
									id
									type
									transactionDate
									fee {
										amount
										currencyCode
									}
									net {
										amount
										currencyCode
									}
									amount {
										amount
										currencyCode
									}
									associatedOrder {
										id
									}
								}
								pageInfo {
									hasNextPage
									endCursor
								}
							}
						}
					}
				`,
				{
					first: Math.max(1, Math.min(first, 100)),
					after,
					query: `processed_at:>=${processedSince.toISOString()}`
				},
				z.object({
					shopifyPaymentsAccount: z.object({
						balanceTransactions: z.object({
							nodes: z.array(balanceTransactionSchema),
							pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
						})
					})
				}),
				fetchImpl
			);
			return {
				transactions: result.shopifyPaymentsAccount.balanceTransactions.nodes,
				next: result.shopifyPaymentsAccount.balanceTransactions.pageInfo.hasNextPage
					? (result.shopifyPaymentsAccount.balanceTransactions.pageInfo.endCursor ?? undefined)
					: undefined
			};
		}
	};
}

export const shopifyStorefront = createShopifyStorefrontClient();
export const shopifyAdmin = createShopifyAdminClient();

export function getShopifyCustomerPrivacyConfig(storefrontRootDomain: string) {
	const configured = config('storefront');
	const checkoutRootDomain = env.SHOPIFY_CHECKOUT_DOMAIN?.trim() || configured.storeDomain;
	if (!/^[a-z0-9.-]+$/i.test(checkoutRootDomain) || !/^[a-z0-9.-]+$/i.test(storefrontRootDomain)) {
		throw new ProviderError('shopify', 'invalid_configuration', 'Invalid Shopify privacy domain');
	}
	return {
		storefrontAccessToken: configured.token,
		checkoutRootDomain,
		storefrontRootDomain
	};
}

export function verifyShopifyWebhook(
	body: Uint8Array,
	providedSignature: string | null,
	secret = env.SHOPIFY_WEBHOOK_SECRET?.trim()
) {
	requireProviderConfig('shopify', { SHOPIFY_WEBHOOK_SECRET: secret });
	if (!providedSignature) return false;
	const expected = createHmac('sha256', secret!).update(body).digest();
	let provided: Buffer;
	try {
		provided = Buffer.from(providedSignature, 'base64');
	} catch {
		return false;
	}
	return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function isConfiguredShopifyDomain(value: string | null) {
	const expected = env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
	requireProviderConfig('shopify', { SHOPIFY_STORE_DOMAIN: expected });
	return Boolean(value && value.trim().toLowerCase() === expected);
}

export function hashWebhookPayload(body: Uint8Array) {
	return createHash('sha256').update(body).digest('hex');
}

export function parseShopifyWebhookReference(body: Uint8Array, topic?: string): string {
	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(body));
	} catch {
		throw new ProviderError('shopify', 'invalid_webhook', 'Shopify webhook body is invalid JSON');
	}
	const result = z
		.object({
			admin_graphql_api_id: z.string().optional(),
			id: z.union([z.string(), z.number()]).optional(),
			order_id: z.union([z.string(), z.number()]).optional()
		})
		.passthrough()
		.safeParse(payload);
	if (!result.success) {
		throw new ProviderError('shopify', 'invalid_webhook', 'Shopify webhook body has no resource');
	}
	const orderChildEvent = topic?.startsWith('refunds/') || topic?.startsWith('fulfillments/');
	const reference = orderChildEvent
		? result.data.order_id
		: (result.data.admin_graphql_api_id ?? result.data.id);
	if (reference === undefined) {
		throw new ProviderError(
			'shopify',
			'invalid_webhook',
			'Shopify webhook has no stable resource ID'
		);
	}
	return String(reference);
}
