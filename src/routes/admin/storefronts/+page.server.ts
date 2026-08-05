import { defaultBrandManifest } from '$lib/domain/brand';
import { db } from '$lib/server/db';
import { designFamily, productMapping, storefront } from '$lib/server/db/schema';
import { createStorefrontDraft } from '$lib/server/services/storefront-drafts';
import { count, desc, eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { requireAdmin } from '../_auth.server';
import type { Actions, PageServerLoad } from './$types';

const storefrontFormSchema = z.object({
	name: z.string().trim().min(2).max(64),
	nicheBrief: z.string().trim().min(1).max(4000),
	slug: z
		.string()
		.trim()
		.min(2)
		.max(48)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')
});

export const load: PageServerLoad = async () => {
	const [rows, mappingCounts] = await Promise.all([
		db.select().from(storefront).orderBy(desc(storefront.updatedAt)),
		db
			.select({ storefrontId: designFamily.storefrontId, value: count(productMapping.id) })
			.from(designFamily)
			.leftJoin(productMapping, eq(productMapping.designFamilyId, designFamily.id))
			.groupBy(designFamily.storefrontId)
	]);
	const counts = new Map(mappingCounts.map((row) => [row.storefrontId, row.value]));

	return {
		storefronts: rows.map((row) => ({ ...row, productMappings: counts.get(row.id) ?? 0 })),
		createForm: await superValidate(zod4(storefrontFormSchema), { id: 'create-storefront' })
	};
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireAdmin(event.locals);
		const form = await superValidate(event.request, zod4(storefrontFormSchema), {
			id: 'create-storefront'
		});
		if (!form.valid) return fail(400, { createForm: form, createError: null as string | null });

		try {
			const created = await createStorefrontDraft(
				{
					slug: form.data.slug,
					name: form.data.name,
					nicheBrief: form.data.nicheBrief,
					manifest: defaultBrandManifest(form.data.slug, form.data.name)
				},
				{ subject: user.id, client: 'admin', requestId: event.locals.requestId }
			);
			redirect(303, `/admin/storefronts/${created.id}`);
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
			console.error('Could not create storefront', cause);
			return fail(409, {
				createForm: form,
				createError: 'The storefront could not be created. The slug may already be in use.' as
					string | null
			});
		}
	}
};
