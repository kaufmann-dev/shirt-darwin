import { json } from '@sveltejs/kit';

export const GET = () =>
	json(
		{ status: 'ok', service: 'shirt-darwin', uptimeSeconds: Math.floor(process.uptime()) },
		{ headers: { 'cache-control': 'no-store' } }
	);
