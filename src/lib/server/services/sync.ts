import { and, desc, eq, inArray, isNull, max, or, sql } from 'drizzle-orm';
import { storefrontCatalogSnapshotSchema } from '$lib/domain/storefront-catalog';
import { db } from '$lib/server/db';
import {
	adDailyMetric,
	attributionTouch,
	campaignMapping,
	experiment,
	fulfillmentProjection,
	ledgerEntry,
	orderAttribution,
	orderLineProjection,
	orderProjection,
	printfulShipmentProjection,
	productMapping,
	providerEvent,
	storefront,
	storefrontRevision,
	syncRun
} from '$lib/server/db/schema';
import { serverConfig } from '$lib/server/config';
import { isAttributable } from '$lib/domain/attribution';
import {
	shopifyAdmin,
	shopifyProductSupportsUsMarket,
	shopifyStorefront,
	type ShopifyAdminOrder,
	type ShopifyBalanceTransaction,
	type ShopifyProductSnapshot
} from '../integrations/shopify';
import {
	normalizePrintfulTrackingUrl,
	printful,
	type PrintfulOrder,
	type PrintfulShipment
} from '../integrations/printful';
import { meta, type MetaDailyInsight } from '../integrations/meta';
import { hashAuditInput } from './audit';
import { openIntegrationIssue, resolveIntegrationIssue } from './issues';

export type SyncProvider = 'shopify' | 'printful' | 'meta';
export type SyncTrigger = 'manual' | 'nightly' | 'webhook';

export const SHOPIFY_ATTRIBUTION_ATTRIBUTES = {
	clickId: '_sd_click_id',
	experimentId: '_sd_experiment_id'
} as const;

export async function runProviderSync(provider: SyncProvider, trigger: SyncTrigger) {
	const [run] = await db
		.insert(syncRun)
		.values({ provider, trigger })
		.returning({ id: syncRun.id });
	if (!run) throw new Error('Could not start sync run');
	try {
		const result =
			provider === 'shopify'
				? await reconcileShopify()
				: provider === 'printful'
					? await reconcilePrintful()
					: await reconcileMeta();
		await db
			.update(syncRun)
			.set({
				status: 'completed',
				finishedAt: new Date(),
				recordsRead: result.recordsRead,
				recordsWritten: result.recordsWritten,
				error: null
			})
			.where(eq(syncRun.id, run.id));
		await resolveIntegrationIssue(`${provider}:sync`);
		return { id: run.id, ...result };
	} catch (error) {
		const message = safeErrorMessage(error);
		await db
			.update(syncRun)
			.set({ status: 'failed', finishedAt: new Date(), error: message })
			.where(eq(syncRun.id, run.id));
		await openIntegrationIssue({
			issueKey: `${provider}:sync`,
			provider,
			severity: 'critical',
			title: `${provider} synchronization failed`,
			detail: message
		});
		throw error;
	}
}

export async function refreshShopifyOrder(orderId: string) {
	const normalized = orderId.startsWith('gid://')
		? orderId
		: `gid://shopify/Order/${orderId.replace(/\D/g, '')}`;
	const order = await shopifyAdmin.getOrder(normalized);
	if (!order) throw new Error(`Shopify order ${orderId} was not found`);
	return projectShopifyOrder(order);
}

export async function refreshShopifyProduct(productId: string) {
	const candidates = productId.startsWith('gid://')
		? [productId]
		: [productId, `gid://shopify/Product/${productId.replace(/\D/g, '')}`];
	const mappings = await db
		.select({
			id: productMapping.id,
			shopifyProductId: productMapping.shopifyProductId,
			shopifyHandle: productMapping.shopifyHandle
		})
		.from(productMapping)
		.where(inArray(productMapping.shopifyProductId, candidates));
	let written = 0;
	for (const mapping of mappings) {
		const product = await shopifyStorefront.getProductByHandle(mapping.shopifyHandle);
		written += await projectShopifyProduct(mapping, product);
	}
	return written;
}

export async function refreshPrintfulOrder(orderId: string) {
	const order = await printful.getOrder(orderId);
	return projectPrintfulOrder(order);
}

async function reconcileShopify() {
	let after: string | undefined;
	let recordsRead = 0;
	let recordsWritten = 0;
	const updatedSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
	do {
		const page = await shopifyAdmin.listOrdersUpdatedSince(updatedSince, 50, after);
		for (const order of page.orders) {
			recordsRead += 1;
			recordsWritten += await projectShopifyOrder(order);
		}
		after = page.next;
	} while (after);

	const mappings = await db
		.select({
			id: productMapping.id,
			shopifyProductId: productMapping.shopifyProductId,
			shopifyHandle: productMapping.shopifyHandle
		})
		.from(productMapping);
	for (const mapping of mappings) {
		const product = await shopifyStorefront.getProductByHandle(mapping.shopifyHandle);
		recordsRead += 1;
		recordsWritten += await projectShopifyProduct(mapping, product);
	}
	after = undefined;
	do {
		const page = await shopifyAdmin.listBalanceTransactionsSince(updatedSince, 50, after);
		for (const transaction of page.transactions) {
			recordsRead += 1;
			recordsWritten += await projectShopifyBalanceTransaction(transaction);
		}
		after = page.next;
	} while (after);
	return { recordsRead, recordsWritten };
}

