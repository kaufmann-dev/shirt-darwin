<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { User } from 'better-auth';
	import { resolve } from '$app/paths';

	let {
		user,
		pathname,
		children
	}: { user: Pick<User, 'name' | 'email'>; pathname: string; children: Snippet } = $props();

	const links = [
		{ href: '/admin', label: 'Overview' },
		{ href: '/admin/storefronts', label: 'Storefronts' },
		{ href: '/admin/experiments', label: 'Experiments' },
		{ href: '/admin/orders', label: 'Orders' },
		{ href: '/admin/integrations', label: 'Integrations' },
		{ href: '/admin/legal', label: 'Legal & contact' }
	] as const;

	const isCurrent = (href: (typeof links)[number]['href']) => {
		const target = resolve(href);
		return href === '/admin'
			? pathname === target
			: pathname === target || pathname.startsWith(`${target}/`);
	};
</script>

<div class="admin-shell">
	<header class="admin-header">
		<a class="admin-brand" href={resolve('/admin')}>Shirt Darwin / Operator</a>
		<div class="admin-user">
			<span class="admin-user-name" title={user.email}>{user.name}</span>
			<form method="POST" action="/admin/logout">
				<button class="admin-button secondary" type="submit">Sign out</button>
			</form>
		</div>
	</header>
	<div class="admin-body">
		<nav class="admin-nav" aria-label="Operator navigation">
			<ul>
				{#each links as link (link.href)}
					<li>
						<a href={resolve(link.href)} aria-current={isCurrent(link.href) ? 'page' : undefined}>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<main class="admin-main" id="main-content">
			{@render children()}
		</main>
	</div>
</div>
