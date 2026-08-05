<script lang="ts">
	import Storefront from '$lib/components/storefront/Storefront.svelte';
	import { resolve } from '$app/paths';

	let { data }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Preview: {data.storefront.name}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="preview-bar">
	<strong>Draft preview · revision {data.storefront.revision}</strong>
	<a href={resolve('/admin/storefronts/[id]', { id: data.storefront.id })}>Return to editor</a>
</div>
<Storefront storefront={data.storefront} preview={true} />

<style>
	.preview-bar {
		display: flex;
		position: sticky;
		z-index: 100;
		top: 0;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 3rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid #ffffff;
		background: #000000;
		color: #ffffff;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		font-size: 0.8125rem;
	}

	a {
		color: inherit;
		font-weight: 750;
		text-underline-offset: 0.15em;
	}

	a:focus-visible {
		outline: 3px solid #7db4ff;
		outline-offset: 2px;
	}
</style>