async function reconcilePrintful() {
	let offset: number | undefined = 0;
	let recordsRead = 0;
	let recordsWritten = 0;
	do {
		const page = await printful.listOrders(100, offset);
		for (const order of page.orders) {
			recordsRead += 1;
			recordsWritten += await projectPrintfulOrder(order);
		}
		offset = page.nextOffset;
	} while (offset !== undefined);
	return { recordsRead, recordsWritten };
}

async function reconcileMeta() {
	const campaigns = await db
		.select({
			campaignId: campaignMapping.campaignId,
			experimentId: campaignMapping.experimentId,
			experimentStartsAt: experiment.startsAt,
			budgetCurrency: experiment.budgetCurrency,
			lastMetricDate: max(adDailyMetric.metricDate)
		})
		.from(campaignMapping)
		.innerJoin(experiment, eq(campaignMapping.experimentId, experiment.id))
		.leftJoin(adDailyMetric, eq(adDailyMetric.campaignId, campaignMapping.campaignId))
		.groupBy(
			campaignMapping.campaignId,
			campaignMapping.experimentId,
			experiment.startsAt,
			experiment.budgetCurrency
		);
	if (!campaigns.length) return { recordsRead: 0, recordsWritten: 0 };
	const until = new Date();
	const experimentByCampaign = new Map(
		campaigns.map((campaign) => [campaign.campaignId, campaign.experimentId])
	);
	const campaignsBySince = new Map<string, typeof campaigns>();
	for (const campaign of campaigns) {
		const since = metaReconciliationSince({
			experimentStartsAt: campaign.experimentStartsAt,
			lastMetricDate: campaign.lastMetricDate,
			now: until
		});
		campaignsBySince.set(since, [...(campaignsBySince.get(since) ?? []), campaign]);
	}
	let recordsRead = 0;
	let recordsWritten = 0;
	for (const [since, horizonCampaigns] of campaignsBySince) {
		for (let index = 0; index < horizonCampaigns.length; index += 200) {
			const campaignIds = horizonCampaigns
				.slice(index, index + 200)
				.map((campaign) => campaign.campaignId);
			const insights = await meta.listDailyInsights({
				since,
				until: dateOnly(until),
				campaignIds
			});
			recordsRead += insights.length;
			for (const insight of insights) {
				const experimentId = experimentByCampaign.get(insight.campaign_id);
				if (!experimentId) continue;
				await projectMetaInsight(insight, experimentId);
				recordsWritten += 1;
			}
		}
	}
	await Promise.all(campaigns.map(reconcileMetaCurrencyIssue));
	return { recordsRead, recordsWritten };
}

