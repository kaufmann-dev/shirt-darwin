<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>{page.status} — Shirt Darwin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
	<p class="text-sm font-semibold">{page.status}</p>
	<h1 class="mt-3 text-4xl font-semibold tracking-tight">This page is unavailable.</h1>
	<p class="mt-4 max-w-xl text-muted-foreground">
		{page.error?.message ?? 'The requested page could not be loaded.'}
	</p>
	<a class="mt-8 w-fit border border-foreground px-4 py-3 font-medium" href={resolve('/')}>
		Return home
	</a>
</main>
