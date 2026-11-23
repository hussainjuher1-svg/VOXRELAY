import { describe, it, expect } from 'vitest';
import { computeReadiness, deviceCheckCounts } from '../api/_lib/readiness.js';

const START = '2026-12-01T10:00:00.000Z';

describe('readiness', () => {
  it('computes checklist items done + 1 for device check', () => {
    const r = computeReadiness({
      checklist: [
        { label: 'a', done: true },
        { label: 'b', done: false },
      ],
      deviceChecks: [],
      assignmentId: 'a1',
      startAt: START,
    });
    expect(r).toEqual({
      done: 1,
      total: 3,
      ready: false,
      checklistDone: 1,
      checklistItems: 2,
      deviceCheckCounts: false,
    });
  });

  it('requires a passing check within 24h before start or linked to the assignment', () => {
    expect(deviceCheckCounts({ result: 'fail', assignment_id: 'a1', created_at: START }, 'a1', START)).toBe(false);
    expect(
      deviceCheckCounts({ result: 'pass', assignment_id: null, created_at: '2026-11-30T11:00:00.000Z' }, 'a1', START)
    ).toBe(true);
    expect(
      deviceCheckCounts({ result: 'pass', assignment_id: null, created_at: '2026-11-30T09:00:00.000Z' }, 'a1', START)
    ).toBe(false);
    expect(
      deviceCheckCounts({ result: 'pass', assignment_id: null, created_at: '2026-12-01T11:00:00.000Z' }, 'a1', START)
    ).toBe(false);
  });
});
