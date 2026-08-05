export function formatMoneyMinor(amountMinor: number, currency: string) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		maximumFractionDigits: 2
	}).format(amountMinor / 100);
}

export function formatDateTime(value: Date | string | null | undefined) {
	if (!value) return 'Not available';
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	}).format(new Date(value));
}

export function formatDate(value: Date | string | null | undefined) {
	if (!value) return 'Not available';
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeZone: 'UTC'
	}).format(new Date(value));
}

export function formatAge(value: Date | string | null | undefined, now = new Date()) {
	if (!value) return 'Never';
	const milliseconds = now.getTime() - new Date(value).getTime();
	if (milliseconds < 60_000) return 'Just now';
	const minutes = Math.floor(milliseconds / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}
