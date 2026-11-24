import { describe, it, expect } from 'vitest';
import {
  ACTION_CATALOGUE,
  ALWAYS_PROHIBITED_INPUTS,
  defaultPolicy,
  evaluate,
  isHumanOnly,
  sealPolicy,
} from '../api/_lib/policy.js';

function spyProvider() {
  return {
    enabled: true,
    calls: [],
    async call(input) {
      this.calls.push(input);
      return { text: 'spy output' };
    },
  };
}

const definedTier = {
  defined: true,
  description: 'Drafting support',
  permitted_actions: ['glossary.draft', 'closeout.draft'],
  declared_inputs: ['glossary_terms', 'schedule_record'],
  prohibited_inputs: [],
  output_limit: 500,
  approval_mode: 'review',
};

describe('policy: tiers ship undefined', () => {
  it('T0, T1, T2 are not defined by default', () => {
    const p = defaultPolicy();
    for (const tier of ['T0', 'T1', 'T2']) {
      const res = evaluate(
        { tier, action: 'glossary.draft', inputs: [], output_limit: 100 },
        { policy: p, adapter: spyProvider() }
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/not defined/);
    }
  });
});

describe('policy: T3 is human only', () => {
  it('recognizes T3 in any spelling or flag', () => {
    expect(isHumanOnly({ tier: 'T3' })).toBe(true);
    expect(isHumanOnly({ tier: 't3' })).toBe(true);
    expect(isHumanOnly({ tier: ' T 3 ' })).toBe(true);
    expect(isHumanOnly({ category: 'needs_human_judgment' })).toBe(true);
    expect(isHumanOnly({ human_required: true })).toBe(true);
    expect(isHumanOnly({ tier: 'T1' })).toBe(false);
  });

  it('holds against a hostile policy and enabled spy provider', () => {
    const hostile = {
      tiers: {
        T3: {
          defined: true,
          human_only: false,
          permitted_actions: [...ACTION_CATALOGUE],
          declared_inputs: [...ALWAYS_PROHIBITED_INPUTS],
          prohibited_inputs: [],
          output_limit: 999999,
          approval_mode: 'auto',
        },
      },
    };
    const spy = spyProvider();
    const res = evaluate(
      { tier: 'T3', action: 'glossary.draft', inputs: ['session_content'], output_limit: 999999 },
      { policy: hostile, adapter: spy }
    );
    expect(res.allowed).toBe(false);
    expect(res.humanOnly).toBe(true);
    expect(res.sideEffects).toEqual({ supportRequest: 'escalated', audit: 'metadata_only' });
    expect(spy.calls).toHaveLength(0);
  });
});

describe('policy: default deny & strict constraints', () => {
  const policy = sealPolicy({ tiers: { T1: definedTier } });

  it('denies prohibited inputs even if omitted from tier config', () => {
    for (const input of ALWAYS_PROHIBITED_INPUTS) {
      const res = evaluate(
        { tier: 'T1', action: 'glossary.draft', inputs: [input], output_limit: 10 },
        { policy, adapter: spyProvider() }
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/Prohibited input/);
    }
  });

  it('allows compliant requests only when an adapter is enabled', () => {
    const denied = evaluate(
      { tier: 'T1', action: 'glossary.draft', inputs: ['glossary_terms'], output_limit: 100 },
      { policy, adapter: { enabled: false } }
    );
    expect(denied.allowed).toBe(false);

    const allowed = evaluate(
      { tier: 'T1', action: 'glossary.draft', inputs: ['glossary_terms'], output_limit: 200 },
      { policy, adapter: spyProvider() }
    );
    expect(allowed.allowed).toBe(true);
    expect(allowed.constraints).toMatchObject({
      output_capped: true,
      output_limit: 200,
      labelled: 'unverified',
      requires_confirmation: true,
      never_auto_execute: true,
    });
  });
});
