<script lang="ts">
	import { resolve } from '$app/paths';
	import type { StorefrontView } from './types';

	interface Props {
		storefront: StorefrontView;
		preview?: boolean;
	}

	let { storefront, preview = false }: Props = $props();
</script>

<header class="site-header">
	{#if preview}
		<span class="brand-name">{storefront.manifest.identity.name}</span>
	{:else}
		<a class="brand-name" href={resolve('/')}>{storefront.manifest.identity.name}</a>
	{/if}
	{#if storefront.manifest.navigation.length > 0}
		<nav aria-label="Main navigation">
			{#each storefront.manifest.navigation as item (item.label)}
				{#if preview}
					<span>{item.label}</span>
				{:else}
					<a href={resolve(item.href as '/')}>{item.label}</a>
				{/if}
			{/each}
		</nav>
	{/if}
</header>

<style>
	.site-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		min-height: 4.75rem;
		padding: 1rem clamp(1rem, 4vw, 4rem);
		border-bottom: 1px solid var(--brand-border);
		background: var(--brand-background);
	}

	.brand-name {
		min-width: 0;
		overflow: hidden;
		font-family: var(--brand-heading-font);
		font-size: clamp(1rem, 2vw, 1.35rem);
		font-weight: 750;
		letter-spacing: -0.025em;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	nav {
		display: flex;
		align-items: center;
		gap: clamp(1rem, 3vw, 2rem);
		font-size: 0.875rem;
	}

	nav a {
		text-decoration-thickness: 1px;
		text-underline-offset: 0.3em;
	}

	@media (max-width: 40rem) {
		.site-header {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.75rem;
		}

		nav {
			max-width: 100%;
			overflow-x: auto;
			padding-bottom: 0.25rem;
		}
	}
</style>
