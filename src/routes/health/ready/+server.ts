import { dev } from '$app/environment';
import { checkDatabase } from '$lib/server/db';
import { assertProductionConfig } from '$lib/server/config';
import { getJobSystemHealth } from '$lib/server/jobs';
import { json } from '@sveltejs/kit';

export const GET = async () => {
	try {
		const missingConfiguration = dev ? [] : assertProductionConfig();
		if (missingConfiguration.length > 0) {
			return json(
				{
					status: 'not-ready',
					database: false,
					jobs: { started: false, installed: false },
					configuration: { valid: false, missing: missingConfiguration }
				},
				{ status: 503, headers: { 'cache-control': 'no-store' } }
			);
		}
		await checkDatabase();
		const jobs = await getJobSystemHealth();
		if (!jobs.started || !jobs.installed) {
			return json({ status: 'not-ready', database: true, jobs }, { status: 503 });
		}
		return json(
			{ status: 'ready', database: true, jobs, configuration: { valid: true, missing: [] } },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch {
		return json(
			{ status: 'not-ready', database: false, jobs: { started: false, installed: false } },
			{ status: 503, headers: { 'cache-control': 'no-store' } }
		);
	}
};
