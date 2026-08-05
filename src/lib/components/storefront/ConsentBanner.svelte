<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { ConsentDecision } from '$lib/domain/consent';
	import type { ShopifyPrivacyConfig } from './types';

	interface Props {
		privacyConfig?: ShopifyPrivacyConfig | null;
		initialConsent?: ConsentDecision | null;
	}

	type CustomerPrivacy = {
		currentVisitorConsent(): {
			analytics: string;
			marketing: string;
			preferences: string;
			sale_of_data: string;
		};
		getRegion(): string;
		shouldShowBanner(): boolean;
		marketingAllowed(): boolean;
		saleOfDataAllowed(): boolean;
		setTrackingConsent(
			choice: {
				analytics: boolean;
				marketing: boolean;
				preferences: boolean;
				sale_of_data: boolean;
				headlessStorefront: true;
				checkoutRootDomain: string;
				storefrontRootDomain: string;
				storefrontAccessToken: string;
			},
			callback: (error?: unknown) => void
		): void;
	};

	type ShopifyGlobal = {
		customerPrivacy?: CustomerPrivacy;
		loadFeatures?: (
			features: Array<{ name: string; version: string }>,
			callback: (error?: unknown) => void
		) => void;
	};

	let { privacyConfig = null, initialConsent = null }: Props = $props();
	let status = $state<'prompt' | 'saving' | 'saved'>(
		untrack(() => (initialConsent ? 'saved' : 'prompt'))
	);
	let apiState = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
	let errorMessage = $state('');
	let region = $state('');
	let regionRequiresChoice = $state(true);
	let globalPrivacyControl = $state(false);
	let customerPrivacy: CustomerPrivacy | null = null;

	const scriptUrl =
		'https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.1/consent-tracking-api.js';

	onMount(() => {
		globalPrivacyControl = Boolean(
			(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
		);
		if (effectiveMarketing(initialConsent)) notifyMarketingConsent(true);
		if (privacyConfig) void initialiseShopifyPrivacy();
	});

	function effectiveMarketing(decision: ConsentDecision | null) {
		return Boolean(decision?.marketing && decision.saleOfData && !globalPrivacyControl);
	}

	function notifyMarketingConsent(allowed: boolean) {
		document.dispatchEvent(
			new CustomEvent('shirt-darwin:marketing-consent', { detail: { allowed } })
		);
	}

	async function initialiseShopifyPrivacy() {
		apiState = 'loading';
		try {
			customerPrivacy = await loadCustomerPrivacy();
			region = customerPrivacy.getRegion();
			regionRequiresChoice = customerPrivacy.shouldShowBanner();
			apiState = 'ready';
		} catch {
			customerPrivacy = null;
			apiState = 'failed';
		}
	}

	function loadCustomerPrivacy(): Promise<CustomerPrivacy> {
		return new Promise((resolve, reject) => {
			const current = shopifyGlobal();
			if (current?.customerPrivacy) {
				resolve(current.customerPrivacy);
				return;
			}

			const finish = () => {
				const shopify = shopifyGlobal();
				if (!shopify?.loadFeatures) {
					reject(new Error('Shopify privacy loader is unavailable'));
					return;
				}
				shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], (loadError) => {
					const api = shopifyGlobal()?.customerPrivacy;
					if (loadError || !api) reject(new Error('Shopify privacy API failed to load'));
					else resolve(api);
				});
			};

			const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
			if (existing) {
				if (shopifyGlobal()?.loadFeatures) finish();
				else {
					existing.addEventListener('load', finish, { once: true });
					existing.addEventListener('error', () => reject(new Error('Privacy script failed')), {
						once: true
					});
				}
				return;
			}

			const script = document.createElement('script');
			script.src = scriptUrl;
			script.async = true;
			script.addEventListener('load', finish, { once: true });
			script.addEventListener('error', () => reject(new Error('Privacy script failed')), {
				once: true
			});
			document.head.append(script);
		});
	}

	function shopifyGlobal(): ShopifyGlobal | undefined {
		return (window as Window & { Shopify?: ShopifyGlobal }).Shopify;
	}

	async function syncShopify(marketing: boolean): Promise<boolean> {
		if (!privacyConfig) return marketing && !globalPrivacyControl;
		if (!customerPrivacy && apiState !== 'failed') {
			try {
				customerPrivacy = await loadCustomerPrivacy();
				apiState = 'ready';
			} catch {
				apiState = 'failed';
			}
		}

		if (!customerPrivacy) {
			if (!marketing) return false;
			throw new Error('Marketing consent could not be saved. Necessary cookies remain active.');
		}

		const safeMarketing = marketing && !globalPrivacyControl;
		await new Promise<void>((resolve, reject) => {
			customerPrivacy?.setTrackingConsent(
				{
					analytics: safeMarketing,
					marketing: safeMarketing,
					preferences: false,
					sale_of_data: safeMarketing,
					headlessStorefront: true,
					checkoutRootDomain: privacyConfig.checkoutRootDomain,
					storefrontRootDomain: privacyConfig.storefrontRootDomain,
					storefrontAccessToken: privacyConfig.storefrontAccessToken
				},
				(saveError) => (saveError ? reject(saveError) : resolve())
			);
		});

		return (
			safeMarketing && customerPrivacy.marketingAllowed() && customerPrivacy.saleOfDataAllowed()
		);
	}

	async function saveChoice(marketing: boolean) {
		if (status === 'saving') return;
		status = 'saving';
		errorMessage = '';
		try {
			const allowed = await syncShopify(marketing);
			const response = await fetch('/api/consent', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ analytics: allowed, marketing: allowed })
			});
			if (!response.ok) throw new Error('Your privacy choice could not be saved.');
			status = 'saved';
			if (allowed && new URL(window.location.href).searchParams.has('sd')) {
				window.location.reload();
				return;
			}
			notifyMarketingConsent(allowed);
		} catch (cause) {
			status = 'prompt';
			errorMessage =
				cause instanceof Error ? cause.message : 'Your privacy choice could not be saved.';
		}
	}
