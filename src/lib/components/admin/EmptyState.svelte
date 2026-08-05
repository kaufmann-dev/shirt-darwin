<script lang="ts">
	let { title, detail }: { title: string; detail: string } = $props();
</script>

<div class="admin-empty">
	<h2>{title}</h2>
	<p>{detail}</p>
</div>
