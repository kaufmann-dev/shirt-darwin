<script lang="ts">
	import { page } from '$app/state';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import '$lib/components/admin/admin.css';

	let { data, children }: import('./$types').LayoutProps = $props();
	const isStorefrontPreview = $derived(page.route.id === '/admin/storefronts/[id]/preview');
</script>

{#if data.user && !isStorefrontPreview}
	<AdminShell user={data.user} pathname={page.url.pathname} {children} />
{:else}
	{@render children()}
{/if}