</script>

{#if status === 'prompt' || status === 'saving'}
	<aside class="consent" aria-labelledby="consent-title">
		<div>
			<h2 id="consent-title">Privacy choices</h2>
			<p>
				We use necessary storage for checkout. With your permission, we also use analytics and
				marketing measurement.
			</p>
			{#if region}
				<p class="context">
					Detected region: {region}{regionRequiresChoice ? ' · consent required' : ''}
				</p>
			{/if}
			{#if globalPrivacyControl}
				<p class="context">Your browser’s Global Privacy Control signal is active.</p>
			{/if}
			{#if apiState === 'failed'}
				<p class="context">Marketing remains off because the privacy service is unavailable.</p>
			{/if}
			{#if errorMessage}
				<p class="error" role="alert">{errorMessage}</p>
			{/if}
		</div>
		<div class="actions">
			<button type="button" disabled={status === 'saving'} onclick={() => saveChoice(false)}>
				Use necessary only
			</button>
			<button
				type="button"
				class="accept"
				disabled={status === 'saving' || globalPrivacyControl || apiState === 'failed'}
				onclick={() => saveChoice(true)}
			>
				{status === 'saving' ? 'Saving…' : 'Allow analytics and marketing'}
			</button>
		</div>
	</aside>
{:else}
	<button class="privacy-trigger" type="button" onclick={() => (status = 'prompt')}>
		Privacy choices
	</button>
{/if}

<style>
	.consent {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1.5rem;
		position: fixed;
		z-index: 30;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		max-width: 70rem;
		margin: 0 auto;
		padding: 1.25rem;
		border: 1px solid var(--brand-text);
		background: var(--brand-background);
		color: var(--brand-text);
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--brand-heading-font);
		font-size: 1rem;
	}

	p {
		max-width: 52rem;
		margin-top: 0.4rem;
		font-size: 0.875rem;
		line-height: 1.45;
	}

	.context {
		color: var(--brand-muted);
		font-size: 0.75rem;
	}

	.error {
		font-weight: 700;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.actions button,
	.privacy-trigger {
		min-height: 2.75rem;
		padding: 0.65rem 0.85rem;
		border: 1px solid var(--brand-border);
		border-radius: var(--brand-radius);
		background: var(--brand-background);
		color: var(--brand-text);
		font-weight: 700;
		cursor: pointer;
	}

	.actions .accept {
		border-color: var(--brand-primary);
		background: var(--brand-primary);
		color: var(--brand-primary-contrast);
	}

	.actions button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.privacy-trigger {
		position: fixed;
		z-index: 20;
		right: 1rem;
		bottom: 1rem;
		min-height: 2.5rem;
		background: var(--brand-surface);
		font-size: 0.75rem;
	}

	@media (max-width: 48rem) {
		.consent {
			grid-template-columns: 1fr;
		}

		.actions {
			align-items: stretch;
			flex-direction: column-reverse;
		}
	}
</style>
