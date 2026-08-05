import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { genericOAuth } from 'better-auth/plugins';
import { db } from '$lib/server/db';
import { serverConfig } from '$lib/server/config';

interface PocketProfile {
	sub?: unknown;
	name?: unknown;
	preferred_username?: unknown;
	email?: unknown;
	email_verified?: unknown;
	groups?: unknown;
}

export function mapPocketProfile(profile: PocketProfile) {
	const subject = String(profile.sub ?? '');
	if (!subject) throw new Error('Pocket ID did not provide a subject');
	if (serverConfig.pocketId.allowedSubject && subject !== serverConfig.pocketId.allowedSubject) {
		throw new Error('Pocket ID subject is not authorized for Shirt Darwin');
	}

	const groups = Array.isArray(profile.groups)
		? profile.groups.map(String)
		: typeof profile.groups === 'string'
			? profile.groups.split(/\s+/).filter(Boolean)
			: [];
	if (serverConfig.pocketId.adminGroup && !groups.includes(serverConfig.pocketId.adminGroup)) {
		throw new Error('Pocket ID user is not in the Shirt Darwin admin group');
	}

	return {
		name: String(profile.name ?? profile.preferred_username ?? 'Operator'),
		email: String(profile.email ?? `${subject}@pocket-id.invalid`),
		emailVerified: Boolean(profile.email_verified ?? true)
	};
}

export const auth = betterAuth({
	baseURL: serverConfig.appOrigin,
	secret: serverConfig.authSecret,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: false },
	trustedOrigins: [serverConfig.appOrigin],
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: 'pocket-id',
					discoveryUrl: `${serverConfig.pocketId.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
					clientId: serverConfig.pocketId.clientId,
					clientSecret: serverConfig.pocketId.clientSecret,
					scopes: ['openid', 'profile', 'email', 'groups'],
					mapProfileToUser: mapPocketProfile
				}
			]
		}),
		sveltekitCookies(getRequestEvent)
	]
});
