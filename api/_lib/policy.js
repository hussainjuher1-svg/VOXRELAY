// VOXRELAY assistance policy engine. Pure and versioned.
// T0, T1, T2 ship undefined (defined: false) until an owner or admin configures them.
// T3 is permanently human-only and sealed against any stored policy override.

export const ACTION_CATALOGUE = Object.freeze([
  'glossary.draft',
  'document.summarize',
  'closeout.draft',
  'schedule.suggest',
]);

export const ALWAYS_PROHIBITED_INPUTS = Object.freeze([
  'session_content',
  'audio',
  'client_identity',
  'personal_notes',
]);

const FROZEN_T3 = Object.freeze({
  tier: 'T3',
  defined: true,
  human_only: true,
  description: 'Human judgment only. No automated assistance.',
  permitted_actions: Object.freeze([]),
  prohibited_inputs: ALWAYS_PROHIBITED_INPUTS,
  output_limit: 0,
  approval_mode: 'human',
});

export function sealPolicy(policy) {
  const tiers = { ...(policy?.tiers || {}) };
  tiers.T3 = FROZEN_T3;
  return { ...policy, tiers };
}

export function defaultPolicy() {
  return sealPolicy({
    tiers: {
      T0: { defined: false },
      T1: { defined: false },
      T2: { defined: false },
    },
  });
}

export function isHumanOnly(request) {
  const tier = String(request?.tier || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  return (
    tier === 'T3' ||
    request?.category === 'needs_human_judgment' ||
    request?.human_required === true
  );
}

function deny(reason) {
  return { allowed: false, reason };
}

export function evaluate(request, { policy, adapter } = {}) {
  if (isHumanOnly(request)) {
    return {
      allowed: false,
      humanOnly: true,
      reason: 'This decision requires a qualified human. No automated assistance is permitted.',
      sideEffects: { supportRequest: 'escalated', audit: 'metadata_only' },
    };
  }

  const sealed = sealPolicy(policy || defaultPolicy());
  const tierName = String(request?.tier || '').trim().toUpperCase();
  const tier = sealed.tiers?.[tierName];

  if (!tier) return deny(`Unknown tier: ${request?.tier ?? '(none)'}`);
  if (!tier.defined) return deny(`Tier ${tierName} is not defined by this organization`);

  const action = String(request?.action || '');
  if (!ACTION_CATALOGUE.includes(action)) return deny(`Unlisted action: ${action || '(none)'}`);
  if (!Array.isArray(tier.permitted_actions) || !tier.permitted_actions.includes(action)) {
    return deny(`Action ${action} is not permitted at tier ${tierName}`);
  }

  const inputs = Array.isArray(request?.inputs) ? request.inputs : [];
  const prohibited = new Set([...(tier.prohibited_inputs || []), ...ALWAYS_PROHIBITED_INPUTS]);
  for (const input of inputs) {
    if (prohibited.has(input)) return deny(`Prohibited input: ${input}`);
  }

  const declared = new Set(tier.declared_inputs || []);
  for (const input of inputs) {
    if (!declared.has(input)) return deny(`Undeclared input: ${input}`);
  }

  const outputLimit = Number(request?.output_limit ?? tier.output_limit ?? 0);
  if (!Number.isFinite(outputLimit) || outputLimit <= 0) return deny('Output limit is zero');
  if (tier.output_limit && outputLimit > tier.output_limit) {
    return deny(`Output limit ${outputLimit} exceeds tier cap ${tier.output_limit}`);
  }

  if (!adapter || adapter.enabled !== true) return deny('No provider is enabled');

  return {
    allowed: true,
    audit: true,
    constraints: {
      output_capped: true,
      output_limit: outputLimit,
      labelled: 'unverified',
      requires_confirmation: true,
      never_auto_execute: true,
    },
  };
}
