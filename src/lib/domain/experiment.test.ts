import { describe, expect, it } from 'vitest';
import { deriveExperimentLifecycle, nonEndedExperimentWindowsOverlap } from './experiment';

describe('experiment lifecycle', () => {
	const start = new Date('2026-08-01T00:00:00Z');
	const end = new Date('2026-08-08T00:00:00Z');

	it('derives planned, running and ended from dates', () => {
		expect(deriveExperimentLifecycle(start, end, null, new Date('2026-07-31T00:00:00Z'))).toBe(
			'planned'
		);
		expect(deriveExperimentLifecycle(start, end, null, new Date('2026-08-03T00:00:00Z'))).toBe(
			'running'
		);
		expect(deriveExperimentLifecycle(start, end, null, new Date('2026-08-09T00:00:00Z'))).toBe(
			'ended'
		);
	});

	it('ends early when an explicit end is recorded', () => {
		expect(
			deriveExperimentLifecycle(
				start,
				end,
				new Date('2026-08-02T00:00:00Z'),
				new Date('2026-08-03T00:00:00Z')
			)
		).toBe('ended');
	});

	it('detects intersecting non-ended windows while allowing adjacent windows', () => {
		expect(
			nonEndedExperimentWindowsOverlap(
				{ startsAt: start, endsAt: end },
				{
					startsAt: new Date('2026-08-07T23:59:59Z'),
					endsAt: new Date('2026-08-10T00:00:00Z'),
					endedAt: null
				}
			)
		).toBe(true);
		expect(
			nonEndedExperimentWindowsOverlap(
				{ startsAt: start, endsAt: end },
				{
					startsAt: end,
					endsAt: new Date('2026-08-10T00:00:00Z'),
					endedAt: null
				}
			)
		).toBe(false);
	});

	it('ignores an explicitly ended overlapping experiment', () => {
		expect(
			nonEndedExperimentWindowsOverlap(
				{ startsAt: start, endsAt: end },
				{
					startsAt: new Date('2026-08-02T00:00:00Z'),
					endsAt: new Date('2026-08-03T00:00:00Z'),
					endedAt: new Date('2026-08-02T12:00:00Z')
				}
			)
		).toBe(false);
	});
});