async function projectShopifyOrder(order: ShopifyAdminOrder) {
	const amounts = deriveShopifyOrderAmounts(order);
	const merchandise = amounts.merchandiseRevenueMinor;
	const shipping = amounts.shippingRevenueMinor;
	const discounts = amounts.discountMinor;
	const tax = order.totalTaxSet ? decimalToMinor(order.totalTaxSet.shopMoney.amount) : 0;
	const refunds = amounts.refundMinor;
	const currency = order.currencyCode;
	const orderedAt = new Date(order.createdAt);
	await Promise.all([
		amounts.usedSubtotalFallback
			? openIntegrationIssue({
					issueKey: `shopify:subtotal-unavailable:${order.id}`,
					provider: 'shopify',
					severity: 'warning',
					title: 'Shopify original subtotal is unavailable',
					detail: 'Merchandise revenue was derived from discounted line totals.',
					entityType: 'shopify_order',
					entityId: order.id
				})
			: resolveIntegrationIssue(`shopify:subtotal-unavailable:${order.id}`),
		order.totalDiscountsSet === null
			? openIntegrationIssue({
					issueKey: `shopify:discount-unavailable:${order.id}`,
					provider: 'shopify',
					severity: 'info',
					title: 'Shopify discount total is unavailable',
					detail: 'The informational discount projection uses zero until Shopify supplies a value.',
					entityType: 'shopify_order',
					entityId: order.id
				})
			: resolveIntegrationIssue(`shopify:discount-unavailable:${order.id}`),
		order.totalTaxSet === null
			? openIntegrationIssue({
					issueKey: `shopify:tax-unavailable:${order.id}`,
					provider: 'shopify',
					severity: 'warning',
					title: 'Shopify tax total is unavailable',
					detail: 'Tax reconciliation uses zero until Shopify supplies a value.',
					entityType: 'shopify_order',
					entityId: order.id
				})
			: resolveIntegrationIssue(`shopify:tax-unavailable:${order.id}`)
	]);
	const [projection] = await db
		.insert(orderProjection)
		.values({
			shopifyOrderId: order.id,
			orderNumber: order.name,
			regionCode: order.shippingAddress?.provinceCode ?? null,
			currency,
			merchandiseRevenueMinor: merchandise,
			shippingRevenueMinor: shipping,
			discountMinor: discounts,
			taxCollectedMinor: tax,
			refundMinor: refunds,
			financialStatus: order.displayFinancialStatus ?? 'UNKNOWN',
			fulfillmentStatus: order.displayFulfillmentStatus,
			orderedAt
		})
		.onConflictDoUpdate({
			target: orderProjection.shopifyOrderId,
			set: {
				orderNumber: order.name,
				regionCode: order.shippingAddress?.provinceCode ?? null,
				currency,
				merchandiseRevenueMinor: merchandise,
				shippingRevenueMinor: shipping,
				discountMinor: discounts,
				taxCollectedMinor: tax,
				refundMinor: refunds,
				financialStatus: order.displayFinancialStatus ?? 'UNKNOWN',
				fulfillmentStatus: order.displayFulfillmentStatus,
				orderedAt,
				updatedAt: new Date()
			}
		})
		.returning({ id: orderProjection.id });
	if (!projection) throw new Error('Could not project Shopify order');

	const attributes = new Map(
		order.customAttributes.map((attribute) => [attribute.key, attribute.value])
	);
	const clickId = attributes.get(SHOPIFY_ATTRIBUTION_ATTRIBUTES.clickId);
	let experimentId: string | null = null;
	let attributedStorefrontSlug: string | null = null;
	let attributedTouchId: string | null = null;
	let heroProductMappingId: string | null = null;
	let boundCatalog: unknown = null;
	if (clickId) {
		const [touch] = await db
			.select({
				id: attributionTouch.id,
				experimentId: attributionTouch.experimentId,
				campaignId: attributionTouch.campaignId,
				clickedAt: attributionTouch.clickedAt
			})
			.from(attributionTouch)
			.where(
				and(
					eq(attributionTouch.clickId, clickId),
					isNull(attributionTouch.marketingConsentRevokedAt)
				)
			)
			.limit(1);
		if (touch && isAttributable(touch, orderedAt)) {
			experimentId = touch.experimentId;
			attributedTouchId = touch.id;
			const [experimentRow] = await db
				.select({
					heroProductMappingId: experiment.heroProductMappingId,
					storefrontSlug: storefront.slug,
					catalogSnapshot: storefrontRevision.catalogSnapshot
				})
				.from(experiment)
				.innerJoin(storefront, eq(experiment.storefrontId, storefront.id))
				.innerJoin(
					storefrontRevision,
					and(
						eq(experiment.storefrontRevisionId, storefrontRevision.id),
						eq(storefrontRevision.storefrontId, storefront.id)
					)
				)
				.where(eq(experiment.id, touch.experimentId))
				.limit(1);
			attributedStorefrontSlug = experimentRow?.storefrontSlug ?? null;
			heroProductMappingId = experimentRow?.heroProductMappingId ?? null;
			boundCatalog = experimentRow?.catalogSnapshot ?? null;
		}
	}

	const productIds = order.lineItems.nodes.flatMap((line) =>
		line.product ? [line.product.id] : []
	);
	const parsedCatalog = storefrontCatalogSnapshotSchema.safeParse(boundCatalog);
	const historicalMappings = parsedCatalog.success
		? parsedCatalog.data.designs.flatMap((design) =>
				design.products.map((product) => ({
					id: product.mappingId,
					shopifyProductId: product.shopifyProductId
				}))
			)
		: null;
	const mappings = historicalMappings
		? historicalMappings.filter((mapping) => productIds.includes(mapping.shopifyProductId))
		: productIds.length
			? await db
					.select({ id: productMapping.id, shopifyProductId: productMapping.shopifyProductId })
					.from(productMapping)
					.where(inArray(productMapping.shopifyProductId, productIds))
			: [];
	const mappingByProduct = new Map(
		mappings.map((mapping) => [mapping.shopifyProductId, mapping.id])
	);
	await db.transaction(async (tx) => {
		await tx.delete(orderLineProjection).where(eq(orderLineProjection.orderId, projection.id));
		if (order.lineItems.nodes.length) {
			await tx.insert(orderLineProjection).values(
				order.lineItems.nodes.map((line) => ({
					orderId: projection.id,
					shopifyLineItemId: line.id,
					productMappingId: line.product ? (mappingByProduct.get(line.product.id) ?? null) : null,
					quantity: line.quantity,
					revenueMinor: decimalToMinor(line.discountedTotalSet.shopMoney.amount)
				}))
			);
		}
		if (experimentId && attributedTouchId) {
			const hero = Boolean(
				heroProductMappingId && [...mappingByProduct.values()].includes(heroProductMappingId)
			);
			await tx
				.insert(orderAttribution)
				.values({
					orderId: projection.id,
					touchId: attributedTouchId,
					experimentId,
					isHeroOrder: hero
				})
				.onConflictDoUpdate({
					target: orderAttribution.orderId,
					set: { touchId: attributedTouchId, experimentId, isHeroOrder: hero }
				});
		} else {
			await tx.delete(orderAttribution).where(eq(orderAttribution.orderId, projection.id));
		}
	});

	await Promise.all([
		appendLedgerValue({
			experimentId,
			orderId: projection.id,
			kind: 'merchandise-revenue',
			source: 'shopify',
			sourceReference: order.id,
			amountMinor: merchandise,
			currency,
			occurredAt: orderedAt
		}),
		appendLedgerValue({
			experimentId,
			orderId: projection.id,
			kind: 'shipping-revenue',
			source: 'shopify',
			sourceReference: order.id,
			amountMinor: shipping,
			currency,
			occurredAt: orderedAt
		}),
		appendLedgerValue({
			experimentId,
			orderId: projection.id,
			kind: 'refund',
			source: 'shopify',
			sourceReference: order.id,
			amountMinor: -refunds,
			currency,
			occurredAt: orderedAt
		})
	]);
	if (experimentId && attributedStorefrontSlug && attributedTouchId) {
		await sendMetaPurchaseOnce({
			orderId: order.id,
			orderedAt,
			storefrontSlug: attributedStorefrontSlug,
			currency,
			valueMinor: Math.max(0, merchandise + shipping),
			touchId: attributedTouchId,
			contentIds: order.lineItems.nodes.flatMap((line) => (line.product ? [line.product.id] : []))
		});
	}
	return 1 + order.lineItems.nodes.length;
}

