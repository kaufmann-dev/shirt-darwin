<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children }: { label: string; children: Snippet } = $props();
</script>

<!-- Keyboard focus provides access to horizontally scrollable tabular data. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="admin-table-scroll" role="region" aria-label={label} tabindex="0">
	{@render children()}
</div>
