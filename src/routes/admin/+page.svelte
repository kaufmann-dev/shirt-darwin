<script lang="ts">
	import MetricCard from '$lib/components/admin/MetricCard.svelte';
	import { resolve } from '$app/paths';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatAge, formatMoneyMinor } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Overview | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<h1>Overview</h1>
			<p>Current portfolio economics, operations, and data health.</p>
		</div>
		<a class="admin-link-button secondary" href={resolve('/admin/integrations')}
			>Review integrations</a
		>
	</header>

	<section class="admin-grid" aria-label="Portfolio metrics">
		<MetricCard
			label="Contribution"
			value={data.metrics.contributionComplete
				? formatMoneyMinor(data.metrics.contribution, 'EUR')
				: 'Pending'}
			detail={data.metrics.contributionComplete
				? 'Current ledger entries'
				: 'Reconcile native-currency facts'}
		/>
		<MetricCard
			label="Revenue"
			value={data.metrics.revenueComplete
				? formatMoneyMinor(data.metrics.revenue, 'EUR')
				: 'Pending'}
			detail={data.metrics.revenueComplete
				? 'Merchandise and shipping'
				: 'Awaiting actual EUR values'}
		/>
		<MetricCard
			label="Meta spend"
			value={data.metrics.metaSpendComplete
				? formatMoneyMinor(data.metrics.metaSpend, 'EUR')
				: 'Pending'}
			detail={data.metrics.metaSpendComplete ? 'Imported ad spend' : 'Awaiting actual EUR values'}
		/>
		<MetricCard
			label="Orders"
			value={String(data.metrics.orders)}
			detail="No customer PII stored"
		/>
		<MetricCard
			label="Live tests"
			value={String(data.metrics.runningExperiments)}
			detail="Derived from experiment dates"
		/>
		<MetricCard
			label="Storefronts"
			value={String(data.metrics.storefronts)}
			detail="Draft, live, and archived"
		/>
	</section>

	{#if form?.success}<p class="admin-flash" role="status">{form.success}</p>{/if}
	{#if form?.error}<p class="admin-flash error" role="alert">{form.error}</p>{/if}

	<section class="admin-panel" aria-labelledby="next-actions-heading">
		<div class="admin-panel-header">
			<div>
				<h2 id="next-actions-heading">Next actions</h2>
				<p>Derived from current evidence. These are not reminders or automated provider actions.</p>
			</div>
			<StatusBadge value={data.nextActions.length ? `${data.nextActions.length} open` : 'clear'} />
		</div>
		{#if data.nextActions.length}
			<ul class="admin-list">
				{#each data.nextActions as action (action.key)}
					<li>
						<div class="issue-line">
							<strong>{action.title}</strong>
							<StatusBadge value={action.severity} />
						</div>
						<p>{action.detail}</p>
						{#if action.destination === 'experiment' && action.experimentId}
							<a
								class="admin-text-link"
								href={resolve('/admin/experiments/[id]', { id: action.experimentId })}
								>Review experiment</a
							>
						{:else if action.destination === 'orders'}
							<a class="admin-text-link" href={resolve('/admin/orders')}>Review orders</a>
						{:else}
							<a class="admin-text-link" href={resolve('/admin/integrations')}
								>Review reconciliation</a
							>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p>No operator action is derived from the current data.</p>
		{/if}
	</section>

	{#if data.metrics.pendingLedger > 0}
		<p class="admin-flash" role="status">
			{data.metrics.pendingLedger} current ledger {data.metrics.pendingLedger === 1
				? 'entry uses'
				: 'entries use'} an estimate or still need EUR reporting data.
		</p>
	{/if}

	<div class="overview-columns">
		<section class="admin-panel" aria-labelledby="issues-heading">
			<div class="admin-panel-header">
				<h2 id="issues-heading">Open issues</h2>
				<a class="admin-text-link" href={resolve('/admin/integrations')}>View operations</a>
			</div>
			{#if data.issues.length}
				<ul class="admin-list">
					{#each data.issues as issue (issue.id)}
						<li>
							<div class="issue-line">
								<strong>{issue.title}</strong>
								<StatusBadge value={issue.severity} />
							</div>
							<p>{issue.detail}</p>
							<div class="admin-meta">
								<span>{issue.provider ?? 'platform'}</span>
								<span>Updated {formatAge(issue.updatedAt)}</span>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p>No open integration issues.</p>
			{/if}
		</section>

		<section class="admin-panel" aria-labelledby="freshness-heading">
			<h2 id="freshness-heading">Data freshness</h2>
			<ul class="admin-list">
				{#each data.latestSyncs as item (item.provider)}
					<li>
						<div class="issue-line">
							<strong>{item.provider}</strong>
							<StatusBadge value={item.run?.status ?? 'never synced'} />
						</div>
						<p>
							{item.run
								? `${formatAge(item.run.finishedAt ?? item.run.startedAt)} · ${item.run.recordsWritten} records written`
								: 'Run the first manual sync from Integrations.'}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	</div>

	<section class="admin-panel" aria-labelledby="overhead-heading">
		<div>
			<h2 id="overhead-heading">Portfolio overhead</h2>
			<p>
				Fixed Shopify subscription, app, VPS, and software costs stay outside experiment
				contribution.
			</p>
		</div>
		<form class="overhead-form" method="POST" action="?/overhead">
			<div class="admin-field-grid">
				<label class="admin-field">Month <input name="month" type="month" required /></label>
				<label class="admin-field"
					>Cost label <input
						name="label"
						required
						maxlength="120"
						placeholder="Shopify subscription"
					/></label
				>
				<label class="admin-field"
					>Amount <input name="amount" inputmode="decimal" required /></label
				>
				<label class="admin-field"
					>Currency <input
						name="currency"
						minlength="3"
						maxlength="3"
						required
						value="EUR"
					/></label
				>
			</div>
			<div class="admin-actions">
				<button class="admin-button secondary" type="submit">Append overhead</button>
			</div>
		</form>
		{#if data.overhead.length}
			<TableFrame label="Portfolio overhead entries">
				<table class="admin-table">
					<thead
						><tr><th scope="col">Month</th><th scope="col">Cost</th><th scope="col">Amount</th></tr
						></thead
					>
					<tbody>
						{#each data.overhead as entry (entry.id)}
							<tr
								><td>{entry.month}</td><th scope="row">{entry.label}</th><td
									>{formatMoneyMinor(entry.amountMinor, entry.currency)}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</TableFrame>
		{/if}
	</section>
</div>

<style>
	.overview-columns {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		gap: 1rem;
		align-items: start;
	}

	.issue-line {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.issue-line strong {
		min-width: 0;
	}

	.overhead-form {
		display: grid;
		gap: 1rem;
	}

	@media (max-width: 980px) {
		.overview-columns {
			grid-template-columns: 1fr;
		}
	}
</style>
