import { brandManifestSchema, type BrandManifest } from '$lib/domain/brand';
import { publicationReadiness } from '$lib/domain/readiness';
import {
	createStorefrontCatalogSnapshot,
	storefrontCatalogSnapshotsEqual,
	storefrontCatalogSnapshotSchema
} from '$lib/domain/storefront-catalog';
import { supportContactSchema } from '$lib/domain/support-contact';
import { db } from '$lib/server/db';
import {
	brandAsset,
	designFamily,
	experiment,
	globalSetting,
	legalDocument,
	productMapping,
	storefront,
	storefrontRevision
} from '$lib/server/db/schema';
import {
	shopifyProductSupportsUsMarket,
	shopifyStorefront
} from '$lib/server/integrations/shopify';
import {
	assertStorefrontCatalogMutable,
	readWorkingCatalogSnapshot,
	StorefrontCatalogFrozenError
} from '$lib/server/services/experiments';
import { replaceStorefrontDraft } from '$lib/server/services/storefront-drafts';
import { promoteBrandAssets } from '$lib/server/storage';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { recordAdminAction, requireAdmin } from '../../_auth.server';
import type { Actions, PageServerLoad } from './$types';

const idSchema = z.string().uuid();
const manifestActionSchema = z.object({
	expectedRevision: z.coerce.number().int().positive(),
	manifest: z.string().min(2).max(250_000)
});
const briefSchema = z.object({ nicheBrief: z.string().trim().min(1).max(4000) });
const familySchema = z.object({
	name: z.string().trim().min(2).max(80),
	slug: z
		.string()
		.trim()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	description: z.string().trim().min(1).max(500)
});
const designReviewSchema = z.object({
	designFamilyId: z.string().uuid(),
	mockupAssetId: z.string().uuid(),
	printFileAssetId: z.string().uuid(),
	provenanceNotes: z.string().trim().min(10).max(2000),
	rightsReviewed: z.literal('yes')
});
const mappingSchema = z.object({
	designFamilyId: z.string().uuid(),
	garment: z.enum(['tshirt', 'hoodie', 'crewneck']),
	shopifyHandle: z.string().trim().min(1).max(255),
	printfulProductId: z.string().trim().max(120).optional()
});
const mappingToggleSchema = z.object({
	mappingId: z.string().uuid(),
	active: z.enum(['true', 'false'])
});
const publishSchema = z.object({ experimentId: z.string().uuid() });

class StorefrontPublicationConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'StorefrontPublicationConflictError';
	}
}

class ProductMappingIdentityConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProductMappingIdentityConflictError';
	}
}

