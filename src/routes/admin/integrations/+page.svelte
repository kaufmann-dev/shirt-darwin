<script lang="ts">
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatDateTime, formatMoneyMinor } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Integrations | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<h1>Integrations</h1>
			<p>Webhook, reconciliation, and read-model health. Provider changes remain manual.</p>
		</div>
		<StatusBadge value={data.jobHealth.started ? 'worker ready' : 'worker unavailable'} />
	</header>

	{#if form?.success}<p class="admin-flash" role="status">{form.success}</p>{/if}
	{#if form?.error}<p class="admin-flash error" role="alert">{form.error}</p>{/if}

	<section class="admin-panel" aria-labelledby="sync-heading">
		<div>
			<h2 id="sync-heading">Sync now</h2>
			<p>
				Queue an idempotent reconciliation. Nightly runs and verified webhooks continue
				automatically.
			</p>
		</div>
		<div class="admin-actions">
			{#each ['shopify', 'printful', 'meta'] as provider (provider)}
				<form method="POST" action="?/sync">
					<input type="hidden" name="provider" value={provider} />
					<button class="admin-button secondary" type="submit">Sync {provider}</button>
				</form>
			{/each}
		</div>
	</section>

	<section class="admin-panel" aria-labelledby="issues-heading">
		<h2 id="issues-heading">Integration issues</h2>
		{#if data.issues.length}
			<TableFrame label="Integration issues">
				<table class="admin-table">
					<thead>
						<tr>
							<th scope="col">Issue</th>
							<th scope="col">Provider</th>
							<th scope="col">Severity</th>
							<th scope="col">State</th>
							<th scope="col">Updated</th>
							<th scope="col">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each data.issues as issue (issue.id)}
							<tr>
								<th scope="row">{issue.title}<br /><small>{issue.detail}</small></th>
								<td>{issue.provider ?? 'platform'}</td>
								<td><StatusBadge value={issue.severity} /></td>
								<td><StatusBadge value={issue.status} /></td>
								<td>{formatDateTime(issue.updatedAt)}</td>
								<td>
									{#if issue.status === 'open'}
										<form method="POST" action="?/resolve">
											<input type="hidden" name="issueId" value={issue.id} />
											<button class="admin-button secondary" type="submit">Resolve</button>
										</form>
									{:else}—{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</TableFrame>
		{:else}
			<EmptyState
				title="No integration issues"
				detail="Provider and mapping problems will appear here when detected."
			/>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="fx-heading">
		<div>
			<h2 id="fx-heading">EUR ledger reconciliation</h2>
			<p>
				Provider-native USD and other non-EUR facts remain pending until you enter the actual EUR
				settlement or invoice value. Reconciliation appends a new revision; it never edits the
				provider fact.
			</p>
		</div>
		{#if data.pendingFxEntries.length}
			<TableFrame label="Ledger entries awaiting actual EUR values">
				<table class="admin-table">
					<thead>
						<tr>
							<th scope="col">Occurred</th>
							<th scope="col">Fact</th>
							<th scope="col">Native amount</th>
							<th scope="col">Actual EUR</th>
						</tr>
					</thead>
					<tbody>
						{#each data.pendingFxEntries as entry (entry.id)}
							<tr>
								<td>{formatDateTime(entry.occurredAt)}</td>
								<th scope="row">
									{entry.kind}<br /><small
										>{entry.source} · {entry.sourceReference} · r{entry.revision}</small
									>
								</th>
								<td>{formatMoneyMinor(entry.amountMinor, entry.currency)}</td>
								<td>
									<form class="fx-form" method="POST" action="?/fx">
										<input type="hidden" name="entryId" value={entry.id} />
										<label>
											<span class="sr-only">Absolute EUR value for {entry.kind}</span>
											<input
												name="reportingAmountEur"
												inputmode="decimal"
												placeholder="0.00"
												required
											/>
										</label>
										<button class="admin-button secondary" type="submit">Reconcile</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</TableFrame>
		{:else}
			<p>Every current ledger entry has an actual EUR reporting value.</p>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="history-heading">
		<h2 id="history-heading">Sync history</h2>
		{#if data.runs.length}
			<TableFrame label="Sync runs">
				<table class="admin-table">
					<thead>
						<tr>
							<th scope="col">Provider</th>
							<th scope="col">Trigger</th>
							<th scope="col">State</th>
							<th scope="col">Started</th>
							<th scope="col">Finished</th>
							<th scope="col">Read / written</th>
							<th scope="col">Error</th>
						</tr>
					</thead>
					<tbody>
						{#each data.runs as run (run.id)}
							<tr>
								<th scope="row">{run.provider}</th>
								<td>{run.trigger}</td>
								<td><StatusBadge value={run.status} /></td>
								<td>{formatDateTime(run.startedAt)}</td>
								<td>{formatDateTime(run.finishedAt)}</td>
								<td>{run.recordsRead} / {run.recordsWritten}</td>
								<td>{run.error ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</TableFrame>
		{:else}
			<EmptyState title="No syncs yet" detail="Queue the first provider reconciliation above." />
		{/if}
	</section>
</div>

<style>
	small {
		color: #666661;
		font-weight: 450;
	}

	.fx-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.fx-form input {
		width: 8rem;
		min-height: 2.5rem;
		padding: 0.5rem;
		border: 1px solid #8e8e88;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
