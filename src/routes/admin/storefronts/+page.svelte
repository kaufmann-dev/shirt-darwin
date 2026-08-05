<script lang="ts">
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import { resolve } from '$app/paths';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatDateTime } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();
	const createForm = $derived(form?.createForm ?? data.createForm);
</script>

<svelte:head>
	<title>Storefronts | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<h1>Storefronts</h1>
			<p>Draft, preview, map products, and deliberately publish each niche brand.</p>
		</div>
	</header>

	{#if data.storefronts.length}
		<TableFrame label="Storefronts">
			<table class="admin-table">
				<thead>
					<tr>
						<th scope="col">Brand</th>
						<th scope="col">Status</th>
						<th scope="col">Draft revision</th>
						<th scope="col">Product mappings</th>
						<th scope="col">Updated</th>
						<th scope="col">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each data.storefronts as storefront (storefront.id)}
						<tr>
							<th scope="row">
								{storefront.name}<br />
								<small>{storefront.slug}</small>
							</th>
							<td><StatusBadge value={storefront.status} /></td>
							<td>{storefront.draftRevision}</td>
							<td>{storefront.productMappings} / 9</td>
							<td>{formatDateTime(storefront.updatedAt)}</td>
							<td
								><a
									class="admin-text-link"
									href={resolve('/admin/storefronts/[id]', { id: storefront.id })}>Manage</a
								></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</TableFrame>
	{:else}
		<EmptyState
			title="No storefronts yet"
			detail="Create the first draft below, then author its brand through MCP or the manifest editor."
		/>
	{/if}

	<section class="admin-panel" aria-labelledby="create-heading">
		<h2 id="create-heading">Create storefront draft</h2>
		<p>The slug becomes the brand subdomain and cannot contain dots.</p>
		{#if form?.createError}<p class="admin-flash error" role="alert">{form.createError}</p>{/if}
		<form method="POST" action="?/create">
			<div class="admin-field-grid">
				<label class="admin-field">
					Brand name
					<input
						name="name"
						autocomplete="off"
						required
						maxlength="64"
						value={createForm.data.name ?? ''}
					/>
					{#if createForm.errors.name}<span class="admin-field-error">{createForm.errors.name}</span
						>{/if}
				</label>
				<label class="admin-field">
					Subdomain slug
					<input
						name="slug"
						autocomplete="off"
						required
						maxlength="48"
						pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
						value={createForm.data.slug ?? ''}
					/>
					{#if createForm.errors.slug}<span class="admin-field-error">{createForm.errors.slug}</span
						>{/if}
				</label>
			</div>
			<label class="admin-field">
				Niche brief
				<textarea name="nicheBrief" required maxlength="4000"
					>{createForm.data.nicheBrief ?? ''}</textarea
				>
				<small
					>Give the MCP authoring agent the audience, promise, tone, constraints, and useful
					research.</small
				>
				{#if createForm.errors.nicheBrief}<span class="admin-field-error"
						>{createForm.errors.nicheBrief}</span
					>{/if}
			</label>
			<div class="admin-actions">
				<button class="admin-button" type="submit">Create draft</button>
			</div>
		</form>
	</section>
</div>

<style>
	small {
		color: #666661;
		font-weight: 450;
	}

	form {
		display: grid;
		gap: 1rem;
	}
</style>
