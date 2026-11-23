import { describe, it, expect } from 'vitest';
import {
  assignmentCreateSchema,
  assignmentPatchSchema,
  contactRequestSchema,
  countCodePoints,
  safeMeta,
} from '../api/_lib/validate.js';

describe('validate: schemas, code points & safeMeta', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(countCodePoints('👍🏽')).toBe(2);
    expect(countCodePoints('مرحبا')).toBe(5);
  });

  it('strips non-code strings from audit metadata', () => {
    expect(
      safeMeta({
        ok: true,
        count: 3,
        topic: 'assignments',
        leakedText: 'Patient name is confidential',
      })
    ).toEqual({
      ok: true,
      count: 3,
      topic: 'assignments',
    });
  });

  it('validates assignment and contact inputs', () => {
    expect(
      assignmentCreateSchema.safeParse({
        start_at: '2026-11-24T09:00:00Z',
        duration_minutes: 45,
        language_pair: 'EN-ROH',
        modality: 'video_remote',
      }).success
    ).toBe(true);

    expect(
      assignmentPatchSchema.safeParse({
        action: 'close_out',
        exception_category: 'none',
      }).success
    ).toBe(true);

    expect(
      contactRequestSchema.safeParse({
        email: 'not-an-email',
        message: 'hello',
      }).success
    ).toBe(false);
  });
});
