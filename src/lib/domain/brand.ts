import { z } from 'zod';

const assetId = z.string().uuid();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color');
const slug = z
	.string()
	.min(2)
	.max(48)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');
const sectionId = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use a lowercase anchor name');
const internalHref = z
	.string()
	.regex(/^\/(?!\/)[^\s\\]*$/, 'Use a same-store path beginning with one slash');

const announcementSection = z.object({
	id: sectionId,
	type: z.literal('announcement'),
	text: z.string().min(1).max(140)
});

const heroSection = z.object({
	id: sectionId,
	type: z.literal('hero'),
	headline: z.string().min(1).max(90),
	body: z.string().min(1).max(280),
	imageAssetId: assetId,
	primaryActionLabel: z.string().min(1).max(32)
});

const featuredDesignSection = z.object({
	id: sectionId,
	type: z.literal('featured-design'),
	heading: z.string().min(1).max(80),
	designFamilyId: z.string().uuid()
});

const designGridSection = z.object({
	id: sectionId,
	type: z.literal('design-grid'),
	heading: z.string().min(1).max(80),
	intro: z.string().max(240).optional()
});

const storySection = z.object({
	id: sectionId,
	type: z.literal('story'),
	heading: z.string().min(1).max(80),
	body: z.string().min(1).max(1200),
	imageAssetId: assetId.optional()
});

const faqSection = z.object({
	id: sectionId,
	type: z.literal('faq'),
	heading: z.string().min(1).max(80),
	items: z
		.array(z.object({ question: z.string().min(1).max(140), answer: z.string().min(1).max(500) }))
		.min(1)
		.max(8)
});

export const brandSectionSchema = z.discriminatedUnion('type', [
	announcementSection,
	heroSection,
	featuredDesignSection,
	designGridSection,
	storySection,
	faqSection
]);

export const brandManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: z.object({
			slug,
			name: z.string().min(2).max(64),
			tagline: z.string().min(1).max(120),
			story: z.string().min(1).max(600)
		}),
		seo: z.object({
			title: z.string().min(1).max(60),
			description: z.string().min(1).max(160),
			socialImageAssetId: assetId.optional()
		}),
		theme: z.object({
			preset: z.enum(['editorial', 'catalog', 'poster']),
			colors: z.object({
				background: hexColor,
				surface: hexColor,
				text: hexColor,
				mutedText: hexColor,
				primary: hexColor,
				primaryContrast: hexColor,
				border: hexColor
			}),
			fontFamily: z.string().min(1).max(120),
			headingFontFamily: z.string().min(1).max(120),
			radius: z.number().int().min(0).max(16)
		}),
		navigation: z.array(z.object({ label: z.string().min(1).max(32), href: internalHref })).max(6),
		sections: z.array(brandSectionSchema).min(2).max(12)
	})
	.superRefine((manifest, context) => {
		const ids = new Set<string>();
		for (const section of manifest.sections) {
			if (ids.has(section.id)) {
				context.addIssue({
					code: 'custom',
					message: `Section id ${section.id} is duplicated`,
					path: ['sections']
				});
			}
			ids.add(section.id);
		}
		const navigationLabels = new Set<string>();
		for (const [index, item] of manifest.navigation.entries()) {
			const normalized = item.label.trim().toLocaleLowerCase('en-US');
			if (navigationLabels.has(normalized)) {
				context.addIssue({
					code: 'custom',
					message: `Navigation label ${item.label} is duplicated`,
					path: ['navigation', index, 'label']
				});
			}
			navigationLabels.add(normalized);
		}
		for (const [sectionIndex, section] of manifest.sections.entries()) {
			if (section.type !== 'faq') continue;
			const questions = new Set<string>();
			for (const [itemIndex, item] of section.items.entries()) {
				const normalized = item.question.trim().toLocaleLowerCase('en-US');
				if (questions.has(normalized)) {
					context.addIssue({
						code: 'custom',
						message: `FAQ question ${item.question} is duplicated`,
						path: ['sections', sectionIndex, 'items', itemIndex, 'question']
					});
				}
				questions.add(normalized);
			}
		}
		if (!manifest.sections.some((section) => section.type === 'hero')) {
			context.addIssue({
				code: 'custom',
				message: 'A hero section is required',
				path: ['sections']
			});
		}
		if (!manifest.sections.some((section) => section.type === 'design-grid')) {
			context.addIssue({
				code: 'custom',
				message: 'A design grid section is required',
				path: ['sections']
			});
		}
	});

export type BrandManifest = z.infer<typeof brandManifestSchema>;
export type BrandSection = z.infer<typeof brandSectionSchema>;
export type BrandPreset = BrandManifest['theme']['preset'];

export const defaultBrandManifest = (storeSlug: string, name: string): BrandManifest => ({
	schemaVersion: 1,
	identity: {
		slug: storeSlug,
		name,
		tagline: 'Made for people who care deeply.',
		story: 'A focused collection created for one community.'
	},
	seo: {
		title: name,
		description: `${name} makes focused apparel for one community.`
	},
	theme: {
		preset: 'catalog',
		colors: {
			background: '#ffffff',
			surface: '#f3f2ed',
			text: '#111111',
			mutedText: '#62615c',
			primary: '#111111',
			primaryContrast: '#ffffff',
			border: '#d7d5cc'
		},
		fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
		headingFontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
		radius: 0
	},
	navigation: [{ label: 'Shop', href: '/#designs' }],
	sections: [
		{
			id: 'hero',
			type: 'hero',
			headline: name,
			body: 'Three original designs. Three dependable garments.',
			imageAssetId: '00000000-0000-0000-0000-000000000000',
			primaryActionLabel: 'Shop the collection'
		},
		{ id: 'designs', type: 'design-grid', heading: 'The collection' }
	]
});
