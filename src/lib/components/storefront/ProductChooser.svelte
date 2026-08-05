<script lang="ts">
	import {
		availableColors,
		availableSizes,
		designImage,
		firstAvailableGarment,
		formatPrice,
		productForGarment,
		selectedVariant
	} from './model';
	import { untrack } from 'svelte';
	import { garmentLabels, garments, type Garment, type StorefrontDesign } from './types';

	interface Props {
		design: StorefrontDesign;
		preview?: boolean;
	}

	let { design, preview = false }: Props = $props();
	let chosenGarment = $state<Garment | null>(untrack(() => firstAvailableGarment(design)));
	let initialProduct = untrack(() =>
		chosenGarment ? productForGarment(design, chosenGarment) : undefined
	);
	let chosenColor = $state<string | null>(availableColors(initialProduct)[0] ?? null);
	let chosenSize = $state<string | null>(
		untrack(() => availableSizes(initialProduct, chosenColor)[0] ?? null)
	);
	let checkoutState = $state<'idle' | 'loading'>('idle');
	let checkoutError = $state('');

	let product = $derived(chosenGarment ? productForGarment(design, chosenGarment) : undefined);
	let colors = $derived(availableColors(product));
	let sizes = $derived(availableSizes(product, chosenColor));
	let variant = $derived(selectedVariant(product, chosenColor, chosenSize));
	let image = $derived(
		variant?.image ?? product?.featuredImage ?? product?.images[0] ?? designImage(design)
	);

	function chooseGarment(garment: Garment) {
		chosenGarment = garment;
		const nextProduct = productForGarment(design, garment);
		chosenColor = availableColors(nextProduct)[0] ?? null;
		chosenSize = availableSizes(nextProduct, chosenColor)[0] ?? null;
		checkoutError = '';
	}

	function chooseColor(event: Event) {
		chosenColor = (event.currentTarget as HTMLSelectElement).value || null;
		chosenSize = availableSizes(product, chosenColor)[0] ?? null;
		checkoutError = '';
	}

	function chooseSize(event: Event) {
		chosenSize = (event.currentTarget as HTMLSelectElement).value || null;
		checkoutError = '';
	}

	async function startCheckout() {
		if (!variant || preview || checkoutState === 'loading') return;
		checkoutState = 'loading';
		checkoutError = '';
		try {
			const response = await fetch('/api/cart', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ merchandiseId: variant.id, quantity: 1 })
			});
			const payload = (await response.json()) as { checkoutUrl?: unknown; error?: unknown };
			if (!response.ok || typeof payload.checkoutUrl !== 'string') {
				throw new Error(
					typeof payload.error === 'string' ? payload.error : 'Checkout is temporarily unavailable.'
				);
			}
			const checkoutUrl = new URL(payload.checkoutUrl);
			if (checkoutUrl.protocol !== 'https:')
				throw new Error('Checkout returned an invalid address.');
			document.dispatchEvent(
				new CustomEvent('shirt-darwin:track', {
					detail: {
						eventName: 'InitiateCheckout',
						currency: variant.price.currencyCode,
						value: Number(variant.price.amount),
						contentIds: [product?.shopifyProductId ?? variant.id]
					}
				})
			);
			window.location.assign(checkoutUrl);
		} catch (cause) {
			checkoutError =
				cause instanceof Error ? cause.message : 'Checkout is temporarily unavailable.';
			checkoutState = 'idle';
		}
	}
</script>

