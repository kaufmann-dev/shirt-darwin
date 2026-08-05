export type CurrencyCode = 'USD' | 'EUR' | string;

export interface Money {
	amountMinor: number;
	currency: CurrencyCode;
}

export interface ContributionInput {
	merchandiseRevenue: number;
	shippingRevenue: number;
	discounts: number;
	refundsAndChargebacks: number;
	printfulProductCost: number;
	printfulShippingCost: number;
	printfulTax: number;
	providerAdjustments: number;
	replacementCost: number;
	shopifyPaymentFees: number;
	shopifyFxFees: number;
	metaSpend: number;
}

export function calculateContribution(input: ContributionInput): number {
	return (
		input.merchandiseRevenue +
		input.shippingRevenue -
		input.discounts -
		input.refundsAndChargebacks -
		input.printfulProductCost -
		input.printfulShippingCost -
		input.printfulTax -
		input.providerAdjustments -
		input.replacementCost -
		input.shopifyPaymentFees -
		input.shopifyFxFees -
		input.metaSpend
	);
}

export function formatMoney(amountMinor: number, currency: string, locale = 'en-US') {
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}
