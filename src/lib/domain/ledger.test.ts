import { describe, expect, it } from 'vitest';
import { signedLedgerAmount, sumContribution } from './ledger';

describe('ledger sign convention', () => {
	it('keeps revenue positive and costs negative', () => {
		expect(signedLedgerAmount('merchandise-revenue', 2_000)).toBe(2_000);
		expect(signedLedgerAmount('shopify-payment-fee', 125)).toBe(-125);
	});

	it('excludes superseded estimates', () => {
		expect(
			sumContribution([
				{ amountMinor: -100, superseded: true },
				{ amountMinor: -120 },
				{ amountMinor: 1_000 }
			])
		).toBe(880);
	});
});
