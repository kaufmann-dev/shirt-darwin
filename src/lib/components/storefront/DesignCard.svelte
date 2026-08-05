<script lang="ts">
	import { resolve } from '$app/paths';
	import { designImage, formatPrice, lowestPrice } from './model';
	import type { StorefrontDesign } from './types';

	interface Props {
		design: StorefrontDesign;
		preview?: boolean;
	}

	let { design, preview = false }: Props = $props();
	let image = $derived(designImage(design));
	let price = $derived(lowestPrice(design));
</script>

{#snippet cardContents()}
	<div class="image-frame">
		{#if image}
			<img src={image.url} alt={image.altText} loading="lazy" />
		{:else}
			<div class="image-empty" aria-hidden="true">{design.name.slice(0, 1)}</div>
		{/if}
	</div>
	<div class="details">
		<div>
			<h3>{design.name}</h3>
			<p>{design.description}</p>
		</div>
		<span>{price ? `From ${formatPrice(price)}` : 'Coming soon'}</span>
	</div>
{/snippet}

<article>
	{#if preview}
		<div class="preview-content">{@render cardContents()}</div>
	{:else}
		<a
			href={resolve(`/design/${encodeURIComponent(design.slug)}` as '/')}
			aria-label={`View ${design.name}`}
		>
			{@render cardContents()}
		</a>
	{/if}
</article>

<style>
	article,
	a,
	.preview-content {
		display: block;
		min-width: 0;
	}

	a,
	.preview-content {
		text-decoration: none;
	}

	.image-frame {
		aspect-ratio: 4 / 5;
		overflow: hidden;
		border: 1px solid var(--brand-border);
		background: var(--brand-surface);
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.image-empty {
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		color: var(--brand-muted);
		font-family: var(--brand-heading-font);
		font-size: clamp(4rem, 12vw, 8rem);
		font-weight: 800;
	}

	.details {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 1rem;
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		font-family: var(--brand-heading-font);
		font-size: 1.1rem;
	}

	p {
		max-width: 35rem;
		margin-top: 0.4rem;
		color: var(--brand-muted);
		font-size: 0.9rem;
	}

	span {
		flex: none;
		color: var(--brand-muted);
		font-size: 0.875rem;
		white-space: nowrap;
	}

	a:hover h3 {
		text-decoration: underline;
		text-underline-offset: 0.25em;
	}
</style>
