import { db } from '$lib/server/db';
import { publicationReadiness, requiredLegalDocuments } from '$lib/domain/readiness';
import {
	createStorefrontCatalogSnapshot,
	storefrontCatalogSnapshotSchema
} from '$lib/domain/storefront-catalog';
import {
	campaignMapping,
	brandAsset,
	designFamily,
	experiment,
	productMapping,
	storefront,
	storefrontRevision
} from '$lib/server/db/schema';
import { and, asc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

export class ExperimentWindowConflictError extends Error {
	constructor(conflictingName: string) {
		super(`The date window overlaps the non-ended experiment “${conflictingName}”.`);
		this.name = 'ExperimentWindowConflictError';
	}
}

export class ExperimentFrozenError extends Error {
	constructor() {
		super('A running or ended experiment is frozen. Create a new experiment for changed inputs.');
		this.name = 'ExperimentFrozenError';
	}
}

export class StorefrontCatalogFrozenError extends Error {
	constructor(public readonly conflictingName: string) {
		super(
			`The working catalog is frozen while experiment “${conflictingName}” is planned or running.`
		);
		this.name = 'StorefrontCatalogFrozenError';
	}
}

export class ExperimentHeroProductError extends Error {
	constructor() {
		super('The hero product must be an active T-shirt mapping owned by the storefront.');
		this.name = 'ExperimentHeroProductError';
	}
}

export class ExperimentCatalogSnapshotError extends Error {
	constructor(
		message = 'The working catalog contains invalid Shopify display data and cannot be frozen.'
	) {
		super(message);
		this.name = 'ExperimentCatalogSnapshotError';
	}
}

type NewExperiment = typeof experiment.$inferInsert;
type NewExperimentInput = Omit<NewExperiment, 'storefrontRevisionId'> & { createdBy?: string };
type ExperimentChanges = Pick<
	NewExperiment,
	'name' | 'heroProductMappingId' | 'heroCreativeAssetId' | 'startsAt' | 'endsAt' | 'budgetMinor'
>;

async function lockStorefront(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	storefrontId: string
) {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${storefrontId}))`);
}

export async function assertStorefrontCatalogMutable(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	storefrontId: string
) {
	await lockStorefront(tx, storefrontId);
	const [conflict] = await tx
		.select({ name: experiment.name })
		.from(experiment)
		.where(and(eq(experiment.storefrontId, storefrontId), isNull(experiment.endedAt)))
		.limit(1);
	if (conflict) throw new StorefrontCatalogFrozenError(conflict.name);
}

export async function createNonOverlappingExperiment(values: NewExperimentInput) {
	return db.transaction(async (tx) => {
		await lockStorefront(tx, values.storefrontId);
		const [conflict] = await tx
			.select({ name: experiment.name })
			.from(experiment)
			.where(
				and(
					eq(experiment.storefrontId, values.storefrontId),
					isNull(experiment.endedAt),
					lt(experiment.startsAt, values.endsAt),
					gt(experiment.endsAt, values.startsAt)
				)
			)
			.limit(1);
		if (conflict) throw new ExperimentWindowConflictError(conflict.name);
		const [catalogFreezingExperiment] = await tx
			.select({ id: experiment.id })
			.from(experiment)
			.where(
				and(
					eq(experiment.storefrontId, values.storefrontId),
					isNull(experiment.endedAt),
					gt(experiment.endsAt, new Date())
				)
			)
			.limit(1);

		const [hero] = await tx
			.select({ id: productMapping.id })
			.from(productMapping)
			.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
			.where(
				and(
					eq(productMapping.id, values.heroProductMappingId),
					eq(productMapping.garment, 'tshirt'),
					eq(productMapping.active, true),
					eq(productMapping.providerAvailable, true),
					eq(designFamily.storefrontId, values.storefrontId)
				)
			)
			.limit(1);
		if (!hero) throw new ExperimentHeroProductError();

		const [store] = await tx
			.select({
				id: storefront.id,
				draftRevision: storefront.draftRevision,
				publishedRevisionId: storefront.publishedRevisionId
			})
			.from(storefront)
			.where(eq(storefront.id, values.storefrontId))
			.for('update');
		if (!store) throw new Error('Storefront not found');
		const [currentDraft] = await tx
			.select({
				id: storefrontRevision.id,
				manifest: storefrontRevision.manifest,
				catalogSnapshot: storefrontRevision.catalogSnapshot,
				publishedAt: storefrontRevision.publishedAt
			})
			.from(storefrontRevision)
			.where(
				and(
					eq(storefrontRevision.storefrontId, store.id),
					eq(storefrontRevision.revision, store.draftRevision)
				)
			)
			.limit(1);
		if (!currentDraft) throw new Error('Storefront draft not found');

		let revisionId = currentDraft.id;
		let catalogSnapshot = currentDraft.catalogSnapshot;
		if (
			currentDraft.publishedAt ||
			store.publishedRevisionId === currentDraft.id ||
			(currentDraft.catalogSnapshot && !catalogFreezingExperiment)
		) {
			const nextRevision = store.draftRevision + 1;
			const [fork] = await tx
				.insert(storefrontRevision)
				.values({
					storefrontId: store.id,
					revision: nextRevision,
					manifest: currentDraft.manifest,
					createdBy: values.createdBy
				})
				.returning({ id: storefrontRevision.id });
			if (!fork) throw new Error('Could not fork the published storefront revision');
			await tx
				.update(storefront)
				.set({ draftRevision: nextRevision })
				.where(eq(storefront.id, store.id));
			revisionId = fork.id;
			catalogSnapshot = null;
		}

		if (!catalogSnapshot) {
			try {
				await assertWorkingCatalogReady(
					tx,
					store.id,
					currentDraft.manifest,
					values.heroProductMappingId
				);
				catalogSnapshot = await readWorkingCatalogSnapshot(tx, store.id);
			} catch (cause) {
				if (cause instanceof ExperimentCatalogSnapshotError) throw cause;
				throw new ExperimentCatalogSnapshotError();
			}
			const [frozen] = await tx
				.update(storefrontRevision)
				.set({ catalogSnapshot })
				.where(
					and(
						eq(storefrontRevision.id, revisionId),
						isNull(storefrontRevision.catalogSnapshot),
						isNull(storefrontRevision.publishedAt)
					)
				)
				.returning({ id: storefrontRevision.id });
			if (!frozen) throw new Error('Could not freeze the storefront catalog revision');
		}
		const frozenCatalog = storefrontCatalogSnapshotSchema.safeParse(catalogSnapshot);
		if (
			!frozenCatalog.success ||
			!frozenCatalog.data.designs.some((design) =>
				design.products.some(
					(product) =>
						product.mappingId === values.heroProductMappingId && product.garment === 'tshirt'
				)
			)
		) {
			throw new ExperimentHeroProductError();
		}

		const { createdBy: _createdBy, ...experimentValues } = values;
		void _createdBy;
		const [created] = await tx
			.insert(experiment)
			.values({ ...experimentValues, storefrontRevisionId: revisionId })
			.returning();
		if (!created) throw new Error('Could not create experiment');
		return created;
	});
}

export async function readWorkingCatalogSnapshot(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	storefrontId: string
) {
	const designs = await tx
		.select({
			id: designFamily.id,
			slug: designFamily.slug,
			name: designFamily.name,
			description: designFamily.description,
			mockupAssetId: designFamily.mockupAssetId
		})
		.from(designFamily)
		.where(eq(designFamily.storefrontId, storefrontId))
		.orderBy(asc(designFamily.createdAt))
		.for('share');
	const mappings =
		designs.length === 0
			? []
			: await tx
					.select({
						id: productMapping.id,
						designFamilyId: productMapping.designFamilyId,
						garment: productMapping.garment,
						shopifyProductId: productMapping.shopifyProductId,
						shopifyHandle: productMapping.shopifyHandle,
						active: productMapping.active,
						providerAvailable: productMapping.providerAvailable,
						productSnapshot: productMapping.productSnapshot
					})
					.from(productMapping)
					.where(
						inArray(
							productMapping.designFamilyId,
							designs.map((design) => design.id)
						)
					)
					.for('share');
	return createStorefrontCatalogSnapshot(
		designs.map((design) => ({
			...design,
			mappings: mappings.filter((mapping) => mapping.designFamilyId === design.id)
		}))
	);
}

async function assertWorkingCatalogReady(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	storefrontId: string,
	manifest: unknown,
	heroProductMappingId: string
) {
	const designs = await tx
		.select({
			id: designFamily.id,
			mockupAssetId: designFamily.mockupAssetId,
			printFileAssetId: designFamily.printFileAssetId,
			provenanceNotes: designFamily.provenanceNotes,
			rightsReviewedAt: designFamily.rightsReviewedAt
		})
		.from(designFamily)
		.where(eq(designFamily.storefrontId, storefrontId))
		.orderBy(asc(designFamily.createdAt))
		.for('share');
	const [assets, mappings] = await Promise.all([
		tx
			.select({ id: brandAsset.id, kind: brandAsset.kind, confirmedAt: brandAsset.confirmedAt })
			.from(brandAsset)
			.where(eq(brandAsset.storefrontId, storefrontId))
			.for('share'),
		designs.length === 0
			? Promise.resolve([])
			: tx
					.select({
						id: productMapping.id,
						designFamilyId: productMapping.designFamilyId,
						garment: productMapping.garment,
						active: productMapping.active,
						providerAvailable: productMapping.providerAvailable,
						productSnapshot: productMapping.productSnapshot
					})
					.from(productMapping)
					.where(
						inArray(
							productMapping.designFamilyId,
							designs.map((design) => design.id)
						)
					)
					.for('share')
	]);
	const issues = publicationReadiness({
		manifest,
		assets,
		designFamilies: designs.map((design) => ({
			...design,
			mappings: mappings.filter((mapping) => mapping.designFamilyId === design.id)
		})),
		heroProductMappingId,
		publishedLegalTypes: [...requiredLegalDocuments],
		supportContactConfigured: true,
		experimentRevisionMatches: true,
		hasRunningRevisionConflict: false
	});
	if (issues.length > 0) {
		throw new ExperimentCatalogSnapshotError(
			`The working catalog is not ready to freeze: ${issues.map((issue) => issue.message).join(' ')}`
		);
	}
}

export async function updateNonOverlappingPlannedExperiment(input: {
	id: string;
	storefrontId: string;
	changes: ExperimentChanges;
	now?: Date;
}) {
	return db.transaction(async (tx) => {
		await lockStorefront(tx, input.storefrontId);
		const now = input.now ?? new Date();
		const [current] = await tx
			.select({
				id: experiment.id,
				startsAt: experiment.startsAt,
				endedAt: experiment.endedAt,
				catalogSnapshot: storefrontRevision.catalogSnapshot
			})
			.from(experiment)
			.innerJoin(storefrontRevision, eq(experiment.storefrontRevisionId, storefrontRevision.id))
			.where(and(eq(experiment.id, input.id), eq(experiment.storefrontId, input.storefrontId)))
			.limit(1);
		if (!current) throw new Error('Experiment not found');
		if (current.endedAt || current.startsAt <= now) throw new ExperimentFrozenError();
		const frozenCatalog = storefrontCatalogSnapshotSchema.safeParse(current.catalogSnapshot);
		if (
			!frozenCatalog.success ||
			!frozenCatalog.data.designs.some((design) =>
				design.products.some(
					(product) =>
						product.mappingId === input.changes.heroProductMappingId && product.garment === 'tshirt'
				)
			)
		) {
			throw new ExperimentHeroProductError();
		}

		const [conflict] = await tx
			.select({ name: experiment.name })
			.from(experiment)
			.where(
				and(
					eq(experiment.storefrontId, input.storefrontId),
					ne(experiment.id, input.id),
					isNull(experiment.endedAt),
					lt(experiment.startsAt, input.changes.endsAt),
					gt(experiment.endsAt, input.changes.startsAt)
				)
			)
			.limit(1);
		if (conflict) throw new ExperimentWindowConflictError(conflict.name);

		const [updated] = await tx
			.update(experiment)
			.set(input.changes)
			.where(eq(experiment.id, input.id))
			.returning();
		if (!updated) throw new Error('Could not update experiment');
		return updated;
	});
}

export async function savePlannedCampaignMapping(input: {
	experimentId: string;
	campaignId: string;
	adSetId: string | null;
	adId: string | null;
	now?: Date;
}) {
	return db.transaction(async (tx) => {
		const [identity] = await tx
			.select({ storefrontId: experiment.storefrontId })
			.from(experiment)
			.where(eq(experiment.id, input.experimentId))
			.limit(1);
		if (!identity) throw new Error('Experiment not found');
		await lockStorefront(tx, identity.storefrontId);

		const now = input.now ?? new Date();
		const [planned] = await tx
			.select({ id: experiment.id })
			.from(experiment)
			.where(
				and(
					eq(experiment.id, input.experimentId),
					gt(experiment.startsAt, now),
					isNull(experiment.endedAt)
				)
			)
			.limit(1);
		if (!planned) throw new ExperimentFrozenError();

		const [mapping] = await tx
			.insert(campaignMapping)
			.values({
				experimentId: input.experimentId,
				campaignId: input.campaignId,
				adSetId: input.adSetId,
				adId: input.adId,
				trackingToken: randomBytes(18).toString('base64url')
			})
			.onConflictDoUpdate({
				target: campaignMapping.experimentId,
				set: {
					campaignId: input.campaignId,
					adSetId: input.adSetId,
					adId: input.adId
				}
			})
			.returning();
		if (!mapping) throw new Error('Could not save campaign mapping');
		return mapping;
	});
}

export async function endExperiment(input: { experimentId: string; endedAt?: Date }) {
	return db.transaction(async (tx) => {
		const [identity] = await tx
			.select({ storefrontId: experiment.storefrontId })
			.from(experiment)
			.where(eq(experiment.id, input.experimentId))
			.limit(1);
		if (!identity) return null;
		await lockStorefront(tx, identity.storefrontId);
		const [ended] = await tx
			.update(experiment)
			.set({ endedAt: input.endedAt ?? new Date() })
			.where(and(eq(experiment.id, input.experimentId), isNull(experiment.endedAt)))
			.returning({ id: experiment.id });
		return { id: input.experimentId, changed: Boolean(ended) };
	});
}
