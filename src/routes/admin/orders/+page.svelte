<script lang="ts">
	import EmptyState from '$lib/components/admin/EmptyState.svelte';
	import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
	import TableFrame from '$lib/components/admin/TableFrame.svelte';
	import { formatDateTime, formatMoneyMinor } from '$lib/components/admin/format';

	let { data }: import('./$types').PageProps = $props();
</script>

<svelte:head>
	<title>Orders | Shirt Darwin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-view">
	<header class="admin-heading">
		<div>
			<h1>Orders</h1>
			<p>Operational projections only. Names, emails, and addresses remain in Shopify.</p>
		</div>
	</header>

	{#if data.orders.length}
		<TableFrame label="Recent no-PII orders">
			<table class="admin-table">
				<thead>
					<tr>
						<th scope="col">Order</th>
						<th scope="col">Placed</th>
						<th scope="col">Region</th>
						<th scope="col">Net revenue</th>
						<th scope="col">Financial</th>
						<th scope="col">Shopify fulfillment</th>
						<th scope="col">Printful</th>
						<th scope="col">Printful cost</th>
						<th scope="col">Latest shipment</th>
						<th scope="col">Tracking</th>
					</tr>
				</thead>
				<tbody>
					{#each data.orders as order (order.id)}
						{@const costParts = [
							order.fulfillment?.productCostMinor,
							order.fulfillment?.shippingCostMinor,
							order.fulfillment?.taxMinor,
							order.fulfillment?.providerAdjustmentMinor
						].filter((amount): amount is number => amount !== null && amount !== undefined)}
						<tr>
							<th scope="row">{order.orderNumber}</th>
							<td>{formatDateTime(order.orderedAt)}</td>
							<td>{order.regionCode ?? 'Unknown'}</td>
							<td>{formatMoneyMinor(order.netRevenueMinor, order.currency)}</td>
							<td><StatusBadge value={order.financialStatus} /></td>
							<td><StatusBadge value={order.fulfillmentStatus} /></td>
							<td><StatusBadge value={order.fulfillment?.status ?? 'not linked'} /></td>
							<td>
								{#if order.fulfillment?.currency && order.fulfillment.totalCostMinor !== null}
									{formatMoneyMinor(order.fulfillment.totalCostMinor, order.fulfillment.currency)}
								{:else if order.fulfillment?.currency && costParts.length}
									{formatMoneyMinor(
										costParts.reduce((total, amount) => total + amount, 0),
										order.fulfillment.currency
									)}
									<span class="cost-note">Partial</span>
								{:else}
									Pending
								{/if}
							</td>
							<td>
								{#if order.shipment}
									<StatusBadge value={order.shipment.deliveryStatus ?? order.shipment.status} />
									<span class="shipment-time">
										{formatDateTime(
											order.shipment.shippedAt ??
												order.shipment.providerCreatedAt ??
												order.shipment.updatedAt
										)}
									</span>
								{:else}
									Not available
								{/if}
							</td>
							<td>
								{#if order.shipment?.trackingNumber}
									<span class="tracking-number" title={order.shipment.trackingNumber}
										>{order.shipment.carrier ?? 'Carrier'} · {order.shipment.trackingNumber}</span
									>
								{/if}
								{#if order.shipment?.trackingUrl}
									<!-- The server permits only absolute HTTPS provider URLs; resolve() is for app-local paths. -->
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										class="admin-text-link tracking-link"
										href={order.shipment.trackingUrl}
										target="_blank"
										rel="noopener noreferrer"
										>Open tracking<span class="sr-only"> for {order.orderNumber}</span></a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{:else if !order.shipment?.trackingNumber}
									Not available
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</TableFrame>
	{:else}
		<EmptyState
			title="No orders imported"
			detail="Run a Shopify sync or complete a test checkout. Customer PII will remain in Shopify."
		/>
	{/if}
</div>

<style>
	.cost-note,
	.shipment-time,
	.tracking-number,
	.tracking-link {
		display: block;
		margin-top: 0.35rem;
	}

	.cost-note,
	.shipment-time,
	.tracking-number {
		color: #666661;
		font-size: 0.75rem;
	}

	.tracking-number {
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
