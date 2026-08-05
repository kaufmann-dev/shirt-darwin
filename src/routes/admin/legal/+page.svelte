<script lang="ts">
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import { resolve } from '$app/paths';
	import { formatDateTime } from '$lib/components/admin/format';

	let { data, form }: import('./$types').PageProps = $props();

	const defaultTitles: Record<string, string> = {
		imprint: 'Imprint',
		privacy: 'Privacy statement',
		terms: 'Terms and conditions',
		returns: 'Returns and refunds'
	};
</script>

<svelte:head>
	<title>Legal and contact | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<h1>Legal and contact</h1>
			<p>Shared public documents for the parent merchant and every niche storefront.</p>
		</div>
	</header>

	<p class="admin-flash">
		Supply text reviewed for the Austrian merchant and US launch market. This editor does not
		generate legal advice.
	</p>
	{#if form?.success}<p class="admin-flash" role="status">{form.success}</p>{/if}
	{#if form?.error}<p class="admin-flash error" role="alert">{form.error}</p>{/if}

	<section class="admin-panel" aria-labelledby="contact-heading">
		<div>
			<h2 id="contact-heading">Public support contact</h2>
			<p>
				Shopify remains the system for customer and order details; this address is the public entry
				point.
			</p>
		</div>
		<form class="stacked-form" method="POST" action="?/contact">
			<div class="admin-field-grid">
				<label class="admin-field"
					>Support email <input
						name="email"
						type="email"
						required
						value={data.contact.email}
					/></label
				>
				<label class="admin-field"
					>Public response note <input
						name="responseNote"
						required
						maxlength="300"
						value={data.contact.responseNote}
					/></label
				>
			</div>
			<div class="admin-actions">
				<button class="admin-button" type="submit">Save contact</button>
				<a class="admin-link-button secondary" href={resolve('/contact')}>Open public page</a>
			</div>
		</form>
	</section>

	{#each data.documents as item (item.type)}
		<section class="admin-panel" aria-labelledby={`legal-${item.type}`}>
			<div class="admin-panel-header">
				<div>
					<h2 id={`legal-${item.type}`}>{defaultTitles[item.type]}</h2>
					<p>
						{item.published
							? `Published version ${item.published.version} on ${formatDateTime(item.published.publishedAt)}`
							: 'No version published'}
					</p>
				</div>
				<StatusBadge value={item.published ? 'published' : 'missing'} />
			</div>

			<form class="stacked-form" method="POST" action="?/save">
				<input type="hidden" name="type" value={item.type} />
				<label class="admin-field"
					>Title <input
						name="title"
						required
						maxlength="120"
						value={item.current?.title ?? defaultTitles[item.type]}
					/></label
				>
				<label class="admin-field">
					Plain-text document
					<textarea name="body" required maxlength="100000">{item.current?.body ?? ''}</textarea>
					<small>Line breaks are preserved. HTML is never rendered.</small>
				</label>
				<div class="admin-actions">
					<button class="admin-button secondary" type="submit">Save draft</button>
					<a
						class="admin-link-button secondary"
						href={resolve('/[legal=legal]', { legal: item.type })}>Open public page</a
					>
				</div>
			</form>

			{#if item.current && item.current.publishedAt === null}
				<form method="POST" action="?/publish">
					<input type="hidden" name="documentId" value={item.current.id} />
					<button class="admin-button" type="submit">Publish version {item.current.version}</button>
				</form>
			{/if}
		</section>
	{/each}
</div>

<style>
	.stacked-form {
		display: grid;
		gap: 1rem;
	}
</style>
