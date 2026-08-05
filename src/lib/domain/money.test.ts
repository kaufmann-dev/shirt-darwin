import { describe, expect, it } from 'vitest';
import { calculateContribution } from './money';

describe('contribution profit', () => {
	it('excludes customer tax and subtracts every variable cost', () => {
		expect(
			calculateContribution({
				merchandiseRevenue: 10_000,
				shippingRevenue: 500,
				discounts: 500,
				refundsAndChargebacks: 1_000,
				printfulProductCost: 3_000,
				printfulShippingCost: 500,
				printfulTax: 250,
				providerAdjustments: 50,
				replacementCost: 0,
				shopifyPaymentFees: 400,
				shopifyFxFees: 100,
				metaSpend: 2_000
			})
		).toBe(2_700);
	});
});
