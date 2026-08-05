import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { brandManifestSchema, defaultBrandManifest, type BrandManifest } from '$lib/domain/brand';
import { reservedSubdomains } from '$lib/domain/tenancy';
import { db } from '$lib/server/db';
import {
	auditEvent,
	brandAsset,
	designFamily,
	storefront,
	storefrontRevision
} from '$lib/server/db/schema';
import { buildAuditValues, type Actor } from './audit';
import { assertStorefrontCatalogMutable } from './experiments';

export class DraftConflictError extends Error {
	constructor() {
		super('The storefront draft changed; read the latest revision and retry');
		this.name = 'DraftConflictError';
	}
}

const createInputSchema = z.object({
	slug: z
		.string()
		.min(2)
		.max(48)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.refine((value) => !reservedSubdomains.has(value), 'This storefront slug is reserved'),
	name: z.string().trim().min(2).max(64),
	nicheBrief: z.string().trim().min(1).max(4000),
	manifest: brandManifestSchema.optional()
});

export type StorefrontDraft = {
	id: string;
	slug: string;
	name: string;
	nicheBrief: string;
	status: string;
	revision: number;
	manifest: BrandManifest;
	publishedRevisionId: string | null;
	updatedAt: Date;
};

export async function listStorefrontDrafts(): Promise<StorefrontDraft[]> {
	const rows = await db
		.select({
			id: storefront.id,
			slug: storefront.slug,
			name: storefront.name,
			nicheBrief: storefront.nicheBrief,
			status: storefront.status,
			revision: storefront.draftRevision,
			manifest: storefrontRevision.manifest,
			publishedRevisionId: storefront.publishedRevisionId,
			updatedAt: storefront.updatedAt
		})
		.from(storefront)
		.innerJoin(
			storefrontRevision,
			and(
				eq(storefrontRevision.storefrontId, storefront.id),
				eq(storefrontRevision.revision, storefront.draftRevision)
			)
		)
		.orderBy(desc(storefront.updatedAt));
	return rows.map(parseDraftRow);
}

export async function getStorefrontDraft(storefrontId: string): Promise<StorefrontDraft | null> {
	const id = z.string().uuid().parse(storefrontId);
	const [row] = await db
		.select({
			id: storefront.id,
			slug: storefront.slug,
			name: storefront.name,
			nicheBrief: storefront.nicheBrief,
			status: storefront.status,
			revision: storefront.draftRevision,
			manifest: storefrontRevision.manifest,
			publishedRevisionId: storefront.publishedRevisionId,
			updatedAt: storefront.updatedAt
		})
		.from(storefront)
		.innerJoin(
			storefrontRevision,
			and(
				eq(storefrontRevision.storefrontId, storefront.id),
				eq(storefrontRevision.revision, storefront.draftRevision)
			)
		)
		.where(eq(storefront.id, id))
		.limit(1);
	return row ? parseDraftRow(row) : null;
}

export async function createStorefrontDraft(
	input: z.input<typeof createInputSchema>,
	actor: Actor
): Promise<StorefrontDraft> {
	const parsed = createInputSchema.parse(input);
	const manifest = parsed.manifest ?? defaultBrandManifest(parsed.slug, parsed.name);
	if (manifest.identity.slug !== parsed.slug)
		throw new Error('Manifest identity slug must match storefront slug');

	const id = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(storefront)
			.values({
				slug: parsed.slug,
				name: parsed.name,
				nicheBrief: parsed.nicheBrief,
				draftRevision: 1
			})
			.returning({ id: storefront.id });
		if (!created) throw new Error('Could not create storefront');
		await tx.insert(storefrontRevision).values({
			storefrontId: created.id,
			revision: 1,
			manifest,
			createdBy: actor.subject
		});
		await tx.insert(auditEvent).values(
			buildAuditValues({
				actor,
				action: 'storefront.draft-created',
				entityType: 'storefront',
				entityId: created.id,
				input: { slug: parsed.slug, name: parsed.name, nicheBrief: parsed.nicheBrief, manifest },
				afterRevision: 1
			})
		);
		return created.id;
	});
	const created = await getStorefrontDraft(id);
	if (!created) throw new Error('Created storefront draft could not be read');
	return created;
}

