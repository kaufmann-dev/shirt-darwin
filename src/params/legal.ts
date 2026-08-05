import type { ParamMatcher } from '@sveltejs/kit';

const legalTypes = new Set(['imprint', 'privacy', 'terms', 'returns']);

export const match: ParamMatcher = (param) => legalTypes.has(param);
