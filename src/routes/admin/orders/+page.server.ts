import { db } from '$lib/server/db';
import {
	fulfillmentProjection,
	orderProjection,
	printfulShipmentProjection
} from '$lib/server/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export function _orderNetRevenueMinor(order: {
	merchandiseRevenueMinor: number;
	shippingRevenueMinor: number;
	refundMinor: number;
}) {
	return order.merchandiseRevenueMinor + order.shippingRevenueMinor - order.refundMinor;
}

export const load: PageServerLoad = async () => {
	const [orders, fulfillments, shipments] = await Promise.all([
		db.select().from(orderProjection).orderBy(desc(orderProjection.orderedAt)).limit(100),
		db
			.select()
			.from(fulfillmentProjection)
			.innerJoin(orderProjection, eq(fulfillmentProjection.orderId, orderProjection.id))
			.orderBy(desc(fulfillmentProjection.updatedAt))
			.limit(200),
		db
			.select({
				orderId: fulfillmentProjection.orderId,
				id: printfulShipmentProjection.id,
				status: printfulShipmentProjection.status,
				deliveryStatus: printfulShipmentProjection.deliveryStatus,
				carrier: printfulShipmentProjection.carrier,
				trackingNumber: printfulShipmentProjection.trackingNumber,
				trackingUrl: printfulShipmentProjection.trackingUrl,
				providerCreatedAt: printfulShipmentProjection.providerCreatedAt,
				shippedAt: printfulShipmentProjection.shippedAt,
				deliveredAt: printfulShipmentProjection.deliveredAt,
				updatedAt: printfulShipmentProjection.updatedAt
			})
			.from(printfulShipmentProjection)
			.innerJoin(
				fulfillmentProjection,
				eq(printfulShipmentProjection.fulfillmentId, fulfillmentProjection.id)
			)
			.orderBy(
				desc(
					sql`coalesce(${printfulShipmentProjection.shippedAt}, ${printfulShipmentProjection.providerCreatedAt}, ${printfulShipmentProjection.updatedAt})`
				),
				desc(printfulShipmentProjection.id)
			)
			.limit(500)
	]);
	const latestFulfillment = new Map<
		string,
		(typeof fulfillments)[number]['fulfillment_projection']
	>();
	for (const row of fulfillments) {
		if (!latestFulfillment.has(row.order_projection.id)) {
			latestFulfillment.set(row.order_projection.id, row.fulfillment_projection);
		}
	}
	const latestShipment = new Map<string, (typeof shipments)[number]>();
	for (const shipment of shipments) {
		if (!latestShipment.has(shipment.orderId)) latestShipment.set(shipment.orderId, shipment);
	}
	return {
		orders: orders.map((order) => ({
			...order,
			fulfillment: latestFulfillment.get(order.id) ?? null,
			shipment: latestShipment.get(order.id) ?? null,
			netRevenueMinor: _orderNetRevenueMinor(order)
		}))
	};
};
