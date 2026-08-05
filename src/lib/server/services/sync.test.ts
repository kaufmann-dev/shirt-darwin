import { describe, expect, it } from 'vitest';
import {
	decimalToMinor,
	derivePrintfulCosts,
	deriveShopifyOrderAmounts,
	deriveShopifyPaymentLedgerEffect,
	metaReconciliationSince,
	shouldAppendLedgerValue
} from './sync';

const money = (amount: string) => ({ shopMoney: { amount, currencyCode: 'USD' } });

describe('provider money normalization', () => {
	it('converts decimal strings to exact minor units', () => {
		expect(decimalToMinor('12.34')).toBe(1234);
		expect(decimalToMinor('-0.005')).toBe(-1);
	});

	it('does not double-count a discount or tax-inclusive refund', () => {
		const amounts = deriveShopifyOrderAmounts({
			// Original $100 price less a $10 discount: Shopify subtotal is already net $90.
			subtotalPriceSet: money('90.00'),
			// A $30 merchandise return leaves $60 current merchandise.
			currentSubtotalPriceSet: money('60.00'),
			totalShippingPriceSet: money('8.00'),
			// Shipping was not refunded.
			currentShippingPriceSet: money('8.00'),
			totalDiscountsSet: money('10.00'),
			lineItems: { nodes: [] }
		});
		expect(amounts).toEqual({
			merchandiseRevenueMinor: 9000,
			shippingRevenueMinor: 800,
			discountMinor: 1000,
			usedSubtotalFallback: false,
			refundMinor: 3000
		});
	});

	it('falls back to discounted line totals when Shopify omits the original subtotal', () => {
		expect(
			deriveShopifyOrderAmounts({
				subtotalPriceSet: null,
				currentSubtotalPriceSet: money('20.00'),
				totalShippingPriceSet: money('5.00'),
				currentShippingPriceSet: money('5.00'),
				totalDiscountsSet: null,
				lineItems: {
					nodes: [
						{ discountedTotalSet: money('20.00') },
						{ discountedTotalSet: money('10.00') }
					] as never
				}
			})
		).toEqual({
			merchandiseRevenueMinor: 3000,
			shippingRevenueMinor: 500,
			discountMinor: 0,
			usedSubtotalFallback: true,
			refundMinor: 1000
		});
	});

	it('preserves the sign of Shopify fee charges and fee reversals', () => {
		expect(
			deriveShopifyPaymentLedgerEffect({
				amount: { amount: '98.33', currencyCode: 'EUR' },
				net: { amount: '89.36', currencyCode: 'EUR' }
			})
		).toEqual({ amountMinor: -897, currency: 'EUR', kind: 'shopify-payment-fee' });
		expect(
			deriveShopifyPaymentLedgerEffect({
				amount: { amount: '-98.33', currencyCode: 'EUR' },
				net: { amount: '-97.80', currencyCode: 'EUR' }
			})
		).toEqual({ amountMinor: 53, currency: 'EUR', kind: 'provider-adjustment' });
	});

	it('keeps each available Printful cost when another component is missing', () => {
		expect(
			derivePrintfulCosts({
				currency: 'usd',
				subtotal: '12.34',
				shipping: null,
				tax: '0.56'
			})
		).toEqual({
			currency: 'USD',
			productCostMinor: 1234,
			shippingCostMinor: null,
			taxComponentMinor: 56,
			vatComponentMinor: null,
			taxMinor: 56,
			providerAdjustmentMinor: null,
			totalCostMinor: null
		});
	});

	it('sums tax and VAT and reconciles every extra Printful cost to the provider total', () => {
		expect(
			derivePrintfulCosts({
				currency: 'USD',
				subtotal: '12.57',
				discount: '1.00',
				shipping: '3.65',
				digitization: '5.75',
				additional_fee: '0.00',
				fulfillment_fee: '0.00',
				retail_delivery_fee: '0.00',
				tax: '0.00',
				vat: '1.91',
				total: '22.88'
			})
		).toEqual({
			currency: 'USD',
			productCostMinor: 1257,
			shippingCostMinor: 365,
			taxComponentMinor: 0,
			vatComponentMinor: 191,
			taxMinor: 191,
			providerAdjustmentMinor: 475,
			totalCostMinor: 2288
		});
	});

	it('reconciles Meta from an old last-seen horizon instead of a fixed recent window', () => {
		expect(
			metaReconciliationSince({
				experimentStartsAt: new Date('2026-01-01T15:00:00Z'),
				lastMetricDate: '2026-01-10',
				now: new Date('2026-03-01T00:00:00Z')
			})
		).toBe('2026-01-03');
		expect(
			metaReconciliationSince({
				experimentStartsAt: new Date('2025-12-15T15:00:00Z'),
				lastMetricDate: null,
				now: new Date('2026-03-01T00:00:00Z')
			})
		).toBe('2025-12-15');
	});

	it('skips initial zero ledger facts but preserves zero corrections', () => {
		const zero = { amountMinor: 0, currency: 'USD', experimentId: null };
		expect(shouldAppendLedgerValue(zero)).toBe(false);
		expect(
			shouldAppendLedgerValue(zero, {
				amountMinor: -500,
				currency: 'USD',
				experimentId: null
			})
		).toBe(true);
	});
});
