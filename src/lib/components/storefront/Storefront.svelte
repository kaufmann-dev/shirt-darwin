<script lang="ts">
	import type { ConsentDecision } from '$lib/domain/consent';
	import ConsentBanner from './ConsentBanner.svelte';
	import DesignCard from './DesignCard.svelte';
	import ProductChooser from './ProductChooser.svelte';
	import SiteFooter from './SiteFooter.svelte';
	import SiteHeader from './SiteHeader.svelte';
	import Tracking from './Tracking.svelte';
	import { themeStyle } from './model';
	import type { ShopifyPrivacyConfig, StorefrontView } from './types';

	interface Props {
		storefront: StorefrontView;
		privacyConfig?: ShopifyPrivacyConfig | null;
		initialConsent?: ConsentDecision | null;
		preview?: boolean;
	}

	let {
		storefront,
		privacyConfig = null,
		initialConsent = null,
		preview = false
	}: Props = $props();

	let manifest = $derived(storefront.manifest);
	let style = $derived(themeStyle(manifest));
	let canonical = $derived(`${storefront.canonicalOrigin}/`);
	let socialImage = $derived(
		manifest.seo.socialImageAssetId
			? storefront.assetUrls[manifest.seo.socialImageAssetId]
			: undefined
	);
	let shopSectionId = $derived(
		manifest.sections.find((section) => section.type === 'design-grid')?.id
	);

	function scrollToDesigns() {
		document.getElementById(shopSectionId ?? 'main-content')?.scrollIntoView();
	}
</script>

