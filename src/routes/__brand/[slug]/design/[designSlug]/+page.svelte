<script lang="ts">
	import DesignDetail from '$lib/components/storefront/DesignDetail.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<DesignDetail
	storefront={data.storefront}
	design={data.design}
	privacyConfig={data.privacyConfig}
	initialConsent={data.initialConsent}
/>