export async function replaceStorefrontDraft(
	input: { storefrontId: string; expectedRevision: number; manifest: BrandManifest },
	actor: Actor
): Promise<StorefrontDraft> {
	const parsed = z
		.object({
			storefrontId: z.string().uuid(),
			expectedRevision: z.number().int().positive(),
			manifest: brandManifestSchema
		})
		.parse(input);
	await db.transaction(async (tx) => {
		await assertStorefrontCatalogMutable(tx, parsed.storefrontId);
		const [updated] = await tx
			.update(storefront)
			.set({ draftRevision: parsed.expectedRevision + 1 })
			.where(
				and(
					eq(storefront.id, parsed.storefrontId),
					eq(storefront.draftRevision, parsed.expectedRevision),
					eq(storefront.slug, parsed.manifest.identity.slug)
				)
			)
			.returning({ id: storefront.id });
		if (!updated) throw new DraftConflictError();
		await tx.insert(storefrontRevision).values({
			storefrontId: parsed.storefrontId,
			revision: parsed.expectedRevision + 1,
			manifest: parsed.manifest,
			createdBy: actor.subject
		});
		await tx.insert(auditEvent).values(
			buildAuditValues({
				actor,
				action: 'storefront.draft-replaced',
				entityType: 'storefront',
				entityId: parsed.storefrontId,
				input: parsed.manifest,
				beforeRevision: parsed.expectedRevision,
				afterRevision: parsed.expectedRevision + 1
			})
		);
	});
	const updated = await getStorefrontDraft(parsed.storefrontId);
	if (!updated) throw new Error('Updated storefront draft could not be read');
	return updated;
}

export async function validateStorefrontDraft(storefrontId: string) {
	const draft = await getStorefrontDraft(storefrontId);
	if (!draft)
		return { valid: false, issues: [{ code: 'not-found', message: 'Storefront not found' }] };
	const manifest = brandManifestSchema.safeParse(draft.manifest);
	if (!manifest.success) {
		return {
			valid: false,
			issues: manifest.error.issues.map((issue) => ({
				code: 'manifest-invalid',
				message: issue.message,
				path: issue.path.map(String).join('.')
			}))
		};
	}
	const assetIds = referencedAssetIds(manifest.data);
	const familyIds = referencedDesignFamilyIds(manifest.data);
	const [assets, families] = await Promise.all([
		assetIds.length
			? db
					.select({
						id: brandAsset.id,
						kind: brandAsset.kind,
						confirmedAt: brandAsset.confirmedAt
					})
					.from(brandAsset)
					.where(and(eq(brandAsset.storefrontId, storefrontId), inArray(brandAsset.id, assetIds)))
			: [],
		familyIds.length
			? db
					.select({ id: designFamily.id })
					.from(designFamily)
					.where(
						and(eq(designFamily.storefrontId, storefrontId), inArray(designFamily.id, familyIds))
					)
			: []
	]);
	const presentAssets = new Set(assets.map((asset) => asset.id));
	const confirmedAssets = new Set(
		assets.filter((asset) => asset.confirmedAt !== null).map((asset) => asset.id)
	);
	const imageAssets = new Set(
		assets.filter((asset) => asset.kind === 'image').map((asset) => asset.id)
	);
	const presentFamilies = new Set(families.map((family) => family.id));
	const issues = [
		...assetIds
			.filter((id) => !presentAssets.has(id))
			.map((id) => ({ code: 'asset-missing', message: `Referenced asset ${id} is missing` })),
		...assetIds
			.filter((id) => presentAssets.has(id) && !confirmedAssets.has(id))
			.map((id) => ({
				code: 'asset-unconfirmed',
				message: `Referenced asset ${id} has not finished uploading`
			})),
		...assetIds
			.filter((id) => presentAssets.has(id) && !imageAssets.has(id))
			.map((id) => ({
				code: 'asset-kind-invalid',
				message: `Referenced visual asset ${id} must be an image`
			})),
		...familyIds
			.filter((id) => !presentFamilies.has(id))
			.map((id) => ({ code: 'design-missing', message: `Referenced design ${id} is missing` }))
	];
	return { valid: issues.length === 0, issues };
}

function parseDraftRow(row: {
	id: string;
	slug: string;
	name: string;
	nicheBrief: string;
	status: string;
	revision: number;
	manifest: unknown;
	publishedRevisionId: string | null;
	updatedAt: Date;
}): StorefrontDraft {
	return { ...row, manifest: brandManifestSchema.parse(row.manifest) };
}

function referencedAssetIds(manifest: BrandManifest) {
	const ids = new Set<string>();
	if (manifest.seo.socialImageAssetId) ids.add(manifest.seo.socialImageAssetId);
	for (const section of manifest.sections) {
		if ('imageAssetId' in section && section.imageAssetId) ids.add(section.imageAssetId);
	}
	return [...ids];
}

function referencedDesignFamilyIds(manifest: BrandManifest) {
	return manifest.sections
		.filter(
			(
				section
			): section is Extract<(typeof manifest.sections)[number], { type: 'featured-design' }> =>
				section.type === 'featured-design'
		)
		.map((section) => section.designFamilyId);
}