<svelte:head>
	<title>{preview ? `Preview — ${manifest.seo.title}` : manifest.seo.title}</title>
	<meta name="description" content={manifest.seo.description} />
	<meta name="robots" content={preview ? 'noindex,nofollow' : 'index,follow'} />
	{#if !preview}<link rel="canonical" href={canonical} />{/if}
	<meta property="og:title" content={manifest.seo.title} />
	<meta property="og:description" content={manifest.seo.description} />
	<meta property="og:type" content="website" />
	{#if socialImage}<meta property="og:image" content={socialImage} />{/if}
</svelte:head>

<div class={`storefront preset-${storefront.preset}`} class:preview {style} id="top">
	<a class="skip-link" href="#main-content">Skip to products</a>
	{#if preview}
		<div class="preview-banner" role="status">
			Draft preview · Checkout and navigation are disabled
		</div>
	{/if}
	<SiteHeader {storefront} {preview} />

	<main id="main-content">
		{#each manifest.sections as section (section.id)}
			{#if section.type === 'announcement'}
				<div class="announcement" id={section.id}>{section.text}</div>
			{:else if section.type === 'hero'}
				<section class="hero" id={section.id}>
					<div class="hero-copy">
						<h1>{section.headline}</h1>
						<p>{section.body}</p>
						<button class="primary-action" type="button" onclick={scrollToDesigns}
							>{section.primaryActionLabel}</button
						>
					</div>
					<div class="hero-image">
						{#if storefront.assetUrls[section.imageAssetId]}
							<img src={storefront.assetUrls[section.imageAssetId]} alt="" fetchpriority="high" />
						{:else}
							<span aria-hidden="true">{manifest.identity.name.slice(0, 1)}</span>
						{/if}
					</div>
				</section>
			{:else if section.type === 'featured-design'}
				{@const design = storefront.designs.find((item) => item.id === section.designFamilyId)}
				{#if design}
					<section class="featured" id={section.id}>
						<header class="section-heading"><h2>{section.heading}</h2></header>
						<ProductChooser {design} {preview} />
					</section>
				{/if}
			{:else if section.type === 'design-grid'}
				<section class="collection" id={section.id}>
					<header class="section-heading">
						<h2>{section.heading}</h2>
						{#if section.intro}<p>{section.intro}</p>{/if}
					</header>
					{#if storefront.designs.length > 0}
						<div class="design-grid">
							{#each storefront.designs as design (design.id)}
								<DesignCard {design} {preview} />
							{/each}
						</div>
					{:else}
						<div class="collection-empty" role="status">
							<strong>The first collection is on its way.</strong>
							<span>Products will appear here when they are ready.</span>
						</div>
					{/if}
				</section>
			{:else if section.type === 'story'}
				<section class="story" id={section.id}>
					<div>
						<h2>{section.heading}</h2>
						<p>{section.body}</p>
					</div>
					{#if section.imageAssetId && storefront.assetUrls[section.imageAssetId]}
						<img src={storefront.assetUrls[section.imageAssetId]} alt="" loading="lazy" />
					{/if}
				</section>
			{:else if section.type === 'faq'}
				<section class="faq" id={section.id}>
					<h2>{section.heading}</h2>
					<div>
						{#each section.items as item (item.question)}
							<details>
								<summary>{item.question}</summary>
								<p>{item.answer}</p>
							</details>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	</main>

	<SiteFooter brandName={manifest.identity.name} legalBaseUrl={storefront.legalBaseUrl} />
	{#if !preview}
		<ConsentBanner {privacyConfig} {initialConsent} />
		<Tracking {initialConsent} initialEvent={{ eventName: 'PageView' }} />
	{/if}
</div>

<style>
	.storefront {
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

	.preview-banner,
	.announcement {
		padding: 0.55rem 1rem;
		background: var(--brand-primary);
		color: var(--brand-primary-contrast);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-align: center;
	}

	.preview-banner {
		background: #fff3b0;
		color: #111111;
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.9fr);
		min-height: min(48rem, calc(100vh - 4.75rem));
		border-bottom: 1px solid var(--brand-border);
	}

	.hero-copy {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		flex-direction: column;
		padding: clamp(3rem, 8vw, 8rem) clamp(1rem, 6vw, 6rem);
	}

	.hero h1,
	.section-heading h2,
	.story h2,
	.faq h2 {
		margin: 0;
		font-family: var(--brand-heading-font);
		letter-spacing: -0.045em;
	}

	.hero h1 {
		max-width: 12ch;
		font-size: clamp(3.25rem, 9vw, 8.5rem);
		line-height: 0.9;
	}

	.hero p {
		max-width: 36rem;
		margin: 1.75rem 0 0;
		color: var(--brand-muted);
		font-size: clamp(1rem, 2vw, 1.25rem);
		line-height: 1.55;
	}

	.hero .primary-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 3.25rem;
		margin-top: 2.25rem;
		padding: 0.75rem 1.25rem;
		border: 1px solid var(--brand-primary);
		border-radius: var(--brand-radius);
		background: var(--brand-primary);
		color: var(--brand-primary-contrast);
		font-weight: 750;
		text-decoration: none;
		cursor: pointer;
	}

	.hero-image {
		display: grid;
		min-height: 25rem;
		overflow: hidden;
		place-items: center;
		background: var(--brand-surface);
	}

	.hero-image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.hero-image span {
		color: var(--brand-muted);
		font-family: var(--brand-heading-font);
		font-size: clamp(10rem, 28vw, 24rem);
		font-weight: 850;
		line-height: 1;
	}

	.featured,
	.collection,
	.story,
	.faq {
		padding: clamp(4rem, 9vw, 9rem) clamp(1rem, 4vw, 4rem);
		border-bottom: 1px solid var(--brand-border);
	}

	.section-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: clamp(2rem, 5vw, 4rem);
	}

	.section-heading h2,
	.story h2,
	.faq h2 {
		font-size: clamp(2.25rem, 6vw, 5.5rem);
		line-height: 0.95;
	}

	.section-heading p {
		max-width: 38rem;
		margin: 0;
		color: var(--brand-muted);
		line-height: 1.55;
	}

	.design-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: clamp(1rem, 3vw, 2.5rem);
	}

	.collection-empty {
		display: grid;
		gap: 0.5rem;
		padding: clamp(2rem, 5vw, 4rem);
		border: 1px solid var(--brand-border);
		background: var(--brand-surface);
		text-align: center;
	}

	.collection-empty span {
		color: var(--brand-muted);
	}

	.story {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(20rem, 1.1fr);
		gap: clamp(2rem, 8vw, 8rem);
		align-items: center;
		background: var(--brand-surface);
	}

	.story p {
		max-width: 46rem;
		margin: 2rem 0 0;
		color: var(--brand-muted);
		line-height: 1.75;
		white-space: pre-line;
	}

	.story img {
		display: block;
		width: 100%;
		max-height: 42rem;
		object-fit: cover;
	}

	.faq {
		display: grid;
		grid-template-columns: minmax(14rem, 0.65fr) minmax(0, 1.35fr);
		gap: clamp(2rem, 8vw, 8rem);
	}

	details {
		border-top: 1px solid var(--brand-border);
	}

	details:last-child {
		border-bottom: 1px solid var(--brand-border);
	}

	summary {
		padding: 1.25rem 0;
		font-weight: 700;
		cursor: pointer;
	}

	details p {
		max-width: 50rem;
		margin: 0 0 1.5rem;
		color: var(--brand-muted);
		line-height: 1.65;
	}

	.preset-editorial .hero {
		grid-template-columns: minmax(20rem, 0.8fr) minmax(0, 1.2fr);
	}

	.preset-editorial .hero-copy {
		order: 2;
	}

	.preset-editorial .hero-image {
		order: 1;
	}

	.preset-editorial .design-grid {
		grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(0, 0.85fr));
	}

	.preset-poster .hero {
		position: relative;
		grid-template-columns: 1fr;
		min-height: min(54rem, calc(100vh - 4.75rem));
		isolation: isolate;
	}

	.preset-poster .hero-copy {
		position: relative;
		z-index: 1;
		justify-content: flex-end;
		color: var(--brand-primary-contrast);
	}

	.preset-poster .hero-copy p {
		color: currentColor;
	}

	.preset-poster .hero-image {
		position: absolute;
		z-index: -1;
		inset: 0;
		background: var(--brand-primary);
	}

	.preset-poster .hero-image::after {
		position: absolute;
		inset: 0;
		background: linear-gradient(transparent 25%, rgb(0 0 0 / 70%));
		content: '';
	}

	.preset-poster .hero-image span {
		color: var(--brand-primary-contrast);
	}

	@media (max-width: 52rem) {
		.hero,
		.preset-editorial .hero,
		.story,
		.faq {
			grid-template-columns: 1fr;
		}

		.preset-editorial .hero-copy,
		.preset-editorial .hero-image {
			order: initial;
		}

		.hero {
			min-height: auto;
		}

		.hero-image {
			aspect-ratio: 4 / 3;
			min-height: 0;
		}

		.design-grid,
		.preset-editorial .design-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 36rem) {
		.design-grid,
		.preset-editorial .design-grid {
			grid-template-columns: 1fr;
		}

		.section-heading {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
