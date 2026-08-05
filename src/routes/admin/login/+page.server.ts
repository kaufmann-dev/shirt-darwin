import { auth } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		try {
			const result = await auth.api.signInWithOAuth2({
				body: {
					providerId: 'pocket-id',
					callbackURL: '/admin',
					errorCallbackURL: '/admin/login?error=oauth'
				},
				headers: request.headers
			});
			if (!result.url) return fail(502, { error: 'Pocket ID did not return a sign-in URL.' });
			redirect(303, result.url);
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
			console.error('Pocket ID sign-in could not start', cause);
			return fail(502, {
				error: 'Pocket ID sign-in is unavailable. Check the identity configuration.'
			});
		}
	}
};
