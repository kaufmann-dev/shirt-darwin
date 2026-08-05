<script lang="ts">
	import { resolve } from '$app/paths';

	interface Props {
		brandName: string;
		legalBaseUrl: string;
	}

	let { brandName, legalBaseUrl }: Props = $props();
	const year = new Date().getUTCFullYear();
	let links = $derived([
		{ href: `${legalBaseUrl}/contact`, label: 'Contact' },
		{ href: `${legalBaseUrl}/returns`, label: 'Returns' },
		{ href: `${legalBaseUrl}/terms`, label: 'Terms' },
		{ href: `${legalBaseUrl}/privacy`, label: 'Privacy' },
		{ href: `${legalBaseUrl}/imprint`, label: 'Imprint' }
	]);
</script>

<footer>
	<p>© {year} {brandName}</p>
	<nav aria-label="Legal and support">
		{#each links as link (link.href)}
			{#if link.href.startsWith('http://') || link.href.startsWith('https://')}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- absolute central-domain links must not use SvelteKit resolve -->
				<a href={link.href} data-sveltekit-reload>{link.label}</a>
			{:else}
				<a href={resolve(link.href as '/')}>{link.label}</a>
			{/if}
		{/each}
	</nav>
</footer>

<style>
	footer {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 2rem;
		padding: 2rem clamp(1rem, 4vw, 4rem);
		border-top: 1px solid var(--brand-border);
		background: var(--brand-background);
		color: var(--brand-muted);
		font-size: 0.8125rem;
	}

	footer p {
		margin: 0;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
	}

	a {
		text-underline-offset: 0.25em;
	}

	@media (max-width: 40rem) {
		footer {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
