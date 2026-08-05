<script lang="ts">
	import { resolve } from '$app/paths';

	const legalLinks = [
		{ href: '/contact', label: 'Contact' },
		{ href: '/returns', label: 'Returns' },
		{ href: '/terms', label: 'Terms' },
		{ href: '/privacy', label: 'Privacy' },
		{ href: '/imprint', label: 'Imprint' }
	];
</script>

<svelte:head>
	<title>Shirt Darwin</title>
	<meta
		name="description"
		content="Shirt Darwin operates focused independent apparel storefronts."
	/>
</svelte:head>

<div class="company-page">
	<header>
		<a class="wordmark" href={resolve('/')}>Shirt Darwin</a>
		<a class="admin" href={resolve('/admin/login')}>Admin login</a>
	</header>

	<main>
		<h1>Independent apparel, built around focused communities.</h1>
		<p>
			Shirt Darwin develops and operates small, distinct clothing brands. Product orders and secure
			checkout are provided through our commerce partners.
		</p>
		<a class="contact" href={resolve('/contact')}>Contact the company</a>
	</main>

	<footer>
		<p>Shirt Darwin</p>
		<nav aria-label="Company information">
			{#each legalLinks as link (link.href)}
				<a href={resolve(link.href as '/')}>{link.label}</a>
			{/each}
		</nav>
	</footer>
</div>

<style>
	.company-page {
		display: grid;
		grid-template-rows: auto 1fr auto;
		min-height: 100vh;
		background: #ffffff;
		color: #111111;
	}

	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		padding: 1.25rem clamp(1rem, 4vw, 4rem);
	}

	header {
		border-bottom: 1px solid #deded9;
	}

	.wordmark {
		font-size: 1.1rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		text-decoration: none;
	}

	.admin,
	nav a {
		font-size: 0.8125rem;
		text-underline-offset: 0.25em;
	}

	main {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		flex-direction: column;
		max-width: 84rem;
		padding: clamp(4rem, 12vw, 11rem) clamp(1rem, 8vw, 8rem);
	}

	h1,
	main p,
	footer p {
		margin: 0;
	}

	h1 {
		max-width: 15ch;
		font-size: clamp(3rem, 9vw, 8.5rem);
		line-height: 0.92;
		letter-spacing: -0.06em;
	}

	main p {
		max-width: 42rem;
		margin-top: 2rem;
		color: #5f5f5b;
		font-size: clamp(1rem, 2vw, 1.25rem);
		line-height: 1.65;
	}

	.contact {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		margin-top: 2.5rem;
		padding: 0.7rem 1rem;
		border: 1px solid #111111;
		background: #111111;
		color: #ffffff;
		font-weight: 750;
		text-decoration: none;
	}

	footer {
		align-items: baseline;
		border-top: 1px solid #deded9;
		color: #5f5f5b;
		font-size: 0.8125rem;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
	}

	@media (max-width: 40rem) {
		footer {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
