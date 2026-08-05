import { z } from 'zod';

export type ProviderName = 'shopify' | 'printful' | 'meta' | 's3';

export class ProviderError extends Error {
	readonly provider: ProviderName;
	readonly code: string;
	readonly status?: number;
	readonly retryable: boolean;

	constructor(
		provider: ProviderName,
		code: string,
		message: string,
		options: { status?: number; retryable?: boolean; cause?: unknown } = {}
	) {
		super(message, { cause: options.cause });
		this.name = 'ProviderError';
		this.provider = provider;
		this.code = code;
		this.status = options.status;
		this.retryable = options.retryable ?? false;
	}
}

export function requireProviderConfig(
	provider: ProviderName,
	values: Record<string, string | undefined>
) {
	const missing = Object.entries(values)
		.filter(([, value]) => !value?.trim())
		.map(([key]) => key);
	if (missing.length > 0) {
		throw new ProviderError(
			provider,
			'not_configured',
			`${provider} is not configured; missing ${missing.join(', ')}`
		);
	}
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchProviderJson<T>(options: {
	provider: ProviderName;
	url: string | URL;
	init?: RequestInit;
	schema: z.ZodType<T>;
	fetchImpl?: FetchLike;
	timeoutMs?: number;
}): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await fetchImpl(options.url, {
			...options.init,
			signal: options.init?.signal ?? AbortSignal.timeout(options.timeoutMs ?? 10_000)
		});
	} catch (cause) {
		throw new ProviderError(
			options.provider,
			'network_error',
			`${options.provider} request failed`,
			{
				retryable: true,
				cause
			}
		);
	}

	if (!response.ok) {
		throw new ProviderError(
			options.provider,
			'http_error',
			`${options.provider} returned HTTP ${response.status}`,
			{ status: response.status, retryable: response.status === 429 || response.status >= 500 }
		);
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch (cause) {
		throw new ProviderError(
			options.provider,
			'invalid_json',
			`${options.provider} returned invalid JSON`,
			{ cause }
		);
	}

	const parsed = options.schema.safeParse(body);
	if (!parsed.success) {
		throw new ProviderError(
			options.provider,
			'invalid_response',
			`${options.provider} returned an unexpected response shape`,
			{ cause: parsed.error }
		);
	}
	return parsed.data;
}
