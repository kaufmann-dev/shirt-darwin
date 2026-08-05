import { describe, expect, it } from 'vitest';
import {
	availableColors,
	availableSizes,
	firstAvailableGarment,
	formatPrice,
	selectedVariant,
	themeStyle
} from './model';
import type { StorefrontDesign, StorefrontProduct } from './types';
import { defaultBrandManifest } from '$lib/domain/brand';

const product: StorefrontProduct = {
	mappingId: 'mapping',
	garment: 'tshirt',
	shopifyProductId: 'gid://shopify/Product/1',
	handle: 'design-tee',
	title: 'Design tee',
	description: 'A tee',
	featuredImage: null,
	images: [],
	variants: [
		{
			id: 'black-m',
			title: 'Black / M',
			availableForSale: true,
			price: { amount: '24.00', currencyCode: 'USD' },
			selectedOptions: [
				{ name: 'Color', value: 'Black' },
				{ name: 'Size', value: 'M' }
			],
			image: null
		},
		{
			id: 'black-l',
			title: 'Black / L',
			availableForSale: false,
			price: { amount: '24.00', currencyCode: 'USD' },
			selectedOptions: [
				{ name: 'Color', value: 'Black' },
				{ name: 'Size', value: 'L' }
			],
			image: null
		},
		{
			id: 'white-s',
			title: 'White / S',
			availableForSale: true,
			price: { amount: '26.00', currencyCode: 'USD' },
			selectedOptions: [
				{ name: 'Color', value: 'White' },
				{ name: 'Size', value: 'S' }
			],
			image: null
		}
	]
};

const design: StorefrontDesign = {
	id: 'design',
	slug: 'design',
	name: 'Design',
	description: 'Description',
	mockupUrl: null,
	products: [product]
};

describe('storefront product selection', () => {
	it('only presents combinations that are available for sale', () => {
		expect(availableColors(product)).toEqual(['Black', 'White']);
		expect(availableSizes(product, 'Black')).toEqual(['M']);
		expect(selectedVariant(product, 'Black', 'L')).toBeUndefined();
		expect(selectedVariant(product, 'White', 'S')?.id).toBe('white-s');
	});

	it('finds the first usable garment and formats its price', () => {
		expect(firstAvailableGarment(design)).toBe('tshirt');
		expect(formatPrice(product.variants[0].price)).toBe('$24.00');
	});
});

describe('storefront theme', () => {
	it('uses validated colors and drops an unsafe font stack', () => {
		const manifest = defaultBrandManifest('test-store', 'Test Store');
		manifest.theme.fontFamily = 'Inter; background: red';
		const style = themeStyle(manifest);

		expect(style).toContain('--brand-background:#ffffff');
		expect(style).toContain('--brand-font:ui-sans-serif, system-ui, sans-serif');
		expect(style).not.toContain('background: red');
	});
});
