export const ledgerKinds = [
	'merchandise-revenue',
	'shipping-revenue',
	'discount',
	'refund',
	'chargeback',
	'printful-product-cost',
	'printful-shipping-cost',
	'printful-tax',
	'provider-adjustment',
	'replacement-cost',
	'shopify-payment-fee',
	'shopify-fx-fee',
	'meta-spend'
] as const;

export type LedgerKind = (typeof ledgerKinds)[number];

const revenueKinds = new Set<LedgerKind>(['merchandise-revenue', 'shipping-revenue']);

/** Ledger revenue is positive and every discount, refund, fee, cost, or spend is negative. */
export function signedLedgerAmount(kind: LedgerKind, absoluteAmountMinor: number) {
	const amount = Math.abs(Math.trunc(absoluteAmountMinor));
	return revenueKinds.has(kind) ? amount : -amount;
}

export function sumContribution(entries: Array<{ amountMinor: number; superseded?: boolean }>) {
	return entries.reduce((total, entry) => total + (entry.superseded ? 0 : entry.amountMinor), 0);
}
