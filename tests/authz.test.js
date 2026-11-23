import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES,
  ROLES,
  can,
  canReadDoc,
  canReviewDoc,
  followupInitialStatus,
  followupTransition,
  serializeAssignment,
} from '../api/_lib/authz.js';

const EXPECTED = {
  'org.view': ['owner', 'admin', 'coordinator', 'interpreter'],
  'org.rename': ['owner'],
  'org.members.manage': ['owner', 'admin'],
  'org.policy.save': ['owner', 'admin'],
  'org.audit.view': ['owner', 'admin'],
  'org.offers.create': ['owner', 'admin', 'coordinator'],
  'org.support.manage': ['owner', 'admin', 'coordinator'],
  'org.terms.write': ['owner', 'admin', 'coordinator'],
  'org.terms.approve': ['owner', 'admin'],
  'org.terms.read': ['owner', 'admin', 'coordinator', 'interpreter'],
  'ops.org.view': ['owner', 'admin', 'coordinator'],
  'ops.quality.view': ['owner', 'admin'],
};

describe('authz: capability matrix cell by cell', () => {
  for (const [capability, allowedRoles] of Object.entries(EXPECTED)) {
    describe(capability, () => {
      for (const role of ROLES) {
        it(`${role} -> ${allowedRoles.includes(role)}`, () => {
          expect(can(role, capability)).toBe(allowedRoles.includes(role));
        });
      }
    });
  }

  it('denies unknown capabilities and roles', () => {
    expect(can('owner', 'org.drop_db')).toBe(false);
    expect(can('superuser', 'org.view')).toBe(false);
    expect(Object.keys(CAPABILITIES)).toEqual(Object.keys(EXPECTED));
  });
});

describe('authz: privacy and ops rules', () => {
  it('strips personal_note and checklist for non-owners', () => {
    const row = {
      id: 'a1',
      owner_id: 'interp-1',
      ref: 'VR-0001',
      personal_note: 'private prep',
      checklist: [{ label: 'check mic', done: true }],
    };
    expect(serializeAssignment(row, 'interp-1').personal_note).toBe('private prep');
    const other = serializeAssignment(row, 'coord-1');
    expect('personal_note' in other).toBe(false);
    expect('checklist' in other).toBe(false);
  });

  it('blocks reviewing own submitted documentation and blocks staff from drafts', () => {
    const draft = { author_id: 'u1', org_id: 'org1', status: 'draft' };
    const submitted = { author_id: 'u1', org_id: 'org1', status: 'submitted' };
    const ownerCtx = { userId: 'u1', membership: { org_id: 'org1', role: 'owner' } };
    const adminCtx = { userId: 'u2', membership: { org_id: 'org1', role: 'admin' } };
    const coordCtx = { userId: 'u3', membership: { org_id: 'org1', role: 'coordinator' } };

    expect(canReadDoc(draft, adminCtx)).toBe(false);
    expect(canReadDoc(submitted, coordCtx)).toBe(true);
    expect(canReviewDoc(submitted, ownerCtx)).toBe(false);
    expect(canReviewDoc(submitted, coordCtx)).toBe(false);
    expect(canReviewDoc(submitted, adminCtx)).toBe(true);
  });

  it('enforces org vs personal follow-up initial status and transitions', () => {
    expect(followupInitialStatus('org1')).toBe('proposed');
    expect(followupInitialStatus(null)).toBe('in_progress');
    const staff = { userId: 's1', membership: { org_id: 'org1', role: 'coordinator' } };
    const interp = { userId: 'i1', membership: { org_id: 'org1', role: 'interpreter' } };
    const f = { org_id: 'org1', proposer_id: 'i1', assignee_id: 'i1', status: 'proposed' };
    expect(followupTransition('proposed', 'approved', interp, f)).toBe(false);
    expect(followupTransition('proposed', 'approved', staff, f)).toBe(true);
  });
});
