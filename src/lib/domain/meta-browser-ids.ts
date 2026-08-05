const metaClickIdPattern = /^[a-zA-Z0-9_-]{1,200}$/;

export function resolveMetaFbc(input: {
	existingFbc?: string;
	fbclid: string | null;
	timestamp: number;
}) {
	if (!input.fbclid || !metaClickIdPattern.test(input.fbclid)) return input.existingFbc;
	return `fb.1.${input.timestamp}.${input.fbclid}`;
}
