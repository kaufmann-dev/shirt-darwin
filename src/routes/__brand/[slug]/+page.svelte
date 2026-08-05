<script lang="ts">
	import Storefront from '$lib/components/storefront/Storefront.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Storefront
	storefront={data.storefront}
	privacyConfig={data.privacyConfig}
	initialConsent={data.initialConsent}
/>
