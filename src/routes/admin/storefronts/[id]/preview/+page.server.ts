import { buildStorefrontView } from '$lib/components/storefront/data.server';
import { storefrontCatalogSnapshotSchema } from '$lib/domain/storefront-catalog';
import { db } from '$lib/server/db';
import { serverConfig } from '$lib/server/config';
import { storefront, storefrontRevision } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const id = z.string().uuid().safeParse(params.id);
	const requestedRevision = z.coerce
		.number()
		.int()
		.positive()
		.safeParse(url.searchParams.get('revision'));
	if (!id.success) error(404, 'Storefront not found');
	const store = (await db.select().from(storefront).where(eq(storefront.id, id.data)).limit(1))[0];
	if (!store) error(404, 'Storefront not found');
	const revisionNumber = requestedRevision.success ? requestedRevision.data : store.draftRevision;
	const revision = (
		await db
			.select()
			.from(storefrontRevision)
			.where(
				and(
					eq(storefrontRevision.storefrontId, store.id),
					eq(storefrontRevision.revision, revisionNumber)
				)
			)
			.limit(1)
	)[0];
	if (!revision) error(404, 'Storefront revision not found');
	const snapshot = storefrontCatalogSnapshotSchema.safeParse(revision.catalogSnapshot);
	if (revision.revision !== store.draftRevision && !snapshot.success) {
		error(409, 'Historical revision has no frozen catalog snapshot');
	}

	const root = new URL(serverConfig.appOrigin);
	const brand = new URL(serverConfig.appOrigin);
	brand.hostname =
		serverConfig.rootHost === 'localhost'
			? `${store.slug}.localhost`
			: `${store.slug}.${serverConfig.rootHost}`;
	return {
		storefront: await buildStorefrontView({
			storefront: store,
			revision: revision.revision,
			manifest: revision.manifest,
			canonicalOrigin: brand.origin,
			legalBaseUrl: root.origin,
			catalog: snapshot.success
				? { source: 'published', snapshot: snapshot.data }
				: { source: 'working' },
			includePrivateAssets: true
		})
	};
};
