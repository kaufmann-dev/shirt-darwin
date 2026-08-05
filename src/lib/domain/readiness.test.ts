import { describe, expect, it } from 'vitest';
import { defaultBrandManifest } from './brand';
import { publicationReadiness, requiredGarments } from './readiness';

const usProductSnapshot = {
	variants: [{ availableForSale: true, price: { currencyCode: 'USD' } }]
};
const confirmedAt = new Date('2026-08-05T00:00:00Z');

function confirmedAssets(
	imageAssetId: string,
	families: Array<{ id: string; mockupAssetId: string | null; printFileAssetId: string | null }>
) {
	return [
		{ id: imageAssetId, kind: 'image', confirmedAt },
		...families.flatMap((family) => [
			...(family.mockupAssetId ? [{ id: family.mockupAssetId, kind: 'image', confirmedAt }] : []),
			...(family.printFileAssetId
				? [{ id: family.printFileAssetId, kind: 'print-file', confirmedAt }]
				: [])
		])
	];
}

describe('publication readiness', () => {
	it('accepts one valid three-design assortment', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const imageAssetId =
			manifest.sections[0].type === 'hero' ? manifest.sections[0].imageAssetId : '';
		const families = ['one', 'two', 'three'].map((id) => ({
			id,
			mockupAssetId: `${id}-mockup`,
			printFileAssetId: `${id}-print-file`,
			provenanceNotes: 'Original operator-supplied artwork; source retained.',
			rightsReviewedAt: new Date('2026-08-05T00:00:00Z'),
			mappings: requiredGarments.map((garment) => ({
				id: `${id}-${garment}`,
				garment,
				active: true,
				providerAvailable: true,
				productSnapshot: usProductSnapshot
			}))
		}));
		expect(
			publicationReadiness({
				manifest,
				assets: confirmedAssets(imageAssetId, families),
				designFamilies: families,
				heroProductMappingId: 'one-tshirt',
				publishedLegalTypes: ['imprint', 'privacy', 'terms', 'returns'],
				supportContactConfigured: true,
				experimentRevisionMatches: true,
				hasRunningRevisionConflict: false
			})
		).toEqual([]);
	});

	it('blocks designs whose production evidence or rights review is incomplete', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const imageAssetId =
			manifest.sections[0].type === 'hero' ? manifest.sections[0].imageAssetId : '';
		const families = ['one', 'two', 'three'].map((id) => ({
			id,
			mockupAssetId: `${id}-mockup`,
			printFileAssetId: id === 'one' ? null : `${id}-print-file`,
			provenanceNotes: id === 'two' ? '   ' : 'Operator-supplied artwork.',
			rightsReviewedAt: id === 'three' ? null : new Date('2026-08-05T00:00:00Z'),
			mappings: requiredGarments.map((garment) => ({
				id: `${id}-${garment}`,
				garment,
				active: true,
				providerAvailable: true,
				productSnapshot: usProductSnapshot
			}))
		}));
		const codes = publicationReadiness({
			manifest,
			assets: confirmedAssets(imageAssetId, families),
			designFamilies: families,
			heroProductMappingId: 'one-tshirt',
			publishedLegalTypes: ['imprint', 'privacy', 'terms', 'returns'],
			supportContactConfigured: true,
			experimentRevisionMatches: true,
			hasRunningRevisionConflict: false
		}).map((issue) => issue.code);

		expect(codes).toContain('design-print-file-missing:one');
		expect(codes).toContain('design-provenance-missing:two');
		expect(codes).toContain('design-rights-review-missing:three');
	});

	it('reports missing mappings, hero, assets, and legal documents', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const issues = publicationReadiness({
			manifest,
			assets: [],
			designFamilies: [],
			heroProductMappingId: null,
			publishedLegalTypes: [],
			supportContactConfigured: false,
			experimentRevisionMatches: false,
			hasRunningRevisionConflict: true
		});
		expect(issues.map((issue) => issue.code)).toContain('design-family-count');
		expect(issues.map((issue) => issue.code)).toContain('hero-product-invalid');
		expect(issues.some((issue) => issue.code.startsWith('asset-missing:'))).toBe(true);
		expect(issues.some((issue) => issue.code === 'legal-missing:privacy')).toBe(true);
		expect(issues.map((issue) => issue.code)).toContain('support-contact-missing');
		expect(issues.map((issue) => issue.code)).toContain('experiment-revision-mismatch');
		expect(issues.map((issue) => issue.code)).toContain('running-revision-conflict');
	});

	it('rejects non-image manifest assets and unknown featured designs', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const imageAssetId =
			manifest.sections[0].type === 'hero' ? manifest.sections[0].imageAssetId : '';
		manifest.sections.push({
			id: 'featured',
			type: 'featured-design',
			heading: 'Featured',
			designFamilyId: '00000000-0000-4000-8000-000000000099'
		});
		const issues = publicationReadiness({
			manifest,
			assets: [{ id: imageAssetId, kind: 'video', confirmedAt }],
			designFamilies: [],
			heroProductMappingId: null,
			publishedLegalTypes: ['imprint', 'privacy', 'terms', 'returns'],
			supportContactConfigured: true,
			experimentRevisionMatches: true,
			hasRunningRevisionConflict: false
		});

		expect(issues.map((issue) => issue.code)).toContain(`asset-kind-invalid:${imageAssetId}`);
		expect(issues.map((issue) => issue.code)).toContain(
			'featured-design-missing:00000000-0000-4000-8000-000000000099'
		);
	});

	it('rejects a mapped snapshot without an available all-USD assortment', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const imageAssetId =
			manifest.sections[0].type === 'hero' ? manifest.sections[0].imageAssetId : '';
		const families = ['one', 'two', 'three'].map((id) => ({
			id,
			mockupAssetId: `${id}-mockup`,
			printFileAssetId: `${id}-print-file`,
			provenanceNotes: 'Operator-supplied artwork.',
			rightsReviewedAt: new Date('2026-08-05T00:00:00Z'),
			mappings: requiredGarments.map((garment) => ({
				id: `${id}-${garment}`,
				garment,
				active: true,
				providerAvailable: true,
				productSnapshot:
					id === 'one' && garment === 'tshirt'
						? { variants: [{ availableForSale: true, price: { currencyCode: 'EUR' } }] }
						: usProductSnapshot
			}))
		}));
		const issues = publicationReadiness({
			manifest,
			assets: confirmedAssets(imageAssetId, families),
			designFamilies: families,
			heroProductMappingId: 'one-tshirt',
			publishedLegalTypes: ['imprint', 'privacy', 'terms', 'returns'],
			supportContactConfigured: true,
			experimentRevisionMatches: true,
			hasRunningRevisionConflict: false
		});

		expect(issues.map((issue) => issue.code)).toContain('product-us-market-invalid:one-tshirt');
	});

	it('rejects an active mapping when Shopify marks its provider health unavailable', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const imageAssetId =
			manifest.sections[0].type === 'hero' ? manifest.sections[0].imageAssetId : '';
		const families = ['one', 'two', 'three'].map((id) => ({
			id,
			mockupAssetId: `${id}-mockup`,
			printFileAssetId: `${id}-print-file`,
			provenanceNotes: 'Operator-supplied artwork.',
			rightsReviewedAt: new Date('2026-08-05T00:00:00Z'),
			mappings: requiredGarments.map((garment) => ({
				id: `${id}-${garment}`,
				garment,
				active: true,
				providerAvailable: !(id === 'one' && garment === 'tshirt'),
				productSnapshot: usProductSnapshot
			}))
		}));
		const issues = publicationReadiness({
			manifest,
			assets: confirmedAssets(imageAssetId, families),
			designFamilies: families,
			heroProductMappingId: 'one-tshirt',
			publishedLegalTypes: ['imprint', 'privacy', 'terms', 'returns'],
			supportContactConfigured: true,
			experimentRevisionMatches: true,
			hasRunningRevisionConflict: false
		});

		expect(issues.map((issue) => issue.code)).toContain('product-provider-unavailable:one-tshirt');
		expect(issues.map((issue) => issue.code)).toContain('mapping-missing:one:tshirt');
		expect(issues.map((issue) => issue.code)).toContain('hero-product-invalid');
	});

	it('blocks unconfirmed uploads even when their records exist', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		const imageAssetId =
			manifest.sections[0].type === 'hero' ? manifest.sections[0].imageAssetId : '';
		const issues = publicationReadiness({
			manifest,
			assets: [{ id: imageAssetId, kind: 'image', confirmedAt: null }],
			designFamilies: [],
			heroProductMappingId: null,
			publishedLegalTypes: [],
			supportContactConfigured: false,
			experimentRevisionMatches: false,
			hasRunningRevisionConflict: false
		});

		expect(issues.map((issue) => issue.code)).toContain(`asset-unconfirmed:${imageAssetId}`);
	});
});
