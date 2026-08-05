<script lang="ts">
	import MetricCard from '$lib/components/admin/MetricCard.svelte';
	import { resolve } from '$app/paths';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatDateTime, formatMoneyMinor } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();

	function datetimeLocal(value: Date | string) {
		return new Date(value).toISOString().slice(0, 16);
	}
</script>

<svelte:head>
	<title>{data.experiment.name} | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<div class="admin-meta">
				<a class="admin-text-link" href={resolve('/admin/experiments')}>Experiments</a> / {data
					.experiment.storefrontSlug}
			</div>
			<h1>{data.experiment.name}</h1>
			<p>
				{data.experiment.storefrontName} · {formatDateTime(data.experiment.startsAt)} to {formatDateTime(
					data.experiment.endsAt
				)}
			</p>
		</div>
		<div class="admin-actions">
			<StatusBadge value={data.experiment.lifecycle} />
			<StatusBadge value={data.experiment.outcome ?? 'not decided'} />
		</div>
	</header>

	{#if form?.success}<p class="admin-flash" role="status">{form.success}</p>{/if}
	{#if form?.error}<p class="admin-flash error" role="alert">{form.error}</p>{/if}

	<section class="admin-grid" aria-label="Experiment metrics">
		<MetricCard
			label="Contribution"
			value={data.metrics.contributionComplete
				? formatMoneyMinor(data.metrics.contribution, 'EUR')
				: 'Pending'}
			detail={data.metrics.contributionComplete
				? 'Internal ledger'
				: 'Reconcile native-currency facts'}
		/>
		<MetricCard
			label="Revenue"
			value={data.metrics.revenueComplete
				? formatMoneyMinor(data.metrics.revenue, 'EUR')
				: 'Pending'}
			detail={data.metrics.revenueComplete ? 'Internal attribution' : 'Awaiting actual EUR values'}
		/>
		<MetricCard
			label="Internal purchases"
			value={String(data.metrics.internalPurchases)}
			detail="First-party last paid click"
		/>
		<MetricCard
			label="Meta spend"
			value={data.metrics.metaCurrencyMismatch
				? 'Currency mismatch'
				: formatMoneyMinor(data.metrics.metaSpendMinor, data.metrics.metaSpendCurrency)}
			detail={data.metrics.metaCurrencyMismatch ? 'Use a USD Meta ad account' : 'Meta Insights'}
		/>
		<MetricCard
			label="Meta purchases"
			value={String(data.metrics.metaPurchases)}
			detail="Meta-reported, shown separately"
		/>
		<MetricCard
			label="Meta clicks"
			value={String(data.metrics.metaClicks)}
			detail={`${data.metrics.metaImpressions} impressions`}
		/>
	</section>

	{#if data.metrics.pendingLedger > 0}
		<p class="admin-flash" role="status">
			{data.metrics.pendingLedger} ledger entries are estimated or missing EUR reporting values.
		</p>
	{/if}

	<section class="admin-panel" aria-labelledby="campaign-heading">
		<h2 id="campaign-heading">Meta campaign mapping</h2>
		<p>
			Create and operate the campaign in Meta. This platform reads its metrics and supplies the
			first-party landing URL.
		</p>
		{#if data.experiment.lifecycle === 'planned'}
			<form class="stacked-form" method="POST" action="?/campaign">
				<div class="admin-field-grid">
					<label class="admin-field"
						>Campaign ID <input
							name="campaignId"
							required
							maxlength="120"
							value={data.campaign?.campaignId ?? ''}
						/></label
					>
					<label class="admin-field"
						>Ad set ID <input
							name="adSetId"
							maxlength="120"
							value={data.campaign?.adSetId ?? ''}
						/></label
					>
					<label class="admin-field"
						>Ad ID <input name="adId" maxlength="120" value={data.campaign?.adId ?? ''} /></label
					>
				</div>
				<div class="admin-actions">
					<button class="admin-button" type="submit">Save mapping</button>
				</div>
			</form>
		{:else}
			<p>The campaign mapping is frozen because this experiment has started.</p>
		{/if}
		{#if data.trackingUrl}
			<label class="admin-field">
				Tracked landing URL
				<input readonly value={data.trackingUrl} />
			</label>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="configuration-heading">
		<h2 id="configuration-heading">Configuration</h2>
		{#if data.experiment.lifecycle === 'planned'}
			<form class="stacked-form" method="POST" action="?/edit">
				<div class="admin-field-grid">
					<label class="admin-field"
						>Name <input name="name" required maxlength="120" value={data.experiment.name} /></label
					>
					<label class="admin-field">
						Hero T-shirt
						<select name="heroProductMappingId" required>
							{#each data.heroProducts as product (product.id)}
								<option
									value={product.id}
									selected={product.id === data.experiment.heroProductMappingId}
									>{product.designName} — {product.shopifyHandle}</option
								>
							{/each}
						</select>
					</label>
					<label class="admin-field">
						Hero video
						<select name="heroCreativeAssetId">
							<option value="">No video attached</option>
							{#each data.heroAssets as asset (asset.id)}
								<option value={asset.id} selected={asset.id === data.experiment.heroCreativeAssetId}
									>{asset.originalName}</option
								>
							{/each}
						</select>
					</label>
					<label class="admin-field"
						>Starts (UTC) <input
							name="startsAt"
							type="datetime-local"
							required
							value={datetimeLocal(data.experiment.startsAt)}
						/></label
					>
					<label class="admin-field"
						>Ends (UTC) <input
							name="endsAt"
							type="datetime-local"
							required
							value={datetimeLocal(data.experiment.endsAt)}
						/></label
					>
					<label class="admin-field"
						>Budget (USD) <input
							name="budgetUsd"
							inputmode="decimal"
							required
							value={(data.experiment.budgetMinor / 100).toFixed(2)}
						/></label
					>
				</div>
				<div class="admin-actions">
					<button class="admin-button" type="submit">Save configuration</button>
				</div>
			</form>
		{:else}
			<p>
				The tested storefront revision, hero, dates, and budget are frozen. Create a new experiment
				for changed inputs.
			</p>
		{/if}
		{#if data.experiment.lifecycle !== 'ended'}
			<form method="POST" action="?/end">
				<button class="admin-button danger" type="submit">End now</button>
			</form>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="decision-heading">
		<h2 id="decision-heading">Manual outcome</h2>
		<p>
			Record the evidence-based decision after the test ends. This does not pause ads or archive the
			storefront.
		</p>
		{#if data.experiment.lifecycle === 'ended'}
			<form class="stacked-form" method="POST" action="?/outcome">
				<label class="admin-field">
					Outcome
					<select name="outcome" required>
						<option value="keep">Keep</option>
						<option value="iterate">Iterate</option>
						<option value="retire">Retire</option>
					</select>
				</label>
				<label class="admin-field"
					>Reason <textarea name="notes" required maxlength="2000"
						>{data.experiment.outcomeNotes ?? ''}</textarea
					></label
				>
				<div class="admin-actions">
					<button class="admin-button" type="submit">Record outcome</button>
				</div>
			</form>
		{:else}
			<p>Outcome is available after the experiment reaches its end date or is ended manually.</p>
		{/if}
		{#if data.decisions.length}
			<ul class="admin-list">
				{#each data.decisions as decision (decision.id)}
					<li>
						<div class="decision-line">
							<StatusBadge value={decision.outcome} /><span
								>{formatDateTime(decision.decidedAt)}</span
							>
						</div>
						<p>{decision.notes}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="ledger-heading">
		<div>
			<h2 id="ledger-heading">Manual economics corrections</h2>
			<p>
				Add actual fees or exceptional costs that provider synchronization cannot derive. Reusing
				the same kind and source reference appends a superseding revision.
			</p>
		</div>
		<form class="stacked-form" method="POST" action="?/ledger">
			<div class="admin-field-grid">
				<label class="admin-field">
					Entry kind
					<select name="kind" required>
						<option value="shopify-payment-fee">Shopify payment fee</option>
						<option value="shopify-fx-fee">Shopify FX fee</option>
						<option value="chargeback">Chargeback</option>
						<option value="replacement-cost">Replacement cost</option>
						<option value="provider-adjustment">Provider adjustment</option>
					</select>
				</label>
				<label class="admin-field">
					Provider source reference
					<input name="sourceReference" required maxlength="160" />
					<small>Use the Shopify transaction, statement, invoice, or case reference.</small>
				</label>
				<label class="admin-field"
					>Absolute amount <input name="amount" inputmode="decimal" required /></label
				>
				<label class="admin-field"
					>Native currency <input
						name="currency"
						required
						minlength="3"
						maxlength="3"
						value="USD"
					/></label
				>
				<label class="admin-field">
					Actual EUR amount (optional)
					<input name="reportingAmountEur" inputmode="decimal" />
					<small>Leave empty to mark non-EUR entries as pending reconciliation.</small>
				</label>
				<label class="admin-field">
					Related order (optional)
					<select name="orderId">
						<option value="">Experiment-level entry</option>
						{#each data.attributedOrders as order (order.id)}
							<option value={order.id}
								>{order.orderNumber} · {formatDateTime(order.orderedAt)}</option
							>
						{/each}
					</select>
				</label>
				<label class="admin-field"
					>Occurred at (UTC) <input name="occurredAt" type="datetime-local" required /></label
				>
			</div>
			<div class="admin-actions">
				<button class="admin-button secondary" type="submit">Append ledger entry</button>
			</div>
		</form>

		{#if data.ledgerEntries.length}
			<TableFrame label="Current experiment ledger entries">
				<table class="admin-table">
					<thead>
						<tr>
							<th scope="col">Occurred</th>
							<th scope="col">Kind</th>
							<th scope="col">Source</th>
							<th scope="col">Native</th>
							<th scope="col">EUR reporting</th>
							<th scope="col">FX</th>
						</tr>
					</thead>
					<tbody>
						{#each data.ledgerEntries as entry (entry.id)}
							<tr>
								<td>{formatDateTime(entry.occurredAt)}</td>
								<th scope="row">{entry.kind}</th>
								<td
									>{entry.source}<br /><small>{entry.sourceReference} · r{entry.revision}</small
									></td
								>
								<td>{formatMoneyMinor(entry.amountMinor, entry.currency)}</td>
								<td
									>{entry.reportingAmountMinor === null
										? 'Pending'
										: formatMoneyMinor(entry.reportingAmountMinor, 'EUR')}</td
								>
								<td><StatusBadge value={entry.fxStatus} /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</TableFrame>
		{/if}
	</section>
</div>

<style>
	.stacked-form {
		display: grid;
		gap: 1rem;
	}

	.decision-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		color: #666661;
		font-size: 0.8125rem;
	}

	small {
		color: #666661;
	}
</style>
