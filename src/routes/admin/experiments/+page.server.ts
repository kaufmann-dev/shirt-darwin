import { deriveExperimentLifecycle } from '$lib/domain/experiment';
import { db } from '$lib/server/db';
import {
	brandAsset,
	designFamily,
	experiment,
	productMapping,
	storefront
} from '$lib/server/db/schema';
import {
	createNonOverlappingExperiment,
	ExperimentCatalogSnapshotError,
	ExperimentHeroProductError,
	ExperimentWindowConflictError
} from '$lib/server/services/experiments';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { recordAdminAction, requireAdmin } from '../_auth.server';
import type { Actions, PageServerLoad } from './$types';

const experimentSchema = z.object({
	storefrontId: z.string().uuid(),
	heroProductMappingId: z.string().uuid(),
	heroCreativeAssetId: z.union([z.string().uuid(), z.literal('')]).optional(),
	name: z.string().trim().min(2).max(120),
	startsAt: z.string().datetime({ local: true }),
	endsAt: z.string().datetime({ local: true }),
	budgetUsd: z
		.string()
		.regex(/^\d{1,7}(?:\.\d{1,2})?$/, 'Use a USD amount with at most two decimals')
});

function dollarsToMinor(value: string) {
	const [whole, fraction = ''] = value.split('.');
	return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function parseUtcLocal(value: string) {
	return new Date(`${value}Z`);
}

export const load: PageServerLoad = async () => {
	const [experiments, heroProducts, heroAssets] = await Promise.all([
		db
			.select({
				id: experiment.id,
				name: experiment.name,
				startsAt: experiment.startsAt,
				endsAt: experiment.endsAt,
				endedAt: experiment.endedAt,
				budgetMinor: experiment.budgetMinor,
				budgetCurrency: experiment.budgetCurrency,
				outcome: experiment.outcome,
				storefrontName: storefront.name,
				storefrontSlug: storefront.slug
			})
			.from(experiment)
			.innerJoin(storefront, eq(experiment.storefrontId, storefront.id))
			.orderBy(desc(experiment.startsAt))
			.limit(100),
		db
			.select({
				id: productMapping.id,
				storefrontId: designFamily.storefrontId,
				storefrontName: storefront.name,
				designName: designFamily.name,
				shopifyHandle: productMapping.shopifyHandle
			})
			.from(productMapping)
			.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
			.innerJoin(storefront, eq(designFamily.storefrontId, storefront.id))
			.where(
				and(
					eq(productMapping.garment, 'tshirt'),
					eq(productMapping.active, true),
					eq(productMapping.providerAvailable, true)
				)
			)
			.orderBy(asc(storefront.name), asc(designFamily.name)),
		db
			.select({
				id: brandAsset.id,
				storefrontId: brandAsset.storefrontId,
				originalName: brandAsset.originalName
			})
			.from(brandAsset)
			.where(and(eq(brandAsset.kind, 'video'), isNotNull(brandAsset.confirmedAt)))
			.orderBy(desc(brandAsset.createdAt))
	]);

	return {
		experiments: experiments.map((row) => ({
			...row,
			lifecycle: deriveExperimentLifecycle(row.startsAt, row.endsAt, row.endedAt)
		})),
		heroProducts,
		heroAssets
	};
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireAdmin(event.locals);
		const input = experimentSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!input.success) {
			return fail(400, {
				action: 'create',
				error: input.error.issues.map((issue) => issue.message).join(' ')
			});
		}
		const startsAt = parseUtcLocal(input.data.startsAt);
		const endsAt = parseUtcLocal(input.data.endsAt);
		if (!(endsAt > startsAt))
			return fail(400, { action: 'create', error: 'End must be after start.' });
		const hero = (
			await db
				.select({ id: productMapping.id })
				.from(productMapping)
				.innerJoin(designFamily, eq(productMapping.designFamilyId, designFamily.id))
				.where(
					and(
						eq(productMapping.id, input.data.heroProductMappingId),
						eq(productMapping.garment, 'tshirt'),
						eq(productMapping.active, true),
						eq(productMapping.providerAvailable, true),
						eq(designFamily.storefrontId, input.data.storefrontId)
					)
				)
				.limit(1)
		)[0];
		if (!hero)
			return fail(400, {
				action: 'create',
				error: 'Select an active T-shirt from the chosen storefront.'
			});
		if (input.data.heroCreativeAssetId) {
			const asset = (
				await db
					.select({ id: brandAsset.id })
					.from(brandAsset)
					.where(
						and(
							eq(brandAsset.id, input.data.heroCreativeAssetId),
							eq(brandAsset.storefrontId, input.data.storefrontId),
							eq(brandAsset.kind, 'video'),
							isNotNull(brandAsset.confirmedAt)
						)
					)
					.limit(1)
			)[0];
			if (!asset)
				return fail(400, { action: 'create', error: 'Hero video must belong to the storefront.' });
		}
		let created: typeof experiment.$inferSelect;
		try {
			created = await createNonOverlappingExperiment({
				storefrontId: input.data.storefrontId,
				heroProductMappingId: hero.id,
				heroCreativeAssetId: input.data.heroCreativeAssetId || null,
				name: input.data.name,
				startsAt,
				endsAt,
				budgetMinor: dollarsToMinor(input.data.budgetUsd),
				budgetCurrency: 'USD',
				createdBy: user.id
			});
		} catch (cause) {
			if (cause instanceof ExperimentWindowConflictError) {
				return fail(409, { action: 'create', error: cause.message });
			}
			if (cause instanceof ExperimentHeroProductError) {
				return fail(409, { action: 'create', error: cause.message });
			}
			if (cause instanceof ExperimentCatalogSnapshotError) {
				return fail(409, { action: 'create', error: cause.message });
			}
			throw cause;
		}
		await recordAdminAction(event, {
			action: 'experiment.create',
			entityType: 'experiment',
			entityId: created.id
		});
		redirect(303, `/admin/experiments/${created.id}`);
	}
};
