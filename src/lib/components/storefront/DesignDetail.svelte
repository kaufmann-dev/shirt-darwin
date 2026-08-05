<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ConsentDecision } from '$lib/domain/consent';
	import ConsentBanner from './ConsentBanner.svelte';
	import DesignCard from './DesignCard.svelte';
	import ProductChooser from './ProductChooser.svelte';
	import SiteFooter from './SiteFooter.svelte';
	import SiteHeader from './SiteHeader.svelte';
	import Tracking from './Tracking.svelte';
	import { lowestPrice, themeStyle } from './model';
	import type { ShopifyPrivacyConfig, StorefrontDesign, StorefrontView } from './types';

	interface Props {
		storefront: StorefrontView;
		design: StorefrontDesign;
		privacyConfig?: ShopifyPrivacyConfig | null;
		initialConsent?: ConsentDecision | null;
	}

	let { storefront, design, privacyConfig = null, initialConsent = null }: Props = $props();
	let canonical = $derived(
		`${storefront.canonicalOrigin}/design/${encodeURIComponent(design.slug)}`
	);
	let related = $derived(storefront.designs.filter((item) => item.id !== design.id));
	let price = $derived(lowestPrice(design));
</script>

<svelte:head>
	<title>{design.name} | {storefront.manifest.identity.name}</title>
	<meta name="description" content={design.description} />
	<meta name="robots" content="index,follow" />
	<link rel="canonical" href={canonical} />
	<meta property="og:title" content={`${design.name} | ${storefront.manifest.identity.name}`} />
	<meta property="og:description" content={design.description} />
	<meta property="og:type" content="product" />
</svelte:head>

<div class={`detail preset-${storefront.preset}`} style={themeStyle(storefront.manifest)} id="top">
	<a class="skip-link" href="#product">Skip to product options</a>
	<SiteHeader {storefront} />
	<main>
		<nav class="breadcrumb" aria-label="Breadcrumb">
			<a href={resolve('/')}>{storefront.manifest.identity.name}</a>
			<span aria-hidden="true">/</span>
			<span>{design.name}</span>
		</nav>

		<section id="product" aria-label={`${design.name} product options`}>
			<ProductChooser {design} />
		</section>

		{#if related.length > 0}
			<section class="related" aria-labelledby="related-heading">
				<h2 id="related-heading">More from the collection</h2>
				<div>
					{#each related as relatedDesign (relatedDesign.id)}
						<DesignCard design={relatedDesign} />
					{/each}
				</div>
			</section>
		{/if}
	</main>
	<SiteFooter
		brandName={storefront.manifest.identity.name}
		legalBaseUrl={storefront.legalBaseUrl}
	/>
	<ConsentBanner {privacyConfig} {initialConsent} />
	<Tracking
		{initialConsent}
		initialEvent={{
			eventName: 'ViewContent',
			...(price ? { currency: price.currencyCode, value: Number(price.amount) } : {}),
			contentIds: design.products.map((product) => product.shopifyProductId)
		}}
	/>
</div>

<style>
	.detail {
		min-height: 100vh;
		background: var(--brand-background);
		color: var(--brand-text);
		font-family: var(--brand-font);
	}

	.skip-link {
		position: fixed;
		z-index: 100;
		top: 0.75rem;
		left: 0.75rem;
		padding: 0.7rem 0.9rem;
		transform: translateY(-200%);
		background: var(--brand-primary);
		color: var(--brand-primary-contrast);
	}

	.skip-link:focus {
		transform: translateY(0);
	}

	main {
		padding: 0 clamp(1rem, 4vw, 4rem);
	}

	.breadcrumb {
		display: flex;
		gap: 0.65rem;
		align-items: center;
		padding: 1.25rem 0;
		color: var(--brand-muted);
		font-size: 0.8125rem;
	}

	.breadcrumb a {
		text-underline-offset: 0.25em;
	}

	#product {
		padding: clamp(2rem, 5vw, 5rem) 0 clamp(5rem, 10vw, 10rem);
	}

	.related {
		padding: clamp(4rem, 8vw, 8rem) 0;
		border-top: 1px solid var(--brand-border);
	}

	.related h2 {
		margin: 0 0 clamp(2rem, 5vw, 4rem);
		font-family: var(--brand-heading-font);
		font-size: clamp(2rem, 5vw, 4.5rem);
		letter-spacing: -0.04em;
	}

	.related > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: clamp(1rem, 3vw, 2.5rem);
	}

	@media (max-width: 38rem) {
		.related > div {
			grid-template-columns: 1fr;
		}
	}
</style>
