<script lang="ts">
	let { label, value, detail }: { label: string; value: string; detail?: string } = $props();
</script>

<section class="metric-card" aria-label={label}>
	<p>{label}</p>
	<strong>{value}</strong>
	{#if detail}<small>{detail}</small>{/if}
</section>

<style>
	.metric-card {
		display: grid;
		align-content: space-between;
		gap: 0.65rem;
		min-height: 8.5rem;
		padding: 1rem;
		border: 1px solid #c9c9c4;
		background: #ffffff;
	}

	p,
	strong,
	small {
		margin: 0;
	}

	p,
	small {
		color: #666661;
	}

	p {
		font-size: 0.75rem;
		font-weight: 750;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	strong {
		font-size: clamp(1.7rem, 4vw, 2.4rem);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.04em;
	}

	small {
		font-size: 0.75rem;
	}
</style>