async function projectPrintfulOrder(order: PrintfulOrder) {
	const externalId = order.external_id?.replace(/^@/, '');
	if (!externalId) {
		await openIntegrationIssue({
			issueKey: `printful:order-unmapped:${order.id}`,
			provider: 'printful',
			severity: 'warning',
			title: 'Printful order is not mapped',
			detail: 'The Printful order does not contain a Shopify order reference.',
			entityType: 'printful_order',
			entityId: String(order.id)
		});
		return 0;
	}
	const withoutHash = externalId.replace(/^#/, '');
	const numericId = /^\d+$/.test(withoutHash) ? withoutHash : undefined;
	const [localOrder] = await db
		.select({ id: orderProjection.id })
		.from(orderProjection)
		.where(
			or(
				eq(orderProjection.orderNumber, externalId),
				eq(orderProjection.orderNumber, `#${withoutHash}`),
				eq(orderProjection.shopifyOrderId, externalId),
				...(numericId ? [sql`${orderProjection.shopifyOrderId} like ${`%/${numericId}`}`] : [])
			)
		)
		.limit(1);
	if (!localOrder) {
		await openIntegrationIssue({
			issueKey: `printful:order-unmapped:${order.id}`,
			provider: 'printful',
			severity: 'warning',
			title: 'Printful order is not mapped',
			detail: 'No no-PII Shopify order projection matches the Printful order reference.',
			entityType: 'printful_order',
			entityId: String(order.id)
		});
		return 0;
	}
	await resolveIntegrationIssue(`printful:order-unmapped:${order.id}`);
	const costs = derivePrintfulCosts(order.costs);
	await reconcilePrintfulCostIssues(order, costs);
	const [fulfillment] = await db
		.insert(fulfillmentProjection)
		.values({
			orderId: localOrder.id,
			printfulOrderId: String(order.id),
			status: order.status,
			currency: costs.currency,
			productCostMinor: costs.productCostMinor,
			shippingCostMinor: costs.shippingCostMinor,
			taxMinor: costs.taxMinor,
			providerAdjustmentMinor: costs.providerAdjustmentMinor,
			totalCostMinor: costs.totalCostMinor
		})
		.onConflictDoUpdate({
			target: fulfillmentProjection.printfulOrderId,
			set: {
				status: order.status,
				currency: costs.currency,
				productCostMinor: costs.productCostMinor,
				shippingCostMinor: costs.shippingCostMinor,
				taxMinor: costs.taxMinor,
				providerAdjustmentMinor: costs.providerAdjustmentMinor,
				totalCostMinor: costs.totalCostMinor,
				updatedAt: new Date()
			}
		})
		.returning({ id: fulfillmentProjection.id });
	if (!fulfillment) throw new Error('Could not project Printful fulfillment');
	if (costs.currency) {
		const [attribution] = await db
			.select({ experimentId: orderAttribution.experimentId })
			.from(orderAttribution)
			.where(eq(orderAttribution.orderId, localOrder.id))
			.limit(1);
		const occurredAt = new Date(order.updated_at ?? order.created_at ?? Date.now());
		const totalIsAvailable = costs.totalCostMinor !== null;
		const knownCosts = [
			{
				kind: 'printful-product-cost',
				amountMinor: costs.productCostMinor ?? (totalIsAvailable ? 0 : null),
				sourceReference: String(order.id)
			},
			{
				kind: 'printful-shipping-cost',
				amountMinor: costs.shippingCostMinor ?? (totalIsAvailable ? 0 : null),
				sourceReference: String(order.id)
			},
			{
				kind: 'printful-tax',
				amountMinor: costs.taxMinor ?? (totalIsAvailable ? 0 : null),
				sourceReference: String(order.id)
			},
			{
				kind: 'provider-adjustment',
				amountMinor: costs.providerAdjustmentMinor,
				sourceReference: `${order.id}:printful-cost-adjustment`
			}
		].filter(
			(cost): cost is { kind: string; amountMinor: number; sourceReference: string } =>
				cost.amountMinor !== null
		);
		await Promise.all(
			knownCosts.map((cost) =>
				appendLedgerValue({
					experimentId: attribution?.experimentId ?? null,
					orderId: localOrder.id,
					kind: cost.kind,
					source: 'printful',
					sourceReference: cost.sourceReference,
					amountMinor: -cost.amountMinor,
					currency: costs.currency!,
					occurredAt
				})
			)
		);
	}
	const shipments = await printful.listShipments(String(order.id));
	await projectPrintfulShipments(fulfillment.id, shipments);
	return 1 + shipments.length;
}

export function derivePrintfulCosts(costs: PrintfulOrder['costs']) {
	const candidateCurrency = costs?.currency?.trim().toUpperCase();
	const productCostMinor = optionalMinor(costs?.subtotal);
	const shippingCostMinor = optionalMinor(costs?.shipping);
	const tax = optionalMinor(costs?.tax);
	const vat = optionalMinor(costs?.vat);
	const taxMinor = tax === null && vat === null ? null : (tax ?? 0) + (vat ?? 0);
	const discount = optionalMinor(costs?.discount);
	const digitization = optionalMinor(costs?.digitization);
	const additionalFee = optionalMinor(costs?.additional_fee);
	const fulfillmentFee = optionalMinor(costs?.fulfillment_fee);
	const retailDeliveryFee = optionalMinor(costs?.retail_delivery_fee);
	const hasKnownAdjustment =
		discount !== null ||
		digitization !== null ||
		additionalFee !== null ||
		fulfillmentFee !== null ||
		retailDeliveryFee !== null;
	const knownAdjustmentMinor = hasKnownAdjustment
		? (digitization ?? 0) +
			(additionalFee ?? 0) +
			(fulfillmentFee ?? 0) +
			(retailDeliveryFee ?? 0) -
			(discount ?? 0)
		: null;
	const totalCostMinor = optionalMinor(costs?.total);
	const knownComponentTotal = (productCostMinor ?? 0) + (shippingCostMinor ?? 0) + (taxMinor ?? 0);
	return {
		currency: candidateCurrency && /^[A-Z]{3}$/.test(candidateCurrency) ? candidateCurrency : null,
		productCostMinor,
		shippingCostMinor,
		taxComponentMinor: tax,
		vatComponentMinor: vat,
		taxMinor,
		providerAdjustmentMinor:
			totalCostMinor === null ? knownAdjustmentMinor : totalCostMinor - knownComponentTotal,
		totalCostMinor
	};
}

async function reconcilePrintfulCostIssues(
	order: Pick<PrintfulOrder, 'id'>,
	costs: ReturnType<typeof derivePrintfulCosts>
) {
	const orderId = String(order.id);
	await Promise.all([
		costs.currency
			? resolveIntegrationIssue(`printful:cost-currency-missing:${orderId}`)
			: openIntegrationIssue({
					issueKey: `printful:cost-currency-missing:${orderId}`,
					provider: 'printful',
					severity: 'critical',
					title: 'Printful cost currency is unavailable',
					detail:
						'Known Printful cost components cannot enter the ledger until a valid currency is supplied.',
					entityType: 'printful_order',
					entityId: orderId
				}),
		...(
			[
				['product', costs.productCostMinor, 'product cost', 'warning'],
				['shipping', costs.shippingCostMinor, 'shipping cost', 'warning'],
				['tax', costs.taxComponentMinor, 'tax', 'warning'],
				['vat', costs.vatComponentMinor, 'VAT', 'warning'],
				['total', costs.totalCostMinor, 'total cost', 'critical']
			] as const
		).map(([component, amount, label, severity]) =>
			amount !== null
				? resolveIntegrationIssue(`printful:cost-${component}-missing:${orderId}`)
				: openIntegrationIssue({
						issueKey: `printful:cost-${component}-missing:${orderId}`,
						provider: 'printful',
						severity,
						title: `Printful ${label} is unavailable`,
						detail:
							component === 'total'
								? 'Exact Printful cost reconciliation remains unavailable while known components are projected.'
								: `The ${label} ledger component remains pending while other known costs are projected.`,
						entityType: 'printful_order',
						entityId: orderId
					})
		)
	]);
}

async function projectPrintfulShipments(fulfillmentId: string, shipments: PrintfulShipment[]) {
	for (const shipment of shipments) {
		const shipmentId = String(shipment.id);
		const suppliedTrackingUrl = shipment.tracking_url?.trim() || null;
		const trackingUrl = normalizePrintfulTrackingUrl(suppliedTrackingUrl);
		if (suppliedTrackingUrl && !trackingUrl) {
			await openIntegrationIssue({
				issueKey: `printful:shipment-tracking-url-invalid:${shipmentId}`,
				provider: 'printful',
				severity: 'warning',
				title: 'Printful shipment tracking URL is unsafe',
				detail: 'The tracking link was omitted because it is not a valid HTTPS URL.',
				entityType: 'printful_shipment',
				entityId: shipmentId
			});
		} else {
			await resolveIntegrationIssue(`printful:shipment-tracking-url-invalid:${shipmentId}`);
		}
		await db
			.insert(printfulShipmentProjection)
			.values({
				fulfillmentId,
				printfulShipmentId: shipmentId,
				status: shipment.shipment_status ?? shipment.status ?? 'unknown',
				deliveryStatus: shipment.delivery_status ?? null,
				carrier: shipment.carrier ?? null,
				trackingNumber:
					shipment.tracking_number === null || shipment.tracking_number === undefined
						? null
						: String(shipment.tracking_number),
				trackingUrl,
				providerCreatedAt: printfulTimestamp(shipment.created_at ?? shipment.created),
				shippedAt: printfulTimestamp(shipment.shipped_at),
				deliveredAt: printfulTimestamp(shipment.delivered_at)
			})
			.onConflictDoUpdate({
				target: printfulShipmentProjection.printfulShipmentId,
				set: {
					fulfillmentId,
					status: shipment.shipment_status ?? shipment.status ?? 'unknown',
					deliveryStatus: shipment.delivery_status ?? null,
					carrier: shipment.carrier ?? null,
					trackingNumber:
						shipment.tracking_number === null || shipment.tracking_number === undefined
							? null
							: String(shipment.tracking_number),
					trackingUrl,
					providerCreatedAt: printfulTimestamp(shipment.created_at ?? shipment.created),
					shippedAt: printfulTimestamp(shipment.shipped_at),
					deliveredAt: printfulTimestamp(shipment.delivered_at),
					updatedAt: new Date()
				}
			});
	}
}

function printfulTimestamp(value: string | number | null | undefined) {
	if (value === null || value === undefined) return null;
	const date =
		typeof value === 'number'
			? new Date(value < 1_000_000_000_000 ? value * 1_000 : value)
			: new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

async function projectShopifyBalanceTransaction(transaction: ShopifyBalanceTransaction) {
	if (!transaction.associatedOrder) return 0;
	const effect = deriveShopifyPaymentLedgerEffect(transaction);
	if (effect.amountMinor === 0) return 0;
	const [order] = await db
		.select({ id: orderProjection.id })
		.from(orderProjection)
		.where(eq(orderProjection.shopifyOrderId, transaction.associatedOrder.id))
		.limit(1);
	if (!order) {
		await openIntegrationIssue({
			issueKey: `shopify:fee-unmapped:${transaction.id}`,
			provider: 'shopify',
			severity: 'warning',
			title: 'Shopify payment fee is not mapped',
			detail: 'The payment balance transaction references an order that is not projected yet.',
			entityType: 'shopify_balance_transaction',
			entityId: transaction.id
		});
		return 0;
	}
	const [attribution] = await db
		.select({ experimentId: orderAttribution.experimentId })
		.from(orderAttribution)
		.where(eq(orderAttribution.orderId, order.id))
		.limit(1);
	await appendLedgerValue({
		experimentId: attribution?.experimentId ?? null,
		orderId: order.id,
		kind: effect.kind,
		source: 'shopify-payments',
		sourceReference: transaction.id,
		amountMinor: effect.amountMinor,
		currency: effect.currency,
		occurredAt: new Date(transaction.transactionDate)
	});
	await resolveIntegrationIssue(`shopify:fee-unmapped:${transaction.id}`);
	return 1;
}

async function projectMetaInsight(insight: MetaDailyInsight, experimentId: string) {
	const purchases = actionValue(insight.actions, 'offsite_conversion.fb_pixel_purchase');
	const purchaseValue = actionValue(insight.action_values, 'offsite_conversion.fb_pixel_purchase');
	const spendMinor = decimalToMinor(insight.spend);
	await db
		.insert(adDailyMetric)
		.values({
			experimentId,
			campaignId: insight.campaign_id,
			metricDate: insight.date_start,
			currency: insight.account_currency,
			spendMinor,
			impressions: Number.parseInt(insight.impressions, 10),
			clicks: Number.parseInt(insight.clicks, 10),
			metaPurchases: purchases,
			metaPurchaseValueMinor: decimalToMinor(String(purchaseValue))
		})
		.onConflictDoUpdate({
			target: [adDailyMetric.campaignId, adDailyMetric.metricDate],
			set: {
				currency: insight.account_currency,
				spendMinor,
				impressions: Number.parseInt(insight.impressions, 10),
				clicks: Number.parseInt(insight.clicks, 10),
				metaPurchases: purchases,
				metaPurchaseValueMinor: decimalToMinor(String(purchaseValue)),
				updatedAt: new Date()
			}
		});
	await appendLedgerValue({
		experimentId,
		orderId: null,
		kind: 'meta-spend',
		source: 'meta',
		sourceReference: `${insight.campaign_id}:${insight.date_start}`,
		amountMinor: -spendMinor,
		currency: insight.account_currency,
		occurredAt: new Date(`${insight.date_start}T12:00:00Z`)
	});
}

export function metaReconciliationSince(input: {
	experimentStartsAt: Date;
	lastMetricDate: string | null;
	now: Date;
}) {
	const start = new Date(`${dateOnly(input.experimentStartsAt)}T00:00:00Z`);
	const lastMetric = input.lastMetricDate ? parseDateOnly(input.lastMetricDate) : null;
	const candidate = lastMetric ? new Date(lastMetric.getTime() - 7 * 24 * 60 * 60 * 1_000) : start;
	const horizon = Math.max(start.getTime(), candidate.getTime());
	return dateOnly(new Date(Math.min(horizon, input.now.getTime())));
}

async function reconcileMetaCurrencyIssue(campaign: {
	campaignId: string;
	budgetCurrency: string;
}) {
	const currencies = await db
		.selectDistinct({ currency: adDailyMetric.currency })
		.from(adDailyMetric)
		.where(eq(adDailyMetric.campaignId, campaign.campaignId));
	if (!currencies.length) return;
	const expected = campaign.budgetCurrency.trim().toUpperCase();
	const unexpected = currencies
		.map((row) => row.currency.trim().toUpperCase())
		.filter((currency) => currency !== expected);
	const issueKey = `meta:currency-mismatch:${campaign.campaignId}`;
	if (!unexpected.length) {
		await resolveIntegrationIssue(issueKey);
		return;
	}
	await openIntegrationIssue({
		issueKey,
		provider: 'meta',
		severity: 'critical',
		title: 'Meta Insights currency does not match the experiment budget',
		detail: `Expected ${expected}; observed ${[...new Set(unexpected)].join(', ')}. Budget utilization is unavailable until the currencies match.`,
		entityType: 'meta_campaign',
		entityId: campaign.campaignId
	});
}

async function projectShopifyProduct(
	mapping: { id: string; shopifyProductId: string; shopifyHandle: string },
	product: ShopifyProductSnapshot | null
) {
	const { id } = mapping;
	if (!product) {
		await db
			.update(productMapping)
			.set({ providerAvailable: false })
			.where(eq(productMapping.id, id));
		await openIntegrationIssue({
			issueKey: `shopify:product-unavailable:${id}`,
			provider: 'shopify',
			severity: 'critical',
			title: 'Mapped Shopify product is unavailable',
			detail: 'The mapped product handle no longer resolves through the Storefront API.',
			entityType: 'product_mapping',
			entityId: id
		});
		return 1;
	}
	await resolveIntegrationIssue(`shopify:product-unavailable:${id}`);
	if (product.id !== mapping.shopifyProductId) {
		await db
			.update(productMapping)
			.set({ providerAvailable: false })
			.where(eq(productMapping.id, id));
		await openIntegrationIssue({
			issueKey: `shopify:product-identity:${id}`,
			provider: 'shopify',
			severity: 'critical',
			title: 'Mapped Shopify product identity changed',
			detail:
				'The product returned by the stored handle no longer matches the immutable Shopify product ID.',
			entityType: 'product_mapping',
			entityId: id
		});
		return 1;
	}
	await resolveIntegrationIssue(`shopify:product-identity:${id}`);
	if (!shopifyProductSupportsUsMarket(product)) {
		await db
			.update(productMapping)
			.set({ providerAvailable: false })
			.where(eq(productMapping.id, id));
		await openIntegrationIssue({
			issueKey: `shopify:product-market:${id}`,
			provider: 'shopify',
			severity: 'critical',
			title: 'Mapped Shopify product is not US-market ready',
			detail: 'The product needs an available variant and every returned variant must use USD.',
			entityType: 'product_mapping',
			entityId: id
		});
		return 1;
	}
	await writeProductSnapshot(id, product);
	await resolveIntegrationIssue(`shopify:product-market:${id}`);
	return 1;
}

async function writeProductSnapshot(id: string, product: ShopifyProductSnapshot) {
	await db
		.update(productMapping)
		.set({
			shopifyHandle: product.handle,
			productSnapshot: product,
			providerAvailable: true
		})
		.where(eq(productMapping.id, id));
}

async function appendLedgerValue(input: {
	experimentId: string | null;
	orderId: string | null;
	kind: string;
	source: string;
	sourceReference: string;
	amountMinor: number;
	currency: string;
	occurredAt: Date;
}) {
	const [latest] = await db
		.select({
			id: ledgerEntry.id,
			revision: ledgerEntry.revision,
			amountMinor: ledgerEntry.amountMinor,
			currency: ledgerEntry.currency,
			experimentId: ledgerEntry.experimentId
		})
		.from(ledgerEntry)
		.where(
			and(
				eq(ledgerEntry.source, input.source),
				eq(ledgerEntry.sourceReference, input.sourceReference),
				eq(ledgerEntry.kind, input.kind)
			)
		)
		.orderBy(desc(ledgerEntry.revision))
		.limit(1);
	if (!shouldAppendLedgerValue(input, latest)) return;
	const isZeroCorrection = input.amountMinor === 0;
	await db.insert(ledgerEntry).values({
		...input,
		revision: (latest?.revision ?? 0) + 1,
		supersedesEntryId: latest?.id,
		fxStatus: input.currency === 'EUR' || isZeroCorrection ? 'actual' : 'estimated',
		reportingAmountMinor: input.currency === 'EUR' || isZeroCorrection ? input.amountMinor : null,
		fxRate: input.currency === 'EUR' ? 1 : null
	});
}

export function shouldAppendLedgerValue(
	input: { amountMinor: number; currency: string; experimentId: string | null },
	latest?: { amountMinor: number; currency: string; experimentId: string | null }
) {
	if (!latest) return input.amountMinor !== 0;
	return !(
		latest.amountMinor === input.amountMinor &&
		latest.currency === input.currency &&
		latest.experimentId === input.experimentId
	);
}

async function sendMetaPurchaseOnce(input: {
	orderId: string;
	orderedAt: Date;
	storefrontSlug: string;
	currency: string;
	valueMinor: number;
	touchId: string;
	contentIds: string[];
}) {
	const [touch] = await db
		.select({
			clickId: attributionTouch.clickId,
			fbp: attributionTouch.fbp,
			fbc: attributionTouch.fbc
		})
		.from(attributionTouch)
		.where(
			and(
				eq(attributionTouch.id, input.touchId),
				isNull(attributionTouch.marketingConsentRevokedAt)
			)
		)
		.limit(1);
	if (!touch) return;
	const eventId = `shopify-purchase:${input.orderId}`;
	const externalKey = `capi:${eventId}`;
	const [inserted] = await db
		.insert(providerEvent)
		.values({
			provider: 'meta',
			externalKey,
			topic: 'capi/Purchase',
			payloadHash: hashAuditInput({
				eventId,
				currency: input.currency,
				valueMinor: input.valueMinor,
				contentIds: input.contentIds
			})
		})
		.onConflictDoNothing()
		.returning({ id: providerEvent.id });
	const [existing] = inserted
		? [{ id: inserted.id, status: 'pending' }]
		: await db
				.select({ id: providerEvent.id, status: providerEvent.status })
				.from(providerEvent)
				.where(and(eq(providerEvent.provider, 'meta'), eq(providerEvent.externalKey, externalKey)))
				.limit(1);
	if (!existing || existing.status === 'completed') return;
	const base = new URL(serverConfig.appOrigin);
	const eventSourceUrl = `${base.protocol}//${input.storefrontSlug}.${serverConfig.rootHost}/`;
	try {
		await meta.sendEvent(
			{
				eventName: 'Purchase',
				eventId,
				eventTime: Math.floor(input.orderedAt.getTime() / 1000),
				eventSourceUrl,
				fbp: touch.fbp ?? undefined,
				fbc: touch.fbc ?? undefined,
				externalId: touch.clickId,
				currency: input.currency,
				value: input.valueMinor / 100,
				contentIds: input.contentIds
			},
			true
		);
		await db
			.update(providerEvent)
			.set({ status: 'completed', processedAt: new Date(), error: null })
			.where(eq(providerEvent.id, existing.id));
		await resolveIntegrationIssue(`meta:capi:${input.orderId}`);
	} catch (error) {
		const message = safeErrorMessage(error);
		await db
			.update(providerEvent)
			.set({ status: 'failed', processedAt: new Date(), error: message })
			.where(eq(providerEvent.id, existing.id));
		await openIntegrationIssue({
			issueKey: `meta:capi:${input.orderId}`,
			provider: 'meta',
			severity: 'warning',
			title: 'Meta Purchase event was not sent',
			detail: message,
			entityType: 'shopify_order',
			entityId: input.orderId
		});
	}
}

function optionalMinor(value: string | null | undefined) {
	return value === null || value === undefined ? null : decimalToMinor(value);
}

export function decimalToMinor(value: string): number {
	const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
	if (!match) throw new Error('Invalid provider money amount');
	const sign = match[1] === '-' ? -1n : 1n;
	const units = BigInt(match[2]);
	const fraction = (match[3] ?? '').padEnd(3, '0');
	let cents = BigInt(fraction.slice(0, 2) || '0');
	if (Number(fraction[2] ?? '0') >= 5) cents += 1n;
	const result = sign * (units * 100n + cents);
	if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
		throw new Error('Provider money amount exceeds safe integer range');
	}
	return Number(result);
}

export function deriveShopifyOrderAmounts(
	order: Pick<
		ShopifyAdminOrder,
		| 'subtotalPriceSet'
		| 'currentSubtotalPriceSet'
		| 'totalShippingPriceSet'
		| 'currentShippingPriceSet'
		| 'totalDiscountsSet'
		| 'lineItems'
	>
) {
	const usedSubtotalFallback = order.subtotalPriceSet === null;
	const merchandiseRevenueMinor = order.subtotalPriceSet
		? decimalToMinor(order.subtotalPriceSet.shopMoney.amount)
		: order.lineItems.nodes.reduce(
				(total, line) => total + decimalToMinor(line.discountedTotalSet.shopMoney.amount),
				0
			);
	const shippingRevenueMinor = decimalToMinor(order.totalShippingPriceSet.shopMoney.amount);
	const currentMerchandiseMinor = decimalToMinor(order.currentSubtotalPriceSet.shopMoney.amount);
	const currentShippingMinor = decimalToMinor(order.currentShippingPriceSet.shopMoney.amount);
	return {
		merchandiseRevenueMinor,
		shippingRevenueMinor,
		discountMinor: order.totalDiscountsSet
			? decimalToMinor(order.totalDiscountsSet.shopMoney.amount)
			: 0,
		usedSubtotalFallback,
		refundMinor: Math.max(
			0,
			merchandiseRevenueMinor +
				shippingRevenueMinor -
				currentMerchandiseMinor -
				currentShippingMinor
		)
	};
}

export function deriveShopifyPaymentLedgerEffect(
	transaction: Pick<ShopifyBalanceTransaction, 'amount' | 'net'>
) {
	if (transaction.amount.currencyCode !== transaction.net.currencyCode) {
		throw new Error('Shopify balance transaction currencies do not match');
	}
	const amountMinor =
		decimalToMinor(transaction.net.amount) - decimalToMinor(transaction.amount.amount);
	return {
		amountMinor,
		currency: transaction.net.currencyCode,
		kind: amountMinor > 0 ? 'provider-adjustment' : 'shopify-payment-fee'
	} as const;
}

function actionValue(
	values: Array<{ action_type: string; value: string }> | undefined,
	type: string
) {
	const value = values?.find((item) => item.action_type === type)?.value;
	return value ? Number.parseFloat(value) : 0;
}

function dateOnly(date: Date) {
	return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && dateOnly(date) === value ? date : null;
}

export function safeErrorMessage(error: unknown) {
	return (error instanceof Error ? error.message : 'Unknown provider error').slice(0, 500);
}
