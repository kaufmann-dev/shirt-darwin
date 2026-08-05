import { env } from '$env/dynamic/private';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { fetchProviderJson, ProviderError, requireProviderConfig, type FetchLike } from './errors';

const printfulCostSchema = z.object({
	calculation_status: z.string().optional(),
	currency: z.string().nullable().optional(),
	subtotal: z.string().nullable().optional(),
	discount: z.string().nullable().optional(),
	shipping: z.string().nullable().optional(),
	digitization: z.string().nullable().optional(),
	additional_fee: z.string().nullable().optional(),
	fulfillment_fee: z.string().nullable().optional(),
	retail_delivery_fee: z.string().nullable().optional(),
	tax: z.string().nullable().optional(),
	vat: z.string().nullable().optional(),
	total: z.string().nullable().optional()
});

export const printfulOrderSchema = z
	.object({
		id: z.union([z.string(), z.number()]),
		external_id: z.string().nullable().optional(),
		store_id: z.union([z.string(), z.number()]).optional(),
		status: z.string(),
		created_at: z.string().optional(),
		updated_at: z.string().optional(),
		costs: printfulCostSchema.optional()
	})
	.passthrough();

export type PrintfulOrder = z.infer<typeof printfulOrderSchema>;

export const printfulShipmentSchema = z
	.object({
		id: z.union([z.string(), z.number()]),
		order_id: z.union([z.string(), z.number()]).optional(),
		status: z.string().optional(),
		shipment_status: z.string().optional(),
		carrier: z.string().nullable().optional(),
		tracking_number: z.union([z.string(), z.number()]).nullable().optional(),
		created_at: z.union([z.string(), z.number()]).nullable().optional(),
		created: z.number().nullable().optional(),
		shipped_at: z.union([z.string(), z.number()]).nullable().optional(),
		delivery_status: z.string().optional(),
		delivered_at: z.union([z.string(), z.number()]).nullable().optional(),
		tracking_url: z.string().nullable().optional()
	})
	.passthrough();

export type PrintfulShipment = z.infer<typeof printfulShipmentSchema>;

function printfulConfig() {
	const token = env.PRINTFUL_API_TOKEN?.trim();
	const storeId = env.PRINTFUL_STORE_ID?.trim();
	requireProviderConfig('printful', { PRINTFUL_API_TOKEN: token, PRINTFUL_STORE_ID: storeId });
	return { token: token!, storeId: storeId! };
}

