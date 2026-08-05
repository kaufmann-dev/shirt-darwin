import { brandManifestSchema, type BrandManifest } from './brand';

export const requiredLegalDocuments = ['imprint', 'privacy', 'terms', 'returns'] as const;
export const requiredGarments = ['tshirt', 'hoodie', 'crewneck'] as const;

export interface ReadinessDesignFamily {
	id: string;
	mockupAssetId: string | null;
	printFileAssetId: string | null;
	provenanceNotes: string;
	rightsReviewedAt: Date | string | null;
	mappings: Array<{
		id: string;
		garment: string;
		active: boolean;
		providerAvailable: boolean;
		productSnapshot: Record<string, unknown>;
	}>;
}

export interface PublicationReadinessInput {
	manifest: unknown;
	assets: Array<{ id: string; kind: string; confirmedAt: Date | string | null }>;
	designFamilies: ReadinessDesignFamily[];
	heroProductMappingId: string | null;
	publishedLegalTypes: string[];
	supportContactConfigured: boolean;
	experimentRevisionMatches: boolean;
	hasRunningRevisionConflict: boolean;
}

export interface ReadinessIssue {
	code: string;
	message: string;
}

function referencedAssetIds(manifest: BrandManifest) {
	const ids = new Set<string>();
	if (manifest.seo.socialImageAssetId) ids.add(manifest.seo.socialImageAssetId);
	for (const section of manifest.sections) {
		if ('imageAssetId' in section && section.imageAssetId) ids.add(section.imageAssetId);
	}
	return ids;
}

function snapshotSupportsUsMarket(snapshot: Record<string, unknown>): boolean {
	if (!Array.isArray(snapshot.variants)) return false;
	const variants = snapshot.variants.filter(
		(variant): variant is Record<string, unknown> => typeof variant === 'object' && variant !== null
	);
	return (
		variants.length === snapshot.variants.length &&
		variants.some((variant) => variant.availableForSale === true) &&
		variants.every((variant) => {
			const price = variant.price;
			return (
				typeof price === 'object' &&
				price !== null &&
				'currencyCode' in price &&
				price.currencyCode === 'USD'
			);
		})
	);
}

