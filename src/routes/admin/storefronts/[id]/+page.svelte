<script lang="ts">
	import AssetUploader from '$lib/components/admin/AssetUploader.svelte';
	import { resolve } from '$app/paths';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatDateTime } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();

	function snapshotTitle(snapshot: Record<string, unknown>) {
		return typeof snapshot.title === 'string' ? snapshot.title : 'Shopify product';
	}
</script>

<svelte:head>
	<title>{data.store.name} | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<div class="admin-meta">
				<a class="admin-text-link" href={resolve('/admin/storefronts')}>Storefronts</a> / {data
					.store.slug}
			</div>
			<h1>{data.store.name}</h1>
			<p>{data.store.slug} · Draft revision {data.store.draftRevision}</p>
		</div>
		<div class="admin-actions">
			<StatusBadge value={data.store.status} />
			<a
				class="admin-link-button secondary"
				href={resolve('/admin/storefronts/[id]/preview', { id: data.store.id })}>Preview draft</a
			>
		</div>
	</header>

	{#if form?.success}<p class="admin-flash" role="status">{form.success}</p>{/if}
	{#if form?.error}<p class="admin-flash error" role="alert">{form.error}</p>{/if}

	<section class="admin-panel" aria-labelledby="readiness-heading">
		<div class="admin-panel-header">
			<div>
				<h2 id="readiness-heading">Publication readiness</h2>
				<p>Technical checks only. Publishing always requires your explicit action.</p>
			</div>
			<StatusBadge value={data.readiness.length === 0 ? 'ready' : 'incomplete'} />
		</div>
		{#if data.readiness.length}
			<ul class="readiness-list">
				{#each data.readiness as issue (issue.code)}
					<li>{issue.message}</li>
				{/each}
			</ul>
		{:else}
			<p>
				Manifest, referenced assets, three design families, nine product mappings, a T-shirt hero,
				and shared legal documents are ready.
			</p>
		{/if}
		<div class="admin-actions publication-actions">
			<form class="stacked-form" method="POST" action="?/publish">
				{#if data.publishExperiments.length > 0}
					<label class="admin-field">
						Experiment using revision {data.draft.revision}
						<select name="experimentId" required>
							{#each data.publishExperiments as experiment (experiment.id)}
								<option value={experiment.id}
									>{experiment.name} · {formatDateTime(experiment.startsAt)} to {formatDateTime(
										experiment.endsAt
									)}</option
								>
							{/each}
						</select>
						<small>Only experiments bound to this exact immutable draft are eligible.</small>
					</label>
				{/if}
				<button
					class="admin-button"
					type="submit"
					disabled={data.readiness.length > 0 || data.publishExperiments.length === 0}
					>Publish current revision</button
				>
			</form>
			{#if data.store.status !== 'archived'}
				<form method="POST" action="?/archive">
					<button class="admin-button danger" type="submit">Archive storefront</button>
				</form>
			{/if}
		</div>
	</section>

	<section class="admin-panel" aria-labelledby="manifest-heading">
		<div>
			<h2 id="manifest-heading">Brand manifest</h2>
			<p>
				MCP and this editor share the same strict schema. Saving creates a new immutable revision.
			</p>
		</div>
		<form class="stacked-form" method="POST" action="?/manifest">
			<input type="hidden" name="expectedRevision" value={data.draft.revision} />
			<label class="admin-field">
				Manifest JSON
				<textarea class="code" name="manifest" spellcheck="false"
					>{JSON.stringify(data.draft.manifest, null, 2)}</textarea
				>
			</label>
			<div class="admin-actions">
				<button class="admin-button" type="submit">Validate and save revision</button>
			</div>
		</form>
	</section>

	<section class="admin-panel" aria-labelledby="brief-heading">
		<div>
			<h2 id="brief-heading">Niche brief</h2>
			<p>MCP reads this research and direction before authoring the brand draft.</p>
		</div>
		<form class="stacked-form" method="POST" action="?/brief">
			<label class="admin-field">
				Audience, promise, tone, constraints, and useful research
				<textarea name="nicheBrief" required maxlength="4000">{data.store.nicheBrief}</textarea>
			</label>
			<div class="admin-actions">
				<button class="admin-button secondary" type="submit">Save niche brief</button>
			</div>
		</form>
	</section>

	<section class="admin-panel" aria-labelledby="assets-heading">
		<div>
			<h2 id="assets-heading">Assets</h2>
			<p>
				Uploads use a short-lived signed URL. Draft files remain private until referenced by a
				published manifest.
			</p>
		</div>
		<AssetUploader storefrontId={data.store.id} />
		{#if data.assets.length}
			<TableFrame label="Brand assets">
				<table class="admin-table">
					<thead>
						<tr>
							<th scope="col">File</th>
							<th scope="col">Asset ID</th>
							<th scope="col">Kind</th>
							<th scope="col">Upload</th>
							<th scope="col">Visibility</th>
							<th scope="col">Size</th>
						</tr>
					</thead>
					<tbody>
						{#each data.assets as asset (asset.id)}
							<tr>
								<th scope="row">{asset.originalName}</th>
								<td><code>{asset.id}</code></td>
								<td>{asset.kind}</td>
								<td><StatusBadge value={asset.confirmedAt ? 'confirmed' : 'upload pending'} /></td>
								<td><StatusBadge value={asset.visibility} /></td>
								<td>{Math.ceil(asset.sizeBytes / 1024)} KB</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</TableFrame>
		{:else}
			<p>No assets uploaded.</p>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="catalog-heading">
		<div>
			<h2 id="catalog-heading">Design families and Shopify mappings</h2>
			<p>
				The initial store needs exactly three designs. Each design maps one T-shirt, hoodie, and
				crewneck imported by Shopify handle.
			</p>
		</div>

		{#if data.designFamilies.length}
			<div class="family-list">
				{#each data.designFamilies as family (family.id)}
					<section class="family" aria-labelledby={`family-${family.id}`}>
						<h3 id={`family-${family.id}`}>{family.name}</h3>
						<p>{family.description}</p>
						<div class="admin-meta">
							<code>{family.id}</code>
							<StatusBadge
								value={family.rightsReviewedAt ? 'rights reviewed' : 'review required'}
							/>
						</div>
						<details>
							<summary>Production files and rights review</summary>
							<form class="stacked-form detail-form" method="POST" action="?/designReview">
								<input type="hidden" name="designFamilyId" value={family.id} />
								<div class="admin-field-grid">
									<label class="admin-field">
										Public mockup image
										<select name="mockupAssetId" required>
											<option value="">Select image</option>
											{#each data.assets.filter((asset) => asset.kind === 'image' && asset.confirmedAt) as asset (asset.id)}
												<option value={asset.id} selected={asset.id === family.mockupAssetId}
													>{asset.originalName}</option
												>
											{/each}
										</select>
									</label>
									<label class="admin-field">
										Private production file
										<select name="printFileAssetId" required>
											<option value="">Select print file</option>
											{#each data.assets.filter((asset) => asset.kind === 'print-file' && asset.confirmedAt) as asset (asset.id)}
												<option value={asset.id} selected={asset.id === family.printFileAssetId}
													>{asset.originalName}</option
												>
											{/each}
										</select>
										<small>This file remains private when the storefront is published.</small>
									</label>
								</div>
								<label class="admin-field">
									Provenance and rights notes
									<textarea name="provenanceNotes" required minlength="10" maxlength="2000"
										>{family.provenanceNotes}</textarea
									>
								</label>
								<label class="review-confirmation">
									<input name="rightsReviewed" type="checkbox" value="yes" required />
									I reviewed the design for trademark, copyright, prohibited content, and community-fit
									risks.
								</label>
								<div class="admin-actions">
									<button class="admin-button" type="submit">Save rights review</button>
								</div>
							</form>
						</details>
						{#if family.mappings.length}
							<TableFrame label={`${family.name} product mappings`}>
								<table class="admin-table">
									<thead>
										<tr>
											<th scope="col">Garment</th>
											<th scope="col">Shopify product</th>
											<th scope="col">Printful ID</th>
											<th scope="col">Assortment</th>
											<th scope="col">Shopify health</th>
											<th scope="col">Action</th>
										</tr>
									</thead>
									<tbody>
										{#each family.mappings as mapping (mapping.id)}
											<tr>
												<th scope="row">{mapping.garment}</th>
												<td
													>{snapshotTitle(mapping.productSnapshot)}<br /><small
														>{mapping.shopifyHandle}</small
													></td
												>
												<td>{mapping.printfulProductId ?? 'Not mapped (optional)'}</td>
												<td><StatusBadge value={mapping.active ? 'active' : 'inactive'} /></td>
												<td
													><StatusBadge
														value={mapping.providerAvailable ? 'available' : 'unavailable'}
													/></td
												>
												<td>
													<form method="POST" action="?/toggleMapping">
														<input type="hidden" name="mappingId" value={mapping.id} />
														<input
															type="hidden"
															name="active"
															value={mapping.active ? 'false' : 'true'}
														/>
														<button class="admin-button secondary" type="submit"
															>{mapping.active ? 'Deactivate' : 'Activate'}</button
														>
													</form>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</TableFrame>
						{:else}
							<p>No Shopify products mapped.</p>
						{/if}
					</section>
				{/each}
			</div>
		{:else}
			<p>No design families created.</p>
		{/if}

		<details>
			<summary>Add a design family</summary>
			<form class="stacked-form detail-form" method="POST" action="?/design">
				<div class="admin-field-grid">
					<label class="admin-field">Name <input name="name" required maxlength="80" /></label>
					<label class="admin-field"
						>Slug <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label
					>
				</div>
				<label class="admin-field"
					>Description <textarea name="description" required maxlength="500"></textarea></label
				>
				<div class="admin-actions">
					<button class="admin-button" type="submit">Add design</button>
				</div>
			</form>
		</details>

		{#if data.designFamilies.length}
			<details>
				<summary>Import or replace a Shopify mapping</summary>
				<form class="stacked-form detail-form" method="POST" action="?/mapping">
					<div class="admin-field-grid">
						<label class="admin-field">
							Design
							<select name="designFamilyId" required>
								{#each data.designFamilies as family (family.id)}<option value={family.id}
										>{family.name}</option
									>{/each}
							</select>
						</label>
						<label class="admin-field">
							Garment
							<select name="garment" required>
								<option value="tshirt">Gildan 5000 T-shirt</option>
								<option value="hoodie">Gildan 18500 hoodie</option>
								<option value="crewneck">Gildan 18000 crewneck</option>
							</select>
						</label>
						<label class="admin-field"
							>Shopify handle <input name="shopifyHandle" required maxlength="255" /></label
						>
						<label class="admin-field">
							Printful product ID (optional)
							<input name="printfulProductId" maxlength="120" />
						</label>
					</div>
					<p class="admin-help">
						The current Shopify product, media, prices, and variants are fetched before the mapping
						is saved. Replacing a garment keeps its previous immutable mapping in the history above.
					</p>
					<div class="admin-actions">
						<button class="admin-button" type="submit">Import and map product</button>
					</div>
				</form>
			</details>
		{/if}
	</section>

	<section class="admin-panel" aria-labelledby="history-heading">
		<h2 id="history-heading">Revision history</h2>
		<ul class="admin-list">
			{#each data.revisions as revision (revision.id)}
				<li>
					<strong>Revision {revision.revision}</strong>
					<div class="admin-meta">
						<span>Created {formatDateTime(revision.createdAt)}</span>
						<span
							>{revision.publishedAt
								? `Published ${formatDateTime(revision.publishedAt)}`
								: 'Not published'}</span
						>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.stacked-form,
	.family-list,
	.family {
		display: grid;
		gap: 1rem;
	}

	.family {
		padding-top: 1rem;
		border-top: 1px solid #c9c9c4;
	}

	.family:first-child {
		padding-top: 0;
		border-top: 0;
	}

	.family h3,
	.family p {
		margin: 0;
	}

	.readiness-list {
		margin: 0;
		padding-left: 1.25rem;
		color: #6c4f0c;
	}

	.publication-actions form {
		display: inline;
	}

	details {
		border-top: 1px solid #c9c9c4;
		padding-top: 1rem;
	}

	summary {
		width: fit-content;
		min-height: 2.5rem;
		font-weight: 750;
		cursor: pointer;
	}

	.detail-form {
		padding-top: 1rem;
	}

	code {
		font-size: 0.75rem;
		word-break: break-all;
	}

	.review-confirmation {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		font-size: 0.875rem;
		font-weight: 650;
		line-height: 1.5;
	}

	.review-confirmation input {
		width: 1.2rem;
		height: 1.2rem;
		margin-top: 0.1rem;
	}

	small {
		color: #666661;
	}
</style>
