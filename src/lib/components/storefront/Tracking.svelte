<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { onMount } from 'svelte';
	import type { ConsentDecision } from '$lib/domain/consent';
	import { resolveMetaFbc } from '$lib/domain/meta-browser-ids';

	type TrackableEvent = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout';
	type TrackingDetail = {
		eventName: TrackableEvent;
		currency?: string;
		value?: number;
		contentIds?: string[];
	};
	type Fbq = ((...arguments_: unknown[]) => void) & {
		callMethod?: (...arguments_: unknown[]) => void;
		queue: unknown[][];
		loaded: boolean;
		version: string;
	};

	interface Props {
		initialConsent?: ConsentDecision | null;
		initialEvent: TrackingDetail;
	}

	let { initialConsent = null, initialEvent }: Props = $props();
	let allowed = false;
	let sentInitial = false;
	let initializedPixelId = '';

	onMount(() => {
		const globalPrivacyControl = Boolean(
			(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
		);
		allowed = Boolean(
			initialConsent?.marketing && initialConsent.saleOfData && !globalPrivacyControl
		);

		function handleConsent(event: Event) {
			const detail = (event as CustomEvent<{ allowed: boolean }>).detail;
			allowed = detail.allowed && !globalPrivacyControl;
			setPixelConsent(allowed);
			if (allowed) sendInitial();
			else clearMetaCookies();
		}

		function handleTracking(event: Event) {
			if (!allowed) return;
			const detail = (event as CustomEvent<TrackingDetail>).detail;
			if (detail) void send(detail);
		}

		document.addEventListener('shirt-darwin:marketing-consent', handleConsent);
		document.addEventListener('shirt-darwin:track', handleTracking);
		if (allowed) {
			setPixelConsent(true);
			sendInitial();
		} else clearMetaCookies();

		return () => {
			document.removeEventListener('shirt-darwin:marketing-consent', handleConsent);
			document.removeEventListener('shirt-darwin:track', handleTracking);
		};
	});

	function sendInitial() {
		if (sentInitial || !allowed) return;
		sentInitial = true;
		void send(initialEvent);
	}

	async function send(detail: TrackingDetail) {
		if (!allowed) return;
		const eventId = crypto.randomUUID();
		const browserIds = ensureMetaBrowserIds();
		const pixelId = env.PUBLIC_META_PIXEL_ID?.trim();
		if (pixelId) {
			const pixel = loadPixel();
			if (initializedPixelId !== pixelId) {
				pixel('init', pixelId);
				initializedPixelId = pixelId;
			}
			const pixelData = {
				...(detail.currency ? { currency: detail.currency } : {}),
				...(detail.value !== undefined ? { value: detail.value } : {}),
				...(detail.contentIds ? { content_ids: detail.contentIds, content_type: 'product' } : {})
			};
			pixel('track', detail.eventName, pixelData, { eventID: eventId });
		}

		await fetch('/api/tracking/meta', {
			method: 'POST',
			keepalive: true,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				...detail,
				eventId,
				eventTime: Math.floor(Date.now() / 1000),
				eventSourceUrl: window.location.href,
				...browserIds
			})
		}).catch(() => undefined);
	}

	function setPixelConsent(consented: boolean) {
		if (!env.PUBLIC_META_PIXEL_ID?.trim()) return;
		loadPixel()('consent', consented ? 'grant' : 'revoke');
	}

	function ensureMetaBrowserIds() {
		const timestamp = Date.now();
		let fbp = readCookie('_fbp');
		if (!fbp) {
			const random = crypto.getRandomValues(new Uint32Array(1))[0];
			fbp = `fb.1.${timestamp}.${random}`;
			writeCookie('_fbp', fbp);
		}
		const existingFbc = readCookie('_fbc');
		const fbclid = new URL(window.location.href).searchParams.get('fbclid');
		const fbc = resolveMetaFbc({ existingFbc, fbclid, timestamp });
		if (fbc && fbc !== existingFbc) {
			writeCookie('_fbc', fbc);
		}
		return { fbp, ...(fbc ? { fbc } : {}) };
	}

	function readCookie(name: string) {
		const prefix = `${name}=`;
		const value = document.cookie
			.split(';')
			.map((part) => part.trim())
			.find((part) => part.startsWith(prefix))
			?.slice(prefix.length);
		return value ? decodeURIComponent(value) : undefined;
	}

	function writeCookie(name: string, value: string) {
		document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=7776000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
	}

	function clearMetaCookies() {
		for (const name of ['_fbp', '_fbc']) {
			document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
		}
	}

	function loadPixel(): Fbq {
		const pixelWindow = window as Window & { fbq?: Fbq; _fbq?: Fbq };
		if (!pixelWindow.fbq) {
			const pixel = function (...arguments_: unknown[]) {
				if (pixel.callMethod) pixel.callMethod(...arguments_);
				else pixel.queue.push(arguments_);
			} as Fbq;
			pixel.queue = [];
			pixel.loaded = true;
			pixel.version = '2.0';
			pixelWindow.fbq = pixel;
			pixelWindow._fbq = pixel;

			const script = document.createElement('script');
			script.async = true;
			script.src = 'https://connect.facebook.net/en_US/fbevents.js';
			document.head.append(script);
		}
		return pixelWindow.fbq;
	}
</script>
