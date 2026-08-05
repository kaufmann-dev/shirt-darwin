import { db } from '$lib/server/db';
import { globalSetting, legalDocument } from '$lib/server/db/schema';
import { supportContactSchema } from '$lib/domain/support-contact';
import { desc, eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { recordAdminAction, requireAdmin } from '../_auth.server';
import type { Actions, PageServerLoad } from './$types';

const types = ['imprint', 'privacy', 'terms', 'returns'] as const;
const legalSchema = z.object({
	type: z.enum(types),
	title: z.string().trim().min(2).max(120),
	body: z.string().trim().min(20).max(100_000)
});
const publishSchema = z.object({ documentId: z.string().uuid() });

export const load: PageServerLoad = async () => {
	const [documents, settings] = await Promise.all([
		db.select().from(legalDocument).orderBy(desc(legalDocument.version)),
		db.select().from(globalSetting).where(eq(globalSetting.key, 'support-contact')).limit(1)
	]);
	return {
		documents: types.map((type) => {
			const rows = documents.filter((document) => document.type === type);
			return {
				type,
				current: rows[0] ?? null,
				published: rows.find((document) => document.publishedAt !== null) ?? null,
				history: rows
			};
		}),
		contact: supportContactSchema.safeParse(settings[0]?.value).success
			? supportContactSchema.parse(settings[0]?.value)
			: { email: '', responseNote: 'Contact us about an order or product question.' }
	};
};

export const actions: Actions = {
	save: async (event) => {
		requireAdmin(event.locals);
		const input = legalSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, { action: 'save', error: 'Title and legal text are required.' });
		const currentDraft = (
			await db
				.select()
				.from(legalDocument)
				.where(eq(legalDocument.type, input.data.type))
				.orderBy(desc(legalDocument.version))
				.limit(1)
		)[0];
		let document: typeof currentDraft;
		if (currentDraft && currentDraft.publishedAt === null) {
			[document] = await db
				.update(legalDocument)
				.set({ title: input.data.title, body: input.data.body })
				.where(eq(legalDocument.id, currentDraft.id))
				.returning();
		} else {
			[document] = await db
				.insert(legalDocument)
				.values({
					type: input.data.type,
					title: input.data.title,
					body: input.data.body,
					version: (currentDraft?.version ?? 0) + 1
				})
				.returning();
		}
		await recordAdminAction(event, {
			action: 'legal-document.save-draft',
			entityType: 'legal-document',
			entityId: document.id,
			afterRevision: document.version
		});
		return {
			action: 'save',
			success: `${document.title} draft saved as version ${document.version}.`
		};
	},

	publish: async (event) => {
		requireAdmin(event.locals);
		const input = publishSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) return fail(400, { action: 'publish', error: 'Invalid legal document.' });
		const [document] = await db
			.update(legalDocument)
			.set({ publishedAt: new Date() })
			.where(eq(legalDocument.id, input.data.documentId))
			.returning();
		if (!document) error(404, 'Legal document not found');
		await recordAdminAction(event, {
			action: 'legal-document.publish',
			entityType: 'legal-document',
			entityId: document.id,
			afterRevision: document.version
		});
		return {
			action: 'publish',
			success: `${document.title} version ${document.version} published.`
		};
	},

	contact: async (event) => {
		requireAdmin(event.locals);
		const input = supportContactSchema.safeParse(
			Object.fromEntries(await event.request.formData())
		);
		if (!input.success)
			return fail(400, {
				action: 'contact',
				error: 'Enter a valid support email and public response note.'
			});
		await db
			.insert(globalSetting)
			.values({ key: 'support-contact', value: input.data })
			.onConflictDoUpdate({
				target: globalSetting.key,
				set: { value: input.data, updatedAt: new Date() }
			});
		await recordAdminAction(event, {
			action: 'support-contact.update',
			entityType: 'global-setting',
			entityId: 'support-contact'
		});
		return { action: 'contact', success: 'Public contact details updated.' };
	}
};
