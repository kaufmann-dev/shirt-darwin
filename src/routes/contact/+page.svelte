<script lang="ts">
	import { resolve } from '$app/paths';

	let { data }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Contact | Shirt Darwin</title>
	<meta name="description" content="Contact the merchant operating Shirt Darwin storefronts." />
</svelte:head>

<main class="contact-page">
	<a class="back" href={resolve('/')}>Shirt Darwin</a>
	<section>
		<h1>Contact</h1>
		<p>{data.contact.responseNote}</p>
		<a class="email" href={`mailto:${data.contact.email}`}>{data.contact.email}</a>
	</section>
	<nav aria-label="Legal documents">
		<a href={resolve('/[legal=legal]', { legal: 'imprint' })}>Imprint</a>
		<a href={resolve('/[legal=legal]', { legal: 'privacy' })}>Privacy</a>
		<a href={resolve('/[legal=legal]', { legal: 'terms' })}>Terms</a>
		<a href={resolve('/[legal=legal]', { legal: 'returns' })}>Returns</a>
	</nav>
</main>

<style>
	.contact-page {
		display: grid;
		gap: 2rem;
		width: min(100% - 2rem, 48rem);
		margin: 0 auto;
		padding: 2rem 0 4rem;
		color: var(--text-primary);
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	section {
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

	p {
		max-width: 60ch;
		line-height: 1.6;
	}

	.email {
		width: fit-content;
		font-size: clamp(1.1rem, 4vw, 1.5rem);
		font-weight: 800;
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
