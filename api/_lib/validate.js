import { z } from 'zod';

export function countCodePoints(value) {
  return [...String(value ?? '')].length;
}

export function maxCodePoints(limit, label = 'Text') {
  return z.string().refine((v) => countCodePoints(v) <= limit, {
    message: `${label} exceeds maximum of ${limit} characters.`,
  });
}

// Strips anything other than primitive numbers, booleans, or short enum codes
// before writing to audit_events.metadata so free text never leaks into logs.
export function safeMeta(raw = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      out[key] = value;
    } else if (typeof value === 'string' && /^[a-z0-9_.:-]{1,48}$/i.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

export const assignmentCreateSchema = z.object({
  start_at: z.string().min(1, 'Start time is required'),
  duration_minutes: z.number().int().positive().max(24 * 60),
  time_zone: z.string().min(1).max(64).default('UTC'),
  language_pair: z.string().min(1, 'Language pair is required').max(64),
  modality: z.enum(['video_remote', 'over_the_phone', 'onsite', 'scheduled', 'relay']),
  category: z.string().max(64).default(''),
  checklist: z
    .array(z.object({ label: z.string().min(1).max(160), done: z.boolean().default(false) }))
    .max(30)
    .default([]),
  personal_note: maxCodePoints(500, 'Personal note').default(''),
  org_id: z.string().uuid().optional(),
  assignee_user_id: z.string().uuid().optional(),
});

export const assignmentPatchSchema = z.object({
  action: z.enum([
    'accept',
    'decline',
    'start_preparation',
    'mark_ready',
    'reschedule',
    'start_session',
    'close_out',
    'cancel',
  ]),
  start_at: z.string().optional(),
  duration_minutes: z.number().int().positive().max(24 * 60).optional(),
  exception_category: z
    .enum(['none', 'late_start', 'patient_no_show', 'technical_issue', 'cancelled_late', 'other'])
    .optional(),
  checklist: z.array(z.object({ label: z.string().min(1).max(160), done: z.boolean() })).max(30).optional(),
  personal_note: maxCodePoints(500, 'Personal note').optional(),
});

export const contactRequestSchema = z.object({
  name: maxCodePoints(120, 'Name').optional().default(''),
  fullName: maxCodePoints(120, 'Full name').optional(),
  email: z.string().trim().email('Valid email address is required').max(160),
  audience: z.enum(['interpreter', 'organization', 'support', 'other']).default('interpreter'),
  organization: maxCodePoints(140, 'Organization').optional().default(''),
  country: maxCodePoints(80, 'Country').optional().default(''),
  languages: maxCodePoints(160, 'Languages').optional().default(''),
  message: maxCodePoints(1000, 'Message').trim().min(1, 'Message is required'),
  consent: z.boolean().optional().default(true),
  locale: z.enum(['en', 'ar']).optional().default('en'),
  website: z.string().max(120).optional().default(''),
});

export const sessionDocSchema = z.object({
  assignment_id: z.string().uuid(),
  encounter_type: z.string().min(1).max(80),
  mode: z.enum(['consecutive', 'simultaneous', 'sight_translation', 'mixed']),
  intervention_counts: z.record(z.string(), z.number().int().min(0).max(999)).default({}),
  flags: z.array(z.string().max(64)).max(10).default([]),
  process_note: maxCodePoints(400, 'Process note').default(''),
  action: z.enum(['save_draft', 'submit', 'approve', 'reopen']).default('save_draft'),
});

export const assistantRequestSchema = z.object({
  question: maxCodePoints(400, 'Question').min(1, 'Question is required'),
  mode: z.enum(['ask', 'research']).default('ask'),
  locale: z.enum(['en', 'bn', 'ar']).default('en'),
  tier: z.string().max(16).optional(),
  category: z.string().max(64).optional(),
});

export const termCreateSchema = z.object({
  label: maxCodePoints(160, 'Term').trim().min(1, 'Term is required'),
  source_lang: maxCodePoints(24, 'Source language').optional().default('en'),
  target_lang: maxCodePoints(24, 'Target language').optional().default('ar'),
  target_term: maxCodePoints(200, 'Target equivalent').optional().default(''),
  notes: maxCodePoints(400, 'Notes').optional().default(''),
});

export const supportTicketSchema = z.object({
  category: z.enum(['general', 'access', 'technical', 'billing', 'boundary_escalation']).default('general'),
  subject: maxCodePoints(160, 'Subject').trim().min(3, 'Subject is required'),
  body: maxCodePoints(1200, 'Message').trim().min(3, 'Message is required'),
});
