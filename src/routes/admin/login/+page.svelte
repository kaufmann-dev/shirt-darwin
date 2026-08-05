<script lang="ts">
	let { form }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Operator sign in | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="login-shell">
	<section aria-labelledby="login-title">
		<h1 id="login-title">Operator sign in</h1>
		<p>This private console uses the configured Pocket ID account. There is no local password.</p>
		{#if form?.error}<p class="login-error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<button type="submit">Continue with Pocket ID</button>
		</form>
	</section>
</main>

<style>
	.login-shell {
		display: grid;
		min-height: 100vh;
		place-items: center;
		padding: 1rem;
		background: #f4f4f2;
		color: #111111;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	section {
		display: grid;
		gap: 1.25rem;
		width: min(100%, 28rem);
		padding: clamp(1.25rem, 5vw, 2.5rem);
		border: 1px solid #bcbcb6;
		background: #ffffff;
	}

	h1,
	p {
		margin: 0;
	}

	h1 {
		font-size: 2rem;
		letter-spacing: -0.04em;
	}

	p {
		color: #5b5b56;
		line-height: 1.55;
	}

	.login-error {
		padding: 0.75rem;
		border-left: 4px solid #8a1c1c;
		background: #fff0f0;
		color: #791818;
	}

	button {
		width: 100%;
		min-height: 3rem;
		border: 1px solid #111111;
		border-radius: 0;
		background: #111111;
		color: #ffffff;
		font: inherit;
		font-weight: 750;
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid #2167d5;
		outline-offset: 2px;
	}
</style>
