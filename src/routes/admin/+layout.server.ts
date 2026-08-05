import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const isLogin = url.pathname === '/admin/login';
	if (!locals.user && !isLogin) redirect(303, '/admin/login');
	if (locals.user && isLogin) redirect(303, '/admin');

	return {
		user: locals.user
			? { id: locals.user.id, name: locals.user.name, email: locals.user.email }
			: null
	};
};
