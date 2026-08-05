import type { BrandManifest, BrandPreset } from '$lib/domain/brand';

export const garments = ['tshirt', 'hoodie', 'crewneck'] as const;

export type Garment = (typeof garments)[number];

export const garmentLabels: Record<Garment, string> = {
	tshirt: 'T-shirt',
	hoodie: 'Hoodie',
	crewneck: 'Crewneck'
};

export type ProductImage = {
	url: string;
	altText: string | null;
};

export type ProductPrice = {
	amount: string;
	currencyCode: string;
};

export type ProductOption = {
	name: string;
	value: string;
};

export type ProductVariant = {
	id: string;
	title: string;
	availableForSale: boolean;
	price: ProductPrice;
	selectedOptions: ProductOption[];
	image: ProductImage | null;
};

export type StorefrontProduct = {
	mappingId: string;
	garment: Garment;
	shopifyProductId: string;
	handle: string;
	title: string;
	description: string;
	featuredImage: ProductImage | null;
	images: ProductImage[];
	variants: ProductVariant[];
};

export type StorefrontDesign = {
	id: string;
	slug: string;
	name: string;
	description: string;
	mockupUrl: string | null;
	products: StorefrontProduct[];
};

export type StorefrontView = {
	id: string;
	slug: string;
	name: string;
	revision: number;
	manifest: BrandManifest;
	preset: BrandPreset;
	assetUrls: Record<string, string>;
	designs: StorefrontDesign[];
	canonicalOrigin: string;
	legalBaseUrl: string;
};

export type ShopifyPrivacyConfig = {
	storefrontAccessToken: string;
	checkoutRootDomain: string;
	storefrontRootDomain: string;
};

export type ConsentChoice = {
	analytics: boolean;
	marketing: boolean;
};
