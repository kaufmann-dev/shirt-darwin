<script lang="ts">
	import { formatDate } from '$lib/components/admin/format';
	import { resolve } from '$app/paths';

	let { data }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>{data.document.title} | Shirt Darwin</title>
	<meta name="description" content={`${data.document.title}, version ${data.document.version}.`} />
</svelte:head>

<main class="legal-page">
	<a class="back" href={resolve('/')}>Shirt Darwin</a>
	<article>
		<h1>{data.document.title}</h1>
		<p class="version">
			Version {data.document.version} · Published {formatDate(data.document.publishedAt)}
		</p>
		<div class="legal-body">{data.document.body}</div>
	</article>
	<nav aria-label="Legal documents">
		<a href={resolve('/[legal=legal]', { legal: 'imprint' })}>Imprint</a>
		<a href={resolve('/[legal=legal]', { legal: 'privacy' })}>Privacy</a>
		<a href={resolve('/[legal=legal]', { legal: 'terms' })}>Terms</a>
		<a href={resolve('/[legal=legal]', { legal: 'returns' })}>Returns</a>
		<a href={resolve('/contact')}>Contact</a>
	</nav>
</main>

<style>
	.legal-page {
		display: grid;
		gap: 2rem;
		width: min(100% - 2rem, 48rem);
		margin: 0 auto;
		padding: 2rem 0 4rem;
		color: var(--text-primary);
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	a {
		color: inherit;
		text-underline-offset: 0.18em;
	}

	.back {
		width: fit-content;
		font-weight: 800;
		text-decoration: none;
	}

	article {
		display: grid;
		gap: 1rem;
	}

	h1,
	p {
		margin: 0;
	}

	h1 {
		font-size: clamp(2rem, 7vw, 4rem);
		letter-spacing: -0.045em;
		line-height: 1;
	}

	.version {
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.legal-body {
		padding-top: 1rem;
		border-top: 1px solid var(--border-default);
		font-size: 1rem;
		line-height: 1.7;
		white-space: pre-wrap;
	}

	nav {
		display: flex;
		gap: 0.75rem 1.25rem;
		flex-wrap: wrap;
		padding-top: 1rem;
		border-top: 1px solid var(--border-default);
		font-size: 0.875rem;
	}

	a:focus-visible {
		outline: 3px solid var(--accent-primary);
		outline-offset: 3px;
	}
</style>
