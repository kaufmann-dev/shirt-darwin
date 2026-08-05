import { describe, expect, it } from 'vitest';
import { _orderNetRevenueMinor } from './+page.server';

describe('admin order revenue', () => {
	it('does not subtract Shopify informational discounts twice', () => {
		expect(
			_orderNetRevenueMinor({
				merchandiseRevenueMinor: 9_000,
				shippingRevenueMinor: 800,
				refundMinor: 3_000
			})
		).toBe(6_800);
	});
});
