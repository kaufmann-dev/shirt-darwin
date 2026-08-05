import { z } from 'zod';

export const storefrontStatusSchema = z.enum(['draft', 'live', 'archived']);
export const experimentOutcomeSchema = z.enum(['keep', 'iterate', 'retire']);

export type StorefrontStatus = z.infer<typeof storefrontStatusSchema>;
export type ExperimentOutcome = z.infer<typeof experimentOutcomeSchema>;
export type ExperimentLifecycle = 'planned' | 'running' | 'ended';

export function deriveExperimentLifecycle(
	startsAt: Date,
	endsAt: Date,
	endedAt: Date | null,
	now = new Date()
): ExperimentLifecycle {
	if (endedAt || now >= endsAt) return 'ended';
	if (now < startsAt) return 'planned';
	return 'running';
}

export interface ExperimentWindow {
	startsAt: Date;
	endsAt: Date;
	endedAt: Date | null;
}

export function nonEndedExperimentWindowsOverlap(
	left: Pick<ExperimentWindow, 'startsAt' | 'endsAt'>,
	right: ExperimentWindow
): boolean {
	return right.endedAt === null && left.startsAt < right.endsAt && left.endsAt > right.startsAt;
}
