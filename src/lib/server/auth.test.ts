import { beforeEach, describe, expect, it, vi } from 'vitest';

const privateEnv: Record<string, string> = {};

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));
vi.mock('$lib/server/db', () => ({ db: {} }));

describe('Pocket ID profile authorization', () => {
	beforeEach(() => {
		privateEnv.POCKET_ID_ALLOWED_SUBJECT = 'operator-subject';
		privateEnv.POCKET_ID_ADMIN_GROUP = 'shirt-darwin-admin';
	});

	it('accepts only the configured subject and group', async () => {
		const { mapPocketProfile } = await import('./auth');
		expect(
			mapPocketProfile({
				sub: 'operator-subject',
				groups: ['shirt-darwin-admin'],
				name: 'Operator',
				email: 'operator@example.com'
			})
		).toMatchObject({ name: 'Operator', email: 'operator@example.com' });
	});

	it('rejects a different subject', async () => {
		const { mapPocketProfile } = await import('./auth');
		expect(() => mapPocketProfile({ sub: 'someone-else', groups: ['shirt-darwin-admin'] })).toThrow(
			'subject is not authorized'
		);
	});
});