async function storefrontData(id: string) {
	const store = (await db.select().from(storefront).where(eq(storefront.id, id)).limit(1))[0];
	if (!store) error(404, 'Storefront not found');
	const [revisions, assets, families, mappings, legalRows, experiments, contactSettings] =
		await Promise.all([
			db
				.select()
				.from(storefrontRevision)
				.where(eq(storefrontRevision.storefrontId, id))
				.orderBy(desc(storefrontRevision.revision)),
			db
				.select()
				.from(brandAsset)
				.where(eq(brandAsset.storefrontId, id))
				.orderBy(desc(brandAsset.createdAt)),
			db
				.select()
				.from(designFamily)
				.where(eq(designFamily.storefrontId, id))
				.orderBy(asc(designFamily.createdAt)),
			db
				.select({
					id: productMapping.id,
					designFamilyId: productMapping.designFamilyId,
					garment: productMapping.garment,
					shopifyProductId: productMapping.shopifyProductId,
					shopifyHandle: productMapping.shopifyHandle,
					printfulProductId: productMapping.printfulProductId,
					active: productMapping.active,
					providerAvailable: productMapping.providerAvailable,
					productSnapshot: productMapping.productSnapshot,
					updatedAt: productMapping.updatedAt
				})
				.from(productMapping)
				.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
				.where(eq(designFamily.storefrontId, id))
				.orderBy(
					asc(productMapping.garment),
					desc(productMapping.active),
					desc(productMapping.createdAt)
				),
			db
				.select({ type: legalDocument.type })
				.from(legalDocument)
				.where(isNotNull(legalDocument.publishedAt)),
			db
				.select()
				.from(experiment)
				.where(eq(experiment.storefrontId, id))
				.orderBy(desc(experiment.createdAt)),
			db.select().from(globalSetting).where(eq(globalSetting.key, 'support-contact')).limit(1)
		]);
	const draft = revisions.find((revision) => revision.revision === store.draftRevision);
	if (!draft) error(500, 'Storefront draft revision is missing');
	const familyRows = families.map((family) => ({
		...family,
		mappings: mappings.filter((mapping) => mapping.designFamilyId === family.id)
	}));
	const now = new Date();
	const publishExperiments = experiments.filter(
		(item) => item.storefrontRevisionId === draft.id && item.endedAt === null && item.endsAt > now
	);
	const runningRevisionConflict = experiments.some(
		(item) =>
			item.storefrontRevisionId !== draft.id &&
			item.endedAt === null &&
			item.startsAt <= now &&
			item.endsAt > now
	);
	const supportContactConfigured = supportContactSchema.safeParse(
		contactSettings[0]?.value
	).success;
	const heroProductMappingId = publishExperiments[0]?.heroProductMappingId ?? null;
	const parsedCatalogSnapshot = storefrontCatalogSnapshotSchema.safeParse(draft.catalogSnapshot);
	const boundCatalogSnapshot = parsedCatalogSnapshot.success ? parsedCatalogSnapshot.data : null;
	let workingCatalogSnapshot: ReturnType<typeof createStorefrontCatalogSnapshot> | null = null;
	try {
		workingCatalogSnapshot = createStorefrontCatalogSnapshot(familyRows);
	} catch {
		// Publication readiness below reports the invalid working Shopify data.
	}
	const workingCatalogMatchesBound =
		!boundCatalogSnapshot ||
		Boolean(
			workingCatalogSnapshot &&
			storefrontCatalogSnapshotsEqual(boundCatalogSnapshot, workingCatalogSnapshot)
		);
	const readinessDesignFamilies = boundCatalogSnapshot
		? boundCatalogSnapshot.designs.map((design) => {
				const working = familyRows.find((family) => family.id === design.id);
				return {
					id: design.id,
					mockupAssetId: design.mockupAssetId,
					printFileAssetId: working?.printFileAssetId ?? null,
					provenanceNotes: working?.provenanceNotes ?? '',
					rightsReviewedAt: working?.rightsReviewedAt ?? null,
					mappings: design.products.map((product) => {
						const current = working?.mappings.find((mapping) => mapping.id === product.mappingId);
						return {
							id: product.mappingId,
							garment: product.garment,
							active: current?.active ?? false,
							providerAvailable: current?.providerAvailable ?? false,
							productSnapshot: current?.productSnapshot ?? product.productSnapshot
						};
					})
				};
			})
		: familyRows;
	const readiness = publicationReadiness({
		manifest: draft.manifest,
		assets: assets.map((asset) => ({
			id: asset.id,
			kind: asset.kind,
			confirmedAt: asset.confirmedAt
		})),
		designFamilies: readinessDesignFamilies,
		heroProductMappingId,
		publishedLegalTypes: legalRows.map((row) => row.type),
		supportContactConfigured,
		experimentRevisionMatches: publishExperiments.length > 0,
		hasRunningRevisionConflict: runningRevisionConflict
	});
	if (!workingCatalogMatchesBound) {
		readiness.push({
			code: 'catalog-snapshot-stale',
			message:
				'The working Shopify catalog changed after the experiment was bound. End the experiment, review the catalog, and create a new experiment.'
		});
	}

	return {
		store,
		draft,
		revisions,
		assets,
		designFamilies: familyRows,
		readinessDesignFamilies,
		boundCatalogSnapshot,
		workingCatalogMatchesBound,
		heroProductMappingId,
		publishExperiments,
		supportContactConfigured,
		runningRevisionConflict,
		publishedLegalTypes: legalRows.map((row) => row.type),
		readiness
	};
}

export const load: PageServerLoad = async ({ params }) => {
	if (!idSchema.safeParse(params.id).success) error(404, 'Storefront not found');
	return storefrontData(params.id);
};

