<script lang="ts">
	let { value }: { value: string | null | undefined } = $props();
	const label = $derived(value?.trim() || 'unknown');
	const tone = $derived(
		[
			'live',
			'running',
			'completed',
			'success',
			'actual',
			'resolved',
			'fulfilled',
			'available'
		].includes(label)
			? 'positive'
			: ['critical', 'failed', 'retire', 'cancelled', 'unavailable'].includes(label)
				? 'negative'
				: ['warning', 'estimated', 'pending', 'running', 'iterate', 'partial'].includes(label)
					? 'attention'
					: 'neutral'
	);
</script>

<span class="badge {tone}">{label.replaceAll('-', ' ')}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		min-height: 1.5rem;
		padding: 0.2rem 0.45rem;
		border: 1px solid #777771;
		background: #ffffff;
		color: #333330;
		font-size: 0.6875rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		line-height: 1;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.positive {
		border-color: #2c633f;
		background: #edf6ef;
		color: #234d32;
	}

	.negative {
		border-color: #8a1c1c;
		background: #fff0f0;
		color: #791818;
	}

	.attention {
		border-color: #876312;
		background: #fff8df;
		color: #674a09;
	}
</style>
