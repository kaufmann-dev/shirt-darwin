export interface ConsentDecision {
	analytics: boolean;
	marketing: boolean;
	saleOfData: boolean;
	decidedAt: string;
}

export interface ConsentContext {
	globalPrivacyControl: boolean;
	regionRequiresOptIn: boolean;
	storedDecision: ConsentDecision | null;
}

export function marketingConsent(context: ConsentContext) {
	if (context.globalPrivacyControl) return false;
	if (context.storedDecision) {
		return context.storedDecision.marketing && context.storedDecision.saleOfData;
	}
	return !context.regionRequiresOptIn;
}

export function necessaryOnlyDecision(now = new Date()): ConsentDecision {
	return {
		analytics: false,
		marketing: false,
		saleOfData: false,
		decidedAt: now.toISOString()
	};
}
