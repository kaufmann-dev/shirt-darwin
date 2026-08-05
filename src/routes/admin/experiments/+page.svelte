<script lang="ts">
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import { resolve } from '$app/paths';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatDate, formatMoneyMinor } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Experiments | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<h1>Experiments</h1>
			<p>One storefront, one hero T-shirt, one budget, and one date window.</p>
		</div>
	</header>

	{#if form?.error}<p class="admin-flash error" role="alert">{form.error}</p>{/if}

	{#if data.experiments.length}
		<TableFrame label="Experiments">
			<table class="admin-table">
				<thead>
					<tr>
						<th scope="col">Experiment</th>
						<th scope="col">Storefront</th>
						<th scope="col">Lifecycle</th>
						<th scope="col">Window</th>
						<th scope="col">Budget</th>
						<th scope="col">Outcome</th>
						<th scope="col">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each data.experiments as experiment (experiment.id)}
						<tr>
							<th scope="row">{experiment.name}</th>
							<td>{experiment.storefrontName}<br /><small>{experiment.storefrontSlug}</small></td>
							<td><StatusBadge value={experiment.lifecycle} /></td>
							<td>{formatDate(experiment.startsAt)} – {formatDate(experiment.endsAt)}</td>
							<td>{formatMoneyMinor(experiment.budgetMinor, experiment.budgetCurrency)}</td>
							<td><StatusBadge value={experiment.outcome ?? 'not decided'} /></td>
							<td
								><a
									class="admin-text-link"
									href={resolve('/admin/experiments/[id]', { id: experiment.id })}>Review</a
								></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</TableFrame>
	{:else}
		<EmptyState
			title="No experiments yet"
			detail="Map an active T-shirt product, then define the first test below."
		/>
	{/if}

	<section class="admin-panel" aria-labelledby="create-experiment-heading">
		<h2 id="create-experiment-heading">Create experiment</h2>
		{#if data.heroProducts.length}
			<form class="experiment-form" method="POST" action="?/create">
				<div class="admin-field-grid">
					<label class="admin-field">Name <input name="name" required maxlength="120" /></label>
					<label class="admin-field">
						Hero T-shirt
						<select name="heroProductMappingId" required>
							{#each data.heroProducts as product (product.id)}
								<option value={product.id}
									>{product.storefrontName} — {product.designName} ({product.shopifyHandle})</option
								>
							{/each}
						</select>
					</label>
					<label class="admin-field">
						Storefront
						<select name="storefrontId" required>
							{#each [...new Map(data.heroProducts.map( (product) => [product.storefrontId, product] )).values()] as product (product.storefrontId)}
								<option value={product.storefrontId}>{product.storefrontName}</option>
							{/each}
						</select>
						<small>The selected hero must belong to this storefront.</small>
					</label>
					<label class="admin-field">
						Hero video (optional)
						<select name="heroCreativeAssetId">
							<option value="">No video attached</option>
							{#each data.heroAssets as asset (asset.id)}<option value={asset.id}
									>{asset.originalName}</option
								>{/each}
						</select>
					</label>
					<label class="admin-field"
						>Starts (UTC) <input name="startsAt" type="datetime-local" required /></label
					>
					<label class="admin-field"
						>Ends (UTC) <input name="endsAt" type="datetime-local" required /></label
					>
					<label class="admin-field"
						>Budget (USD) <input
							name="budgetUsd"
							inputmode="decimal"
							required
							pattern={'\\d{1,7}(?:\\.\\d{1,2})?'}
						/></label
					>
				</div>
				<div class="admin-actions">
					<button class="admin-button" type="submit">Create experiment</button>
				</div>
			</form>
		{:else}
			<p>
				Create a storefront design and import an active T-shirt mapping before defining an
				experiment.
			</p>
		{/if}
	</section>
</div>

<style>
	.experiment-form {
		display: grid;
		gap: 1rem;
	}

	small {
		color: #666661;
	}
</style>
