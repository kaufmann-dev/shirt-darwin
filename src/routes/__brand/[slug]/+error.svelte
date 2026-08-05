<script lang="ts">
	import { page } from '$app/state';

	let title = $derived(page.status === 404 ? 'Storefront unavailable' : 'Something went wrong');
	let message = $derived(
		page.status === 404
			? 'This storefront is not published, has been archived, or does not exist.'
			: 'The storefront could not be loaded. Please try again later.'
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main>
	<p>{page.status}</p>
	<h1>{title}</h1>
	<span>{message}</span>
</main>

<style>
	main {
		display: grid;
		min-height: 100vh;
		padding: clamp(1.5rem, 6vw, 6rem);
		place-content: center;
		background: #ffffff;
		color: #111111;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		text-align: center;
	}

	p,
	h1,
	span {
		margin: 0;
	}

	p {
		font-size: 0.75rem;
		font-weight: 750;
		letter-spacing: 0.1em;
	}

	h1 {
		margin-top: 0.75rem;
		font-size: clamp(2.5rem, 8vw, 6rem);
		letter-spacing: -0.05em;
	}

	span {
		max-width: 38rem;
		margin: 1rem auto 0;
		color: #5f5f5b;
		line-height: 1.6;
	}
</style>