export function publicationReadiness(input: PublicationReadinessInput): ReadinessIssue[] {
	const issues: ReadinessIssue[] = [];
	const parsed = brandManifestSchema.safeParse(input.manifest);
	if (!parsed.success) {
		return [{ code: 'manifest-invalid', message: 'The brand manifest is invalid.' }];
	}

	const availableAssets = new Map(input.assets.map((asset) => [asset.id, asset]));
	for (const assetId of referencedAssetIds(parsed.data)) {
		const asset = availableAssets.get(assetId);
		if (!asset) {
			issues.push({
				code: `asset-missing:${assetId}`,
				message: 'A referenced brand asset is missing.'
			});
		} else if (!asset.confirmedAt) {
			issues.push({
				code: `asset-unconfirmed:${assetId}`,
				message: 'A referenced brand asset has not finished uploading.'
			});
		} else if (asset.kind !== 'image') {
			issues.push({
				code: `asset-kind-invalid:${assetId}`,
				message: 'Every manifest image reference must point to an image asset.'
			});
		}
	}

	if (input.designFamilies.length !== 3) {
		issues.push({
			code: 'design-family-count',
			message: 'The initial storefront requires exactly three designs.'
		});
	}
	for (const family of input.designFamilies) {
		const mockup = family.mockupAssetId ? availableAssets.get(family.mockupAssetId) : null;
		if (!mockup) {
			issues.push({
				code: `design-mockup-missing:${family.id}`,
				message: `Design ${family.id} is missing its storefront mockup.`
			});
		} else if (!mockup.confirmedAt) {
			issues.push({
				code: `design-mockup-unconfirmed:${family.id}`,
				message: `Design ${family.id} has a mockup upload that is not confirmed.`
			});
		} else if (mockup.kind !== 'image') {
			issues.push({
				code: `design-mockup-kind-invalid:${family.id}`,
				message: `Design ${family.id} must use an image as its storefront mockup.`
			});
		}

		const printFile = family.printFileAssetId ? availableAssets.get(family.printFileAssetId) : null;
		if (!printFile) {
			issues.push({
				code: `design-print-file-missing:${family.id}`,
				message: `Design ${family.id} is missing its private production print file.`
			});
		} else if (!printFile.confirmedAt) {
			issues.push({
				code: `design-print-file-unconfirmed:${family.id}`,
				message: `Design ${family.id} has a production upload that is not confirmed.`
			});
		} else if (printFile.kind !== 'print-file') {
			issues.push({
				code: `design-print-file-kind-invalid:${family.id}`,
				message: `Design ${family.id} must use a private PNG production print file.`
			});
		}
		if (!family.provenanceNotes.trim()) {
			issues.push({
				code: `design-provenance-missing:${family.id}`,
				message: `Design ${family.id} is missing provenance notes.`
			});
		}
		if (!family.rightsReviewedAt) {
			issues.push({
				code: `design-rights-review-missing:${family.id}`,
				message: `Design ${family.id} still needs a recorded rights review.`
			});
		}
		const readyMappings = family.mappings.filter(
			(mapping) => mapping.active && mapping.providerAvailable
		);
		const activeGarments = new Set(readyMappings.map((mapping) => mapping.garment));
		for (const mapping of family.mappings.filter((item) => item.active)) {
			if (!mapping.providerAvailable) {
				issues.push({
					code: `product-provider-unavailable:${mapping.id}`,
					message:
						'This active product is unavailable from Shopify. Restore it in the US market or map a replacement.'
				});
				continue;
			}
			if (!snapshotSupportsUsMarket(mapping.productSnapshot)) {
				issues.push({
					code: `product-us-market-invalid:${mapping.id}`,
					message:
						'Configure the shared Shopify US market so every mapped product has at least one available variant and every variant is priced in USD.'
				});
			}
		}
		for (const garment of requiredGarments) {
			if (!activeGarments.has(garment)) {
				issues.push({
					code: `mapping-missing:${family.id}:${garment}`,
					message: `Design ${family.id} is missing its ${garment} product.`
				});
			}
		}
	}
	const familyIds = new Set(input.designFamilies.map((family) => family.id));
	for (const section of parsed.data.sections) {
		if (section.type === 'featured-design' && !familyIds.has(section.designFamilyId)) {
			issues.push({
				code: `featured-design-missing:${section.designFamilyId}`,
				message: 'A featured-design section references a design outside this storefront assortment.'
			});
		}
	}

	const allMappings = input.designFamilies.flatMap((family) => family.mappings);
	const hero = allMappings.find((mapping) => mapping.id === input.heroProductMappingId);
	if (!hero || !hero.active || !hero.providerAvailable || hero.garment !== 'tshirt') {
		issues.push({
			code: 'hero-product-invalid',
			message: 'Select an active Gildan 5000 T-shirt mapping as the hero product.'
		});
	}

	const legalTypes = new Set(input.publishedLegalTypes);
	for (const type of requiredLegalDocuments) {
		if (!legalTypes.has(type)) {
			issues.push({
				code: `legal-missing:${type}`,
				message: `Publish the shared ${type} document.`
			});
		}
	}
	if (!input.supportContactConfigured) {
		issues.push({
			code: 'support-contact-missing',
			message: 'Configure a valid public support email and response note.'
		});
	}
	if (!input.experimentRevisionMatches) {
		issues.push({
			code: 'experiment-revision-mismatch',
			message: 'Create a planned experiment from this exact draft revision.'
		});
	}
	if (input.hasRunningRevisionConflict) {
		issues.push({
			code: 'running-revision-conflict',
			message: 'End the experiment running on the different published revision before replacing it.'
		});
	}
	return issues;
}
