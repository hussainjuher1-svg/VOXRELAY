import { describe, it, expect } from 'vitest';
import {
  computeBillableMinutes,
  computeBillingAmountCents,
  computeQualityIndicators,
  summarizeReports,
} from '../api/_lib/ops-metrics.js';

describe('ops-metrics: billing & quality', () => {
  it('applies minimum minutes and rounding increments cleanly', () => {
    expect(computeBillableMinutes(12, { minimum_minutes: 30, round_to_minutes: 15 })).toBe(30);
    expect(computeBillableMinutes(37, { minimum_minutes: 30, round_to_minutes: 15 })).toBe(45);
    expect(computeBillingAmountCents(37, 6000, { minimum_minutes: 30, round_to_minutes: 15 })).toEqual({
      minutes: 45,
      amount_cents: 4500,
    });
  });

  it('computes six operational indicators and report summaries without conversation inputs', () => {
    const assignments = [
      {
        id: '1',
        ref: 'VR-0001',
        status: 'completed',
        language_pair: 'EN-AR',
        modality: 'video_remote',
        start_at: '2026-11-20T10:00:00.000Z',
        started_at: '2026-11-20T10:02:00.000Z',
        ended_at: '2026-11-20T10:42:00.000Z',
        exception_category: 'none',
      },
    ];
    const indicators = computeQualityIndicators({
      assignments,
      assignmentEvents: [{ assignment_id: '1', type: 'closed_out', created_at: '2026-11-20T11:00:00.000Z' }],
      deviceChecks: [{ assignment_id: '1', result: 'pass', created_at: '2026-11-20T09:50:00.000Z' }],
      sessionDocs: [{ assignment_id: '1', status: 'submitted' }],
      followups: [{ id: 'f1', due_date: '2026-11-21', status: 'completed' }],
    });
    expect(indicators).toHaveLength(6);
    expect(indicators.every((ind) => ind.numerator === 1 && ind.denominator === 1)).toBe(true);

    const summary = summarizeReports(assignments);
    expect(summary.sessions).toBe(1);
    expect(summary.totalMinutes).toBe(40);
    expect(summary.byPair['EN-AR']).toEqual({ sessions: 1, minutes: 40 });
  });
});
