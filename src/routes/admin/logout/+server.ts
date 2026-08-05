import { auth } from '$lib/server/auth';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) redirect(303, '/admin/login');
	await auth.api.signOut({ headers: request.headers });
	locals.user = null;
	locals.session = null;
	redirect(303, '/admin/login');
};