<div class="chooser">
	<div class="product-image">
		{#if image}
			<img src={image.url} alt={image.altText || `${design.name} product preview`} />
		{:else}
			<div class="image-empty" aria-hidden="true">{design.name.slice(0, 1)}</div>
		{/if}
	</div>

	<div class="configuration">
		<div>
			<h2>{design.name}</h2>
			<p class="description">{design.description}</p>
		</div>

		{#if design.products.length > 0}
			<fieldset>
				<legend>Garment</legend>
				<div class="garment-options">
					{#each garments as garment (garment)}
						{@const garmentProduct = productForGarment(design, garment)}
						<button
							type="button"
							class:active={chosenGarment === garment}
							aria-pressed={chosenGarment === garment}
							disabled={!garmentProduct}
							onclick={() => chooseGarment(garment)}
						>
							{garmentLabels[garment]}
						</button>
					{/each}
				</div>
			</fieldset>

			{#if product}
				<p class="price">{formatPrice(variant?.price ?? product.variants[0]?.price ?? null)}</p>

				<div class="selectors">
					{#if colors.length > 0}
						<label>
							<span>Color</span>
							<select value={chosenColor ?? ''} onchange={chooseColor}>
								{#each colors as color (color)}
									<option value={color}>{color}</option>
								{/each}
							</select>
						</label>
					{/if}

					{#if sizes.length > 0}
						<label>
							<span>Size</span>
							<select value={chosenSize ?? ''} onchange={chooseSize}>
								{#each sizes as size (size)}
									<option value={size}>{size}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>

				<button
					class="checkout"
					type="button"
					disabled={!variant || preview || checkoutState === 'loading'}
					onclick={startCheckout}
				>
					{preview
						? 'Checkout disabled in preview'
						: checkoutState === 'loading'
							? 'Opening secure checkout…'
							: variant
								? 'Continue to checkout'
								: 'Selection unavailable'}
				</button>
				<p class="checkout-note">Guest checkout is securely handled by Shopify.</p>
				{#if checkoutError}
					<p class="error" role="alert">{checkoutError}</p>
				{/if}
			{/if}
		{:else}
			<div class="empty" role="status">
				<strong>This design is being prepared.</strong>
				<span>Check back soon for available garments and sizes.</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.chooser {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
		gap: clamp(2rem, 6vw, 6rem);
		align-items: start;
	}

	.product-image {
		display: grid;
		aspect-ratio: 4 / 5;
		overflow: hidden;
		place-items: center;
		border: 1px solid var(--brand-border);
		background: var(--brand-surface);
	}

	.product-image img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.image-empty {
		color: var(--brand-muted);
		font-family: var(--brand-heading-font);
		font-size: clamp(6rem, 18vw, 12rem);
		font-weight: 800;
	}

	.configuration {
		display: grid;
		gap: 1.75rem;
		position: sticky;
		top: 2rem;
		padding-top: 0.5rem;
	}

	h2,
	p,
	fieldset {
		margin: 0;
	}

	h2 {
		font-family: var(--brand-heading-font);
		font-size: clamp(2rem, 5vw, 4.5rem);
		line-height: 0.98;
		letter-spacing: -0.04em;
	}

	.description {
		max-width: 38rem;
		margin-top: 1rem;
		color: var(--brand-muted);
		line-height: 1.6;
	}

	.price {
		font-size: 1.35rem;
		font-weight: 700;
	}

	fieldset {
		padding: 0;
		border: 0;
	}

	legend,
	label span {
		display: block;
		margin-bottom: 0.6rem;
		font-size: 0.75rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.garment-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.garment-options button,
	.checkout,
	select {
		min-height: 3rem;
		border: 1px solid var(--brand-border);
		border-radius: var(--brand-radius);
		background: var(--brand-background);
		color: var(--brand-text);
	}

	.garment-options button {
		padding: 0.65rem;
		cursor: pointer;
	}

	.garment-options button.active {
		border-color: var(--brand-primary);
		background: var(--brand-primary);
		color: var(--brand-primary-contrast);
	}

	.garment-options button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.selectors {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	select {
		width: 100%;
		padding: 0 0.75rem;
	}

	.checkout {
		width: 100%;
		min-height: 3.25rem;
		padding: 0.75rem 1rem;
		border-color: var(--brand-primary);
		background: var(--brand-primary);
		color: var(--brand-primary-contrast);
		font-weight: 750;
		cursor: pointer;
	}

	.checkout:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.checkout-note,
	.error {
		margin-top: -1rem;
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.checkout-note {
		color: var(--brand-muted);
	}

	.error {
		font-weight: 700;
	}

	.empty {
		display: grid;
		gap: 0.5rem;
		padding: 1.25rem;
		border: 1px solid var(--brand-border);
		background: var(--brand-surface);
	}

	.empty span {
		color: var(--brand-muted);
	}

	@media (max-width: 48rem) {
		.chooser {
			grid-template-columns: 1fr;
		}

		.configuration {
			position: static;
		}
	}

	@media (max-width: 26rem) {
		.garment-options,
		.selectors {
			grid-template-columns: 1fr;
		}
	}
</style>
