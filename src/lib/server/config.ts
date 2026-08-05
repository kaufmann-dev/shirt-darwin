import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const optional = (key: string) => env[key]?.trim() || undefined;
const publicOptional = (key: `PUBLIC_${string}`) => publicEnv[key]?.trim() || undefined;

export const serverConfig = {
	get databaseUrl() {
		return optional('DATABASE_URL') ?? 'postgres://postgres:postgres@localhost:5432/shirt_darwin';
	},
	get appOrigin() {
		return publicOptional('PUBLIC_APP_ORIGIN') ?? 'http://localhost:5173';
	},
	get rootHost() {
		return publicOptional('PUBLIC_ROOT_HOST') ?? 'localhost';
	},
	get trustedHosts() {
		return new Set(
			(optional('TRUSTED_HOSTS') ?? 'localhost,127.0.0.1')
				.split(',')
				.map((host) => host.trim().toLowerCase())
				.filter(Boolean)
		);
	},
	get assetOrigins() {
		const configuredOrigins = [optional('S3_ENDPOINT'), optional('S3_PUBLIC_BASE_URL')].flatMap(
			(value) => {
				if (!value) return [];
				try {
					const url = new URL(value);
					return url.protocol === 'https:' || url.protocol === 'http:' ? [url.origin] : [];
				} catch {
					return [];
				}
			}
		);
		if (optional('S3_FORCE_PATH_STYLE')?.toLowerCase() !== 'true') {
			const endpoint = optional('S3_ENDPOINT');
			if (endpoint) {
				for (const bucket of [optional('S3_PRIVATE_BUCKET'), optional('S3_PUBLIC_BUCKET')]) {
					if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) continue;
					try {
						const url = new URL(endpoint);
						url.hostname = `${bucket}.${url.hostname}`;
						configuredOrigins.push(url.origin);
					} catch {
						// Invalid storage configuration is reported by readiness.
					}
				}
			}
		}
		return configuredOrigins.filter((origin, index, origins) => origins.indexOf(origin) === index);
	},
	get authSecret() {
		return optional('BETTER_AUTH_SECRET') ?? 'development-only-secret-change-before-production';
	},
	pocketId: {
		get issuer() {
			return optional('POCKET_ID_ISSUER') ?? 'https://id.invalid';
		},
		get clientId() {
			return optional('POCKET_ID_CLIENT_ID') ?? 'not-configured';
		},
		get clientSecret() {
			return optional('POCKET_ID_CLIENT_SECRET') ?? 'not-configured';
		},
		get allowedSubject() {
			return optional('POCKET_ID_ALLOWED_SUBJECT');
		},
		get adminGroup() {
			return optional('POCKET_ID_ADMIN_GROUP') ?? 'shirt-darwin-admin';
		}
	},
	get mcpResourceUri() {
		return optional('MCP_RESOURCE_URI') ?? `${serverConfig.appOrigin}/mcp`;
	}
};

export function assertProductionConfig() {
	const required = [
		'DATABASE_URL',
		'PUBLIC_APP_ORIGIN',
		'PUBLIC_ROOT_HOST',
		'BETTER_AUTH_SECRET',
		'POCKET_ID_ISSUER',
		'POCKET_ID_CLIENT_ID',
		'POCKET_ID_CLIENT_SECRET',
		'POCKET_ID_ALLOWED_SUBJECT',
		'MCP_RESOURCE_URI',
		'SHOPIFY_STORE_DOMAIN',
		'SHOPIFY_STOREFRONT_TOKEN',
		'SHOPIFY_ADMIN_ACCESS_TOKEN',
		'SHOPIFY_WEBHOOK_SECRET',
		'SHOPIFY_API_VERSION',
		'PRINTFUL_API_TOKEN',
		'PRINTFUL_STORE_ID',
		'PRINTFUL_WEBHOOK_PUBLIC_KEY',
		'PRINTFUL_WEBHOOK_SECRET_HEX',
		'PUBLIC_META_PIXEL_ID',
		'META_DATASET_ID',
		'META_ACCESS_TOKEN',
		'META_AD_ACCOUNT_ID',
		'META_GRAPH_API_VERSION',
		'S3_ENDPOINT',
		'S3_REGION',
		'S3_PRIVATE_BUCKET',
		'S3_PUBLIC_BUCKET',
		'S3_ACCESS_KEY_ID',
		'S3_SECRET_ACCESS_KEY',
		'S3_PUBLIC_BASE_URL'
	];
	const errors = required.filter((key) =>
		key.startsWith('PUBLIC_') ? !publicOptional(key as `PUBLIC_${string}`) : !optional(key)
	);
	if (optional('BETTER_AUTH_SECRET') && optional('BETTER_AUTH_SECRET')!.length < 32) {
		errors.push('BETTER_AUTH_SECRET (minimum 32 characters)');
	}
	const appOrigin = publicOptional('PUBLIC_APP_ORIGIN');
	if (appOrigin) {
		try {
			if (new URL(appOrigin).protocol !== 'https:')
				errors.push('PUBLIC_APP_ORIGIN (HTTPS required)');
		} catch {
			errors.push('PUBLIC_APP_ORIGIN (invalid URL)');
		}
	}
	const rootHost = publicOptional('PUBLIC_ROOT_HOST');
	if (rootHost && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(rootHost)) {
		errors.push('PUBLIC_ROOT_HOST (invalid hostname)');
	}
	if (
		optional('S3_PRIVATE_BUCKET') &&
		optional('S3_PRIVATE_BUCKET') === optional('S3_PUBLIC_BUCKET')
	) {
		errors.push('S3_PRIVATE_BUCKET/S3_PUBLIC_BUCKET (must differ)');
	}
	return [...new Set(errors)];
}
