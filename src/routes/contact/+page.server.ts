import { db } from '$lib/server/db';
import { globalSetting } from '$lib/server/db/schema';
import { supportContactSchema } from '$lib/domain/support-contact';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const setting = (
		await db.select().from(globalSetting).where(eq(globalSetting.key, 'support-contact')).limit(1)
	)[0];
	const contact = supportContactSchema.safeParse(setting?.value);
	if (!contact.success) error(503, 'The support contact has not been configured yet.');
	return { contact: contact.data };
};
