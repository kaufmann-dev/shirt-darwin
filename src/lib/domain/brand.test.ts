import { describe, expect, it } from 'vitest';
import { brandManifestSchema, defaultBrandManifest } from './brand';

describe('brand manifest', () => {
	it('accepts the default manifest', () => {
		expect(
			brandManifestSchema.safeParse(defaultBrandManifest('bird-club', 'Bird Club')).success
		).toBe(true);
	});

	it('requires unique section ids', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		manifest.sections[1].id = manifest.sections[0].id;
		expect(brandManifestSchema.safeParse(manifest).success).toBe(false);
	});

	it('rejects unsafe anchor ids and protocol-relative navigation', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		manifest.sections[0].id = 'Hero section';
		manifest.navigation[0].href = '//example.com';
		expect(brandManifestSchema.safeParse(manifest).success).toBe(false);
	});

	it('rejects backslash navigation and duplicate rendered keys', () => {
		const manifest = defaultBrandManifest('bird-club', 'Bird Club');
		manifest.navigation = [
			{ label: 'Shop', href: '/shop' },
			{ label: 'shop', href: String.raw`/\example.com` }
		];
		manifest.sections.push({
			id: 'faq',
			type: 'faq',
			heading: 'Questions',
			items: [
				{ question: 'Where is it made?', answer: 'By our fulfillment partner.' },
				{ question: 'where is it made?', answer: 'The same answer.' }
			]
		});
		expect(brandManifestSchema.safeParse(manifest).success).toBe(false);
	});
});