export const actions: Actions = {
	brief: async (event) => {
		requireAdmin(event.locals);
		const input = briefSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, {
				action: 'brief',
				error: 'Niche brief must be between 1 and 4,000 characters.'
			});
		const [updated] = await db
			.update(storefront)
			.set({ nicheBrief: input.data.nicheBrief })
			.where(eq(storefront.id, event.params.id))
			.returning({ id: storefront.id });
		if (!updated) error(404, 'Storefront not found');
		await recordAdminAction(event, {
			action: 'storefront.niche-brief-update',
			entityType: 'storefront',
			entityId: updated.id
		});
		return { action: 'brief', success: 'Niche brief updated for admin and MCP.' };
	},

	manifest: async (event) => {
		const user = requireAdmin(event.locals);
		const raw = Object.fromEntries(await event.request.formData());
		const input = manifestActionSchema.safeParse(raw);
		if (!input.success)
			return fail(400, { action: 'manifest', error: 'Manifest input is incomplete.' });
		let manifest: unknown;
		try {
			manifest = JSON.parse(input.data.manifest);
		} catch {
			return fail(400, { action: 'manifest', error: 'Manifest must be valid JSON.' });
		}
		const parsed = brandManifestSchema.safeParse(manifest);
		if (!parsed.success) {
			return fail(400, {
				action: 'manifest',
				error: parsed.error.issues
					.slice(0, 8)
					.map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
					.join(' · ')
			});
		}
		const store = (
			await db.select().from(storefront).where(eq(storefront.id, event.params.id)).limit(1)
		)[0];
		if (!store) error(404, 'Storefront not found');
		if (parsed.data.identity.slug !== store.slug) {
			return fail(400, {
				action: 'manifest',
				error: 'Manifest identity.slug must match the storefront slug.'
			});
		}
		try {
			const result = await replaceStorefrontDraft(
				{
					storefrontId: store.id,
					expectedRevision: input.data.expectedRevision,
					manifest: parsed.data
				},
				{ subject: user.id, client: 'admin', requestId: event.locals.requestId }
			);
			return { action: 'manifest', success: `Draft revision ${result.revision} saved.` };
		} catch (cause) {
			console.error('Could not replace storefront draft', cause);
			return fail(409, {
				action: 'manifest',
				error: 'The draft changed or could not be saved. Reload before trying again.'
			});
		}
	},

	design: async (event) => {
		requireAdmin(event.locals);
		const input = familySchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, { action: 'design', error: 'Complete all design fields.' });
		const id = event.params.id;
		try {
			const created = await db.transaction(async (tx) => {
				await assertStorefrontCatalogMutable(tx, id);
				const [existing] = await tx
					.select({ id: storefront.id })
					.from(storefront)
					.where(eq(storefront.id, id))
					.limit(1);
				if (!existing) return null;
				const [family] = await tx
					.insert(designFamily)
					.values({ storefrontId: id, ...input.data })
					.returning();
				if (!family) throw new Error('Could not create design family');
				return family;
			});
			if (!created) error(404, 'Storefront not found');
			await recordAdminAction(event, {
				action: 'design-family.create',
				entityType: 'design-family',
				entityId: created.id
			});
			return { action: 'design', success: `${created.name} added.` };
		} catch (cause) {
			if (cause instanceof StorefrontCatalogFrozenError) {
				return fail(409, { action: 'design', error: cause.message });
			}
			console.error('Could not create design family', cause);
			return fail(409, { action: 'design', error: 'That design slug may already exist.' });
		}
	},

	designReview: async (event) => {
		requireAdmin(event.locals);
		const input = designReviewSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) {
			return fail(400, {
				action: 'designReview',
				error: 'Select both files, record provenance, and confirm the rights review.'
			});
		}
		const selectedAssets = await db
			.select({
				id: brandAsset.id,
				kind: brandAsset.kind,
				visibility: brandAsset.visibility
			})
			.from(brandAsset)
			.where(
				and(
					eq(brandAsset.storefrontId, event.params.id),
					inArray(brandAsset.id, [input.data.mockupAssetId, input.data.printFileAssetId]),
					isNotNull(brandAsset.confirmedAt)
				)
			);
		const mockup = selectedAssets.find((asset) => asset.id === input.data.mockupAssetId);
		const printFile = selectedAssets.find((asset) => asset.id === input.data.printFileAssetId);
		if (
			mockup?.kind !== 'image' ||
			printFile?.kind !== 'print-file' ||
			printFile.visibility !== 'private'
		) {
			return fail(400, {
				action: 'designReview',
				error:
					'The mockup must be an image and the production file must be a private print file from this storefront.'
			});
		}
		let familyId: string | null;
		try {
			familyId = await db.transaction(async (tx) => {
				await assertStorefrontCatalogMutable(tx, event.params.id);
				const [family] = await tx
					.select({ id: designFamily.id })
					.from(designFamily)
					.where(
						and(
							eq(designFamily.id, input.data.designFamilyId),
							eq(designFamily.storefrontId, event.params.id)
						)
					)
					.limit(1);
				if (!family) return null;
				await tx
					.update(designFamily)
					.set({
						mockupAssetId: mockup.id,
						printFileAssetId: printFile.id,
						provenanceNotes: input.data.provenanceNotes,
						rightsReviewedAt: new Date()
					})
					.where(eq(designFamily.id, family.id));
				return family.id;
			});
		} catch (cause) {
			if (cause instanceof StorefrontCatalogFrozenError) {
				return fail(409, { action: 'designReview', error: cause.message });
			}
			throw cause;
		}
		if (!familyId) error(404, 'Design family not found');
		await recordAdminAction(event, {
			action: 'design-family.rights-reviewed',
			entityType: 'design-family',
			entityId: familyId
		});
		return { action: 'designReview', success: 'Design files and rights review saved.' };
	},

	mapping: async (event) => {
		requireAdmin(event.locals);
		const input = mappingSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success)
			return fail(400, { action: 'mapping', error: 'Product mapping fields are invalid.' });
		const family = (
			await db
				.select()
				.from(designFamily)
				.where(
					and(
						eq(designFamily.id, input.data.designFamilyId),
						eq(designFamily.storefrontId, event.params.id)
					)
				)
				.limit(1)
		)[0];
		if (!family) error(404, 'Design family not found');
		try {
			const product = await shopifyStorefront.getProductByHandle(input.data.shopifyHandle);
			if (!product)
				return fail(404, {
					action: 'mapping',
					error: 'Shopify did not return that product handle.'
				});
			if (!shopifyProductSupportsUsMarket(product)) {
				return fail(400, {
					action: 'mapping',
					error:
						'Configure the shared Shopify US market so this product has at least one available variant and every variant is priced in USD.'
				});
			}
			const printfulProductId = input.data.printfulProductId || null;
			const result = await db.transaction(async (tx) => {
				await assertStorefrontCatalogMutable(tx, event.params.id);
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${'shopify-product:' + product.id}))`
				);
				const [existingIdentity] = await tx
					.select()
					.from(productMapping)
					.where(eq(productMapping.shopifyProductId, product.id))
					.limit(1)
					.for('update');
				if (
					existingIdentity &&
					(existingIdentity.designFamilyId !== family.id ||
						existingIdentity.garment !== input.data.garment)
				) {
					throw new ProductMappingIdentityConflictError(
						'That Shopify product is already assigned to a different design or garment. Product identities cannot be moved.'
					);
				}
				await tx
					.update(productMapping)
					.set({ active: false })
					.where(
						and(
							eq(productMapping.designFamilyId, family.id),
							eq(productMapping.garment, input.data.garment),
							eq(productMapping.active, true),
							existingIdentity ? ne(productMapping.id, existingIdentity.id) : sql`true`
						)
					);

				const [mapping] = existingIdentity
					? await tx
							.update(productMapping)
							.set({
								shopifyHandle: product.handle,
								printfulProductId,
								active: true,
								providerAvailable: true,
								productSnapshot: product
							})
							.where(eq(productMapping.id, existingIdentity.id))
							.returning()
					: await tx
							.insert(productMapping)
							.values({
								designFamilyId: family.id,
								garment: input.data.garment,
								shopifyProductId: product.id,
								shopifyHandle: product.handle,
								printfulProductId,
								active: true,
								providerAvailable: true,
								productSnapshot: product
							})
							.returning();
				if (!mapping) throw new Error('Could not save product mapping');
				return mapping;
			});
			await recordAdminAction(event, {
				action: 'product-mapping.import',
				entityType: 'product-mapping',
				entityId: result.id
			});
			return { action: 'mapping', success: `${product.title} mapped from Shopify.` };
		} catch (cause) {
			if (cause instanceof StorefrontCatalogFrozenError) {
				return fail(409, { action: 'mapping', error: cause.message });
			}
			if (cause instanceof ProductMappingIdentityConflictError) {
				return fail(409, { action: 'mapping', error: cause.message });
			}
			console.error('Could not import Shopify mapping', cause);
			return fail(502, {
				action: 'mapping',
				error: 'Shopify product import failed. Check the handle and Storefront API configuration.'
			});
		}
	},

	toggleMapping: async (event) => {
		requireAdmin(event.locals);
		const input = mappingToggleSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) return fail(400, { action: 'mapping', error: 'Invalid mapping action.' });
		let result: { missing: boolean; id: string | null };
		try {
			result = await db.transaction(async (tx) => {
				await assertStorefrontCatalogMutable(tx, event.params.id);
				const [owned] = await tx
					.select({
						id: productMapping.id,
						designFamilyId: productMapping.designFamilyId,
						garment: productMapping.garment
					})
					.from(productMapping)
					.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
					.where(
						and(
							eq(productMapping.id, input.data.mappingId),
							eq(designFamily.storefrontId, event.params.id)
						)
					)
					.limit(1);
				if (!owned) return { missing: true, id: null };
				if (input.data.active === 'true') {
					await tx
						.update(productMapping)
						.set({ active: false })
						.where(
							and(
								eq(productMapping.designFamilyId, owned.designFamilyId),
								eq(productMapping.garment, owned.garment),
								eq(productMapping.active, true),
								ne(productMapping.id, owned.id)
							)
						);
				}
				await tx
					.update(productMapping)
					.set({ active: input.data.active === 'true' })
					.where(eq(productMapping.id, owned.id));
				return { missing: false, id: owned.id };
			});
		} catch (cause) {
			if (cause instanceof StorefrontCatalogFrozenError) {
				return fail(409, { action: 'mapping', error: cause.message });
			}
			throw cause;
		}
		if (result.missing || !result.id) error(404, 'Product mapping not found');
		await recordAdminAction(event, {
			action:
				input.data.active === 'true' ? 'product-mapping.activate' : 'product-mapping.deactivate',
			entityType: 'product-mapping',
			entityId: result.id
		});
		return { action: 'mapping', success: 'Product mapping updated.' };
	},

	publish: async (event) => {
		const user = requireAdmin(event.locals);
		const input = publishSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) {
			return fail(400, {
				action: 'publish',
				error: 'Choose the experiment that will use this storefront revision.'
			});
		}
		const data = await storefrontData(event.params.id);
		const selectedExperiment = data.publishExperiments.find(
			(item) => item.id === input.data.experimentId
		);
		if (!selectedExperiment) {
			return fail(409, {
				action: 'publish',
				error:
					'The selected experiment must be planned or running and bound to this exact draft revision.'
			});
		}
		const readiness = publicationReadiness({
			manifest: data.draft.manifest,
			assets: data.assets.map((asset) => ({
				id: asset.id,
				kind: asset.kind,
				confirmedAt: asset.confirmedAt
			})),
			designFamilies: data.readinessDesignFamilies,
			heroProductMappingId: selectedExperiment.heroProductMappingId,
			publishedLegalTypes: data.publishedLegalTypes,
			supportContactConfigured: data.supportContactConfigured,
			experimentRevisionMatches: true,
			hasRunningRevisionConflict: data.runningRevisionConflict
		});
		if (readiness.length) {
			return fail(400, {
				action: 'publish',
				error: `Publication is not ready: ${readiness.map((issue) => issue.message).join(' ')}`
			});
		}
		if (!data.boundCatalogSnapshot) {
			return fail(400, {
				action: 'publish',
				error: 'Publication is not ready: the experiment has no valid frozen catalog snapshot.'
			});
		}
		try {
			await db.transaction(async (tx) => {
				await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.store.id}))`);
				const [currentStore] = await tx
					.select({ draftRevision: storefront.draftRevision })
					.from(storefront)
					.where(eq(storefront.id, data.store.id))
					.for('update');
				if (!currentStore || currentStore.draftRevision !== data.draft.revision) {
					throw new StorefrontPublicationConflictError(
						'The draft changed while publication was being prepared. Reload and try again.'
					);
				}
				const [currentRevision] = await tx
					.select({
						publishedAt: storefrontRevision.publishedAt,
						catalogSnapshot: storefrontRevision.catalogSnapshot,
						manifest: storefrontRevision.manifest
					})
					.from(storefrontRevision)
					.where(eq(storefrontRevision.id, data.draft.id))
					.for('update');
				if (!currentRevision || currentRevision.publishedAt) {
					throw new StorefrontPublicationConflictError(
						'This storefront revision was already published and cannot be overwritten.'
					);
				}
				const currentCatalogSnapshot = storefrontCatalogSnapshotSchema.safeParse(
					currentRevision.catalogSnapshot
				);
				if (!currentCatalogSnapshot.success) {
					throw new StorefrontPublicationConflictError(
						'The experiment-bound catalog snapshot is missing or invalid.'
					);
				}
				const currentWorkingCatalog = await readWorkingCatalogSnapshot(tx, data.store.id);
				if (!storefrontCatalogSnapshotsEqual(currentCatalogSnapshot.data, currentWorkingCatalog)) {
					throw new StorefrontPublicationConflictError(
						'The working Shopify catalog changed after this experiment was bound. End it, review the catalog, and create a new experiment.'
					);
				}
				const now = new Date();
				const [currentExperiment] = await tx
					.select({ id: experiment.id })
					.from(experiment)
					.where(
						and(
							eq(experiment.id, selectedExperiment.id),
							eq(experiment.storefrontId, data.store.id),
							eq(experiment.storefrontRevisionId, data.draft.id),
							isNull(experiment.endedAt),
							gt(experiment.endsAt, now)
						)
					)
					.limit(1);
				if (!currentExperiment) {
					throw new StorefrontPublicationConflictError(
						'The selected experiment ended or is no longer bound to this exact draft revision.'
					);
				}
				const [runningConflict] = await tx
					.select({ name: experiment.name })
					.from(experiment)
					.where(
						and(
							eq(experiment.storefrontId, data.store.id),
							isNull(experiment.endedAt),
							lte(experiment.startsAt, now),
							gt(experiment.endsAt, now),
							or(
								isNull(experiment.storefrontRevisionId),
								ne(experiment.storefrontRevisionId, data.draft.id)
							)
						)
					)
					.limit(1);
				if (runningConflict) {
					throw new StorefrontPublicationConflictError(
						`Experiment “${runningConflict.name}” is still running on a different revision. End it before publishing this draft.`
					);
				}
				const manifest = currentRevision.manifest as BrandManifest;
				const referenced = new Set<string>();
				if (manifest.seo.socialImageAssetId) referenced.add(manifest.seo.socialImageAssetId);
				for (const section of manifest.sections) {
					if ('imageAssetId' in section && section.imageAssetId) {
						referenced.add(section.imageAssetId);
					}
				}
				for (const design of currentCatalogSnapshot.data.designs) {
					if (design.mockupAssetId) referenced.add(design.mockupAssetId);
				}

				await promoteBrandAssets(
					{ storefrontId: data.store.id, assetIds: [...referenced] },
					{ subject: user.id, client: 'admin', requestId: event.locals.requestId }
				);
				const [publishedRevision] = await tx
					.update(storefrontRevision)
					.set({ publishedAt: new Date() })
					.where(
						and(eq(storefrontRevision.id, data.draft.id), isNull(storefrontRevision.publishedAt))
					)
					.returning({ id: storefrontRevision.id });
				if (!publishedRevision) {
					throw new StorefrontPublicationConflictError(
						'This storefront revision was already published and cannot be overwritten.'
					);
				}
				await tx
					.update(storefront)
					.set({ status: 'live', publishedRevisionId: data.draft.id })
					.where(eq(storefront.id, data.store.id));
			});
		} catch (cause) {
			if (cause instanceof StorefrontPublicationConflictError) {
				return fail(409, { action: 'publish', error: cause.message });
			}
			throw cause;
		}
		await recordAdminAction(event, {
			action: 'storefront.publish',
			entityType: 'storefront',
			entityId: data.store.id,
			afterRevision: data.draft.revision
		});
		return { action: 'publish', success: `Revision ${data.draft.revision} is live.` };
	},

	archive: async (event) => {
		requireAdmin(event.locals);
		const [updated] = await db
			.update(storefront)
			.set({ status: 'archived' })
			.where(eq(storefront.id, event.params.id))
			.returning({ id: storefront.id });
		if (!updated) error(404, 'Storefront not found');
		await recordAdminAction(event, {
			action: 'storefront.archive',
			entityType: 'storefront',
			entityId: updated.id
		});
		return { action: 'archive', success: 'Storefront archived.' };
	}
};
