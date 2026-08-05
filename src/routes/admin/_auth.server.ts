import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auditEvent } from '$lib/server/db/schema';

export function requireAdmin(locals: App.Locals) {
	if (!locals.user || !locals.session) error(401, 'Operator authentication required');
	return locals.user;
}

export async function recordAdminAction(
	event: Pick<RequestEvent, 'locals'>,
	input: {
		action: string;
		entityType: string;
		entityId: string;
		beforeRevision?: number;
		afterRevision?: number;
	}
) {
	const user = requireAdmin(event.locals);
	await db.insert(auditEvent).values({
		actorSubject: user.id,
		actorClient: 'admin',
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId,
		beforeRevision: input.beforeRevision,
		afterRevision: input.afterRevision,
		requestId: event.locals.requestId
	});
}
