import type { Garment, ProductVariant, StorefrontDesign, StorefrontProduct } from './types';
import { garments } from './types';
import type { BrandManifest } from '$lib/domain/brand';

const systemFont = 'ui-sans-serif, system-ui, sans-serif';
const safeFontStack = /^[a-zA-Z0-9\s,'"-]+$/;

export function themeStyle(manifest: BrandManifest): string {
	const { colors } = manifest.theme;
	const bodyFont = safeFontStack.test(manifest.theme.fontFamily)
		? manifest.theme.fontFamily
		: systemFont;
	const headingFont = safeFontStack.test(manifest.theme.headingFontFamily)
		? manifest.theme.headingFontFamily
		: systemFont;

	return [
		`--brand-background:${colors.background}`,
		`--brand-surface:${colors.surface}`,
		`--brand-text:${colors.text}`,
		`--brand-muted:${colors.mutedText}`,
		`--brand-primary:${colors.primary}`,
		`--brand-primary-contrast:${colors.primaryContrast}`,
		`--brand-border:${colors.border}`,
		`--brand-font:${bodyFont}`,
		`--brand-heading-font:${headingFont}`,
		`--brand-radius:${manifest.theme.radius}px`
	].join(';');
}

export function productForGarment(
	design: StorefrontDesign,
	garment: Garment
): StorefrontProduct | undefined {
	return design.products.find((product) => product.garment === garment);
}

export function firstAvailableGarment(design: StorefrontDesign): Garment | null {
	return (
		garments.find((garment) => {
			const product = productForGarment(design, garment);
			return product?.variants.some((variant) => variant.availableForSale);
		}) ??
		design.products[0]?.garment ??
		null
	);
}

function optionValue(variant: ProductVariant, names: string[]): string | null {
	const option = variant.selectedOptions.find((candidate) =>
		names.includes(candidate.name.toLowerCase())
	);
	return option?.value ?? null;
}

export function variantColor(variant: ProductVariant): string | null {
	return optionValue(variant, ['color', 'colour']);
}

export function variantSize(variant: ProductVariant): string | null {
	return optionValue(variant, ['size']);
}

function unique(values: Array<string | null>): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function availableColors(product: StorefrontProduct | undefined): string[] {
	if (!product) return [];
	return unique(product.variants.filter((variant) => variant.availableForSale).map(variantColor));
}

export function availableSizes(
	product: StorefrontProduct | undefined,
	color: string | null
): string[] {
	if (!product) return [];
	return unique(
		product.variants
			.filter((variant) => variant.availableForSale && (!color || variantColor(variant) === color))
			.map(variantSize)
	);
}

export function selectedVariant(
	product: StorefrontProduct | undefined,
	color: string | null,
	size: string | null
): ProductVariant | undefined {
	if (!product) return;
	return product.variants.find(
		(variant) =>
			variant.availableForSale &&
			(!color || variantColor(variant) === color) &&
			(!size || variantSize(variant) === size)
	);
}

export function lowestPrice(design: StorefrontDesign): ProductVariant['price'] | null {
	const available = design.products.flatMap((product) =>
		product.variants.filter((variant) => variant.availableForSale)
	);
	if (available.length === 0) return null;
	return available.reduce((lowest, variant) =>
		Number(variant.price.amount) < Number(lowest.price.amount) ? variant : lowest
	).price;
}

export function formatPrice(price: ProductVariant['price'] | null): string {
	if (!price) return 'Unavailable';
	const amount = Number(price.amount);
	if (!Number.isFinite(amount)) return `${price.amount} ${price.currencyCode}`;
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: price.currencyCode
	}).format(amount);
}

export function designImage(design: StorefrontDesign): { url: string; altText: string } | null {
	if (design.mockupUrl) return { url: design.mockupUrl, altText: `${design.name} design` };
	const product =
		productForGarment(design, 'tshirt') ??
		productForGarment(design, 'hoodie') ??
		design.products[0];
	const image = product?.featuredImage ?? product?.images[0];
	if (!image) return null;
	return { url: image.url, altText: image.altText || `${design.name} on ${product.title}` };
}
