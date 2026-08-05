import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyShopifyWebhook } from './shopify';
import { parsePrintfulWebhookReference, verifyPrintfulWebhook } from './printful';

describe('provider webhook verification', () => {
	it('verifies Shopify against the exact raw body', () => {
		const secret = 'shopify-secret';
		const body = new TextEncoder().encode('{"id":123,"name":"#1001"}');
		const signature = createHmac('sha256', secret).update(body).digest('base64');
		expect(verifyShopifyWebhook(body, signature, secret)).toBe(true);
		expect(verifyShopifyWebhook(new TextEncoder().encode('{"id":123}'), signature, secret)).toBe(
			false
		);
	});

	it('verifies Printful public key and HMAC and ignores retry count in its event identity', () => {
		const publicKey = 'public-key';
		const secretHex = '00112233445566778899aabbccddeeff';
		const event = {
			type: 'order_updated',
			occurred_at: '2026-08-05T12:00:00Z',
			retries: 0,
			store_id: 123,
			data: { order: { id: 456 } }
		};
		const body = new TextEncoder().encode(JSON.stringify(event));
		const signature = createHmac('sha256', Buffer.from(secretHex, 'hex'))
			.update(body)
			.digest('hex');
		expect(
			verifyPrintfulWebhook(
				body,
				Buffer.from(publicKey).toString('base64'),
				signature,
				publicKey,
				secretHex
			)
		).toBe(true);
		const retry = new TextEncoder().encode(JSON.stringify({ ...event, retries: 4 }));
		expect(parsePrintfulWebhookReference(retry).externalKey).toBe(
			parsePrintfulWebhookReference(body).externalKey
		);
	});
});