export function createPrintfulClient(fetchImpl?: FetchLike) {
	async function request<T>(path: string, schema: z.ZodType<T>, search?: URLSearchParams) {
		const configured = printfulConfig();
		const url = new URL(`/v2${path}`, 'https://api.printful.com');
		if (search) url.search = search.toString();
		return fetchProviderJson({
			provider: 'printful',
			url,
			init: {
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${configured.token}`,
					'X-PF-Store-Id': configured.storeId
				}
			},
			schema,
			fetchImpl
		});
	}

	return {
		async getStore() {
			const configured = printfulConfig();
			return request(
				`/stores/${encodeURIComponent(configured.storeId)}`,
				z.object({
					data: z.object({
						id: z.union([z.string(), z.number()]),
						type: z.string(),
						name: z.string()
					})
				})
			);
		},

		async getOrder(orderId: string): Promise<PrintfulOrder> {
			const result = await request(
				`/orders/${encodeURIComponent(orderId)}`,
				z.object({ data: printfulOrderSchema })
			);
			return result.data;
		},

		async listOrders(
			limit = 100,
			offset = 0
		): Promise<{ orders: PrintfulOrder[]; nextOffset?: number }> {
			const search = new URLSearchParams({
				limit: String(Math.max(1, Math.min(limit, 100))),
				offset: String(Math.max(0, offset))
			});
			const result = await request(
				'/orders',
				z.object({
					data: z.array(printfulOrderSchema),
					paging: z
						.object({ total: z.number().int(), limit: z.number().int(), offset: z.number().int() })
						.optional()
				}),
				search
			);
			const consumed = (result.paging?.offset ?? offset) + result.data.length;
			return {
				orders: result.data,
				nextOffset: result.paging && consumed < result.paging.total ? consumed : undefined
			};
		},

		async listShipments(orderId: string): Promise<PrintfulShipment[]> {
			const result = await request(
				`/orders/${encodeURIComponent(orderId)}/shipments`,
				z.object({ data: z.array(printfulShipmentSchema) })
			);
			return result.data;
		}
	};
}

export const printful = createPrintfulClient();

export function normalizePrintfulTrackingUrl(value: string | null | undefined) {
	if (!value || value.length > 2_048) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.username || url.password) return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function verifyPrintfulWebhook(
	body: Uint8Array,
	providedPublicKey: string | null,
	providedSignature: string | null,
	publicKey = env.PRINTFUL_WEBHOOK_PUBLIC_KEY?.trim(),
	secretHex = env.PRINTFUL_WEBHOOK_SECRET_HEX?.trim()
) {
	requireProviderConfig('printful', {
		PRINTFUL_WEBHOOK_PUBLIC_KEY: publicKey,
		PRINTFUL_WEBHOOK_SECRET_HEX: secretHex
	});
	if (!providedPublicKey || !providedSignature) return false;
	if (!/^(?:[0-9a-f]{2})+$/i.test(secretHex!)) {
		throw new ProviderError(
			'printful',
			'invalid_configuration',
			'PRINTFUL_WEBHOOK_SECRET_HEX must be an even-length hexadecimal value'
		);
	}
	const expectedPublicKey = Buffer.from(publicKey!, 'utf8').toString('base64');
	const keyMatches = safeEqualText(providedPublicKey, expectedPublicKey, 'base64');
	const expectedSignature = createHmac('sha256', Buffer.from(secretHex!, 'hex'))
		.update(body)
		.digest();
	let actualSignature: Buffer;
	try {
		actualSignature = Buffer.from(providedSignature, 'hex');
	} catch {
		return false;
	}
	return (
		keyMatches &&
		actualSignature.length === expectedSignature.length &&
		timingSafeEqual(actualSignature, expectedSignature)
	);
}

function safeEqualText(left: string, right: string, encoding: BufferEncoding = 'utf8') {
	let leftBuffer: Buffer;
	let rightBuffer: Buffer;
	try {
		leftBuffer = Buffer.from(left, encoding);
		rightBuffer = Buffer.from(right, encoding);
	} catch {
		return false;
	}
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const webhookEnvelopeSchema = z.object({
	type: z.string().min(1),
	occurred_at: z.string().min(1),
	retries: z.number().int().nonnegative(),
	store_id: z.union([z.string(), z.number()]),
	data: z.record(z.string(), z.unknown())
});

export type PrintfulWebhookReference = {
	topic: string;
	resourceId: string;
	storeId: string;
	externalKey: string;
	payloadHash: string;
};

export function parsePrintfulWebhookReference(body: Uint8Array): PrintfulWebhookReference {
	let raw: unknown;
	try {
		raw = JSON.parse(new TextDecoder().decode(body));
	} catch {
		throw new ProviderError('printful', 'invalid_webhook', 'Printful webhook body is invalid JSON');
	}
	const parsed = webhookEnvelopeSchema.safeParse(raw);
	if (!parsed.success) {
		throw new ProviderError('printful', 'invalid_webhook', 'Printful webhook has an invalid shape');
	}
	const candidate =
		objectId(parsed.data.data.order) ??
		objectId(parsed.data.data.shipment, true) ??
		objectId(parsed.data.data.product) ??
		objectId(parsed.data.data);
	if (!candidate) {
		throw new ProviderError(
			'printful',
			'invalid_webhook',
			'Printful webhook has no stable resource ID'
		);
	}
	const identity = `${parsed.data.type}:${parsed.data.occurred_at}:${parsed.data.store_id}:${candidate}:${stableJson(parsed.data.data)}`;
	return {
		topic: parsed.data.type,
		resourceId: candidate,
		storeId: String(parsed.data.store_id),
		externalKey: createHash('sha256').update(identity).digest('hex'),
		payloadHash: createHash('sha256').update(body).digest('hex')
	};
}

export function isConfiguredPrintfulStore(storeId: string) {
	return storeId === printfulConfig().storeId;
}

function objectId(value: unknown, preferOrderId = false): string | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const record = value as Record<string, unknown>;
	const id = preferOrderId
		? (record.order_id ?? record.id ?? record.external_id)
		: (record.id ?? record.order_id ?? record.external_id);
	return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}
