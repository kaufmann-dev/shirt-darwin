import { db } from '$lib/server/db';
import { legalDocument } from '$lib/server/db/schema';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const document = (
		await db
			.select()
			.from(legalDocument)
			.where(and(eq(legalDocument.type, params.legal), isNotNull(legalDocument.publishedAt)))
			.orderBy(desc(legalDocument.version))
			.limit(1)
	)[0];
	if (!document) error(503, 'This legal document has not been published yet.');
	return { document };
};
