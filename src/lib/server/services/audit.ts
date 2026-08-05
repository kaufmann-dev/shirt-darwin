import { createHash } from 'node:crypto';
import { db } from '$lib/server/db';
import { auditEvent } from '$lib/server/db/schema';

export type Actor = {
	subject: string;
	client?: string;
	requestId?: string;
};

export function hashAuditInput(value: unknown) {
	return createHash('sha256').update(stableJson(value)).digest('hex');
}

export async function recordAudit(input: {
	actor: Actor;
	action: string;
	entityType: string;
	entityId: string;
	input?: unknown;
	beforeRevision?: number;
	afterRevision?: number;
}) {
	await db.insert(auditEvent).values(buildAuditValues(input));
}

export function buildAuditValues(input: {
	actor: Actor;
	action: string;
	entityType: string;
	entityId: string;
	input?: unknown;
	beforeRevision?: number;
	afterRevision?: number;
}) {
	return {
		actorSubject: input.actor.subject,
		actorClient: input.actor.client,
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId,
		inputHash: input.input === undefined ? undefined : hashAuditInput(input.input),
		beforeRevision: input.beforeRevision,
		afterRevision: input.afterRevision,
		requestId: input.actor.requestId
	};
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}
