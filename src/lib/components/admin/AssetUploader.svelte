<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { storefrontId }: { storefrontId: string } = $props();
	let uploading = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	async function upload(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) return;
		const input = form.elements.namedItem('file');
		const kindInput = form.elements.namedItem('kind');
		if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
		if (!(kindInput instanceof HTMLSelectElement)) return;

		uploading = true;
		message = null;
		error = null;
		try {
			const file = input.files[0];
			const createResponse = await fetch(`/admin/storefronts/${storefrontId}/assets`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: kindInput.value,
					contentType: file.type,
					sizeBytes: file.size,
					originalName: file.name
				})
			});
			const created = await createResponse.json();
			if (!createResponse.ok) throw new Error(created.message ?? 'Could not prepare the upload.');

			const uploadResponse = await fetch(created.uploadUrl, {
				method: 'PUT',
				headers: { 'content-type': file.type },
				body: file
			});
			if (!uploadResponse.ok) throw new Error('Object storage rejected the upload.');

			const confirmResponse = await fetch(`/admin/storefronts/${storefrontId}/assets`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ assetId: created.assetId })
			});
			const confirmed = await confirmResponse.json();
			if (!confirmResponse.ok)
				throw new Error(confirmed.message ?? 'Could not confirm the upload.');

			form.reset();
			message = `${file.name} uploaded.`;
			await invalidateAll();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The upload failed.';
		} finally {
			uploading = false;
		}
	}
</script>

<form class="asset-upload" onsubmit={upload}>
	<div class="admin-field-grid">
		<label class="admin-field">
			Asset kind
			<select name="kind">
				<option value="image">Storefront or social image</option>
				<option value="font">WOFF2 font</option>
				<option value="video">Hero video</option>
				<option value="print-file">Private print file</option>
			</select>
		</label>
		<label class="admin-field">
			File
			<input
				name="file"
				type="file"
				accept="image/png,image/jpeg,image/webp,image/avif,image/gif,font/woff2,video/mp4"
				required
			/>
		</label>
	</div>
	<p class="admin-help">
		Images, WOFF2 fonts, and MP4 videos only. Draft assets remain private until publication.
	</p>
	{#if message}<p class="admin-flash" role="status">{message}</p>{/if}
	{#if error}<p class="admin-flash error" role="alert">{error}</p>{/if}
	<div class="admin-actions">
		<button class="admin-button" type="submit" disabled={uploading}>
			{uploading ? 'Uploading…' : 'Upload asset'}
		</button>
	</div>
</form>

<style>
	.asset-upload {
		display: grid;
		gap: 1rem;
	}
</style>
