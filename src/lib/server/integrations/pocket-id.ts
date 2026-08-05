import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
	OAuthError,
	OAuthErrorCode,
	type AuthInfo,
	type OAuthTokenVerifier
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { serverConfig } from '$lib/server/config';

const discoverySchema = z.object({
	issuer: z.string().url(),
	jwks_uri: z.string().url()
});

let jwksPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | undefined;

async function getJwks() {
	if (!jwksPromise) {
		jwksPromise = (async () => {
			const issuer = configuredIssuer();
			let response: Response;
			try {
				response = await fetch(`${issuer}/.well-known/openid-configuration`, {
					headers: { accept: 'application/json' },
					signal: AbortSignal.timeout(10_000)
				});
			} catch (cause) {
				throw new OAuthError(
					OAuthErrorCode.ServerError,
					`Pocket ID discovery failed: ${safeMessage(cause)}`
				);
			}
			if (!response.ok) {
				throw new OAuthError(OAuthErrorCode.ServerError, 'Pocket ID discovery failed');
			}
			const metadata = discoverySchema.safeParse(await response.json().catch(() => null));
			if (!metadata.success || trimSlash(metadata.data.issuer) !== issuer) {
				throw new OAuthError(OAuthErrorCode.ServerError, 'Pocket ID discovery metadata is invalid');
			}
			return createRemoteJWKSet(new URL(metadata.data.jwks_uri), {
				timeoutDuration: 10_000,
				cooldownDuration: 30_000
			});
		})();
		jwksPromise.catch(() => {
			jwksPromise = undefined;
		});
	}
	return jwksPromise;
}

export const pocketIdTokenVerifier: OAuthTokenVerifier = {
	async verifyAccessToken(token: string): Promise<AuthInfo> {
		try {
			const issuer = configuredIssuer();
			const jwks = await getJwks();
			const result = await jwtVerify(token, jwks, {
				issuer,
				audience: serverConfig.mcpResourceUri,
				algorithms: ['RS256', 'PS256', 'ES256']
			});
			return authInfoFromClaims(token, result.payload);
		} catch (cause) {
			if (cause instanceof OAuthError && cause.code === OAuthErrorCode.ServerError) throw cause;
			throw new OAuthError(OAuthErrorCode.InvalidToken, 'Pocket ID access token is invalid');
		}
	}
};

function authInfoFromClaims(token: string, payload: JWTPayload): AuthInfo {
	const subject = payload.sub;
	const expiresAt = payload.exp;
	if (!subject || !expiresAt) throw new Error('Token is missing subject or expiry');
	if (serverConfig.pocketId.allowedSubject && subject !== serverConfig.pocketId.allowedSubject) {
		throw new Error('Token subject is not authorized');
	}
	const rawScopes = payload.scope ?? payload.scp;
	const scopes = Array.isArray(rawScopes)
		? rawScopes.filter((scope): scope is string => typeof scope === 'string')
		: typeof rawScopes === 'string'
			? rawScopes.split(/\s+/).filter(Boolean)
			: [];
	const clientId =
		typeof payload.client_id === 'string'
			? payload.client_id
			: typeof payload.azp === 'string'
				? payload.azp
				: undefined;
	if (!clientId) throw new Error('Token is missing its authorized client');
	return {
		token,
		clientId,
		scopes,
		expiresAt,
		resource: new URL(serverConfig.mcpResourceUri),
		extra: { subject }
	};
}

function configuredIssuer() {
	const issuer = trimSlash(serverConfig.pocketId.issuer);
	if (issuer === 'https://id.invalid') {
		throw new OAuthError(OAuthErrorCode.ServerError, 'Pocket ID is not configured');
	}
	return issuer;
}

function trimSlash(value: string) {
	return value.replace(/\/$/, '');
}

function safeMessage(error: unknown) {
	return error instanceof Error ? error.message.slice(0, 160) : 'network error';
}
