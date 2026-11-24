// Keyword-routed, privacy-safe operational assistant (no LLM connected).
// Answers strictly from the signed-in user's own rows in English or Arabic.
import { can } from './authz.js';
import { isHumanOnly } from './policy.js';

const TOPIC_KEYWORDS = [
  { topic: 'translate_refusal', patterns: [/\btranslate\b/i, /\binterpret\b/i, /ترجم/] },
  { topic: 'org_overview', patterns: [/\borganization\b/i, /\bteam\b/i, /\bquality\b/i, /منظمة|فريق|جودة/] },
  { topic: 'billing', patterns: [/\bbill/i, /\binvoice/i, /\bpaid\b/i, /\brate\b/i, /فواتير|دفع|مبلغ/] },
  { topic: 'glossary', patterns: [/\bterm/i, /\bglossary/i, /مصطلح|قاموس/] },
  { topic: 'followups', patterns: [/\bfollow-?up/i, /\btask/i, /متابعة|مهام/] },
  { topic: 'assignments', patterns: [/\bnext\b/i, /\bschedule/i, /\bassign/i, /\btoday/i, /مهمة|جدول|اليوم/] },
];

export function matchTopic(question) {
  const q = String(question || '').trim();
  for (const rule of TOPIC_KEYWORDS) {
    if (rule.patterns.some((p) => p.test(q))) return rule.topic;
  }
  return 'assignments';
}

export function evaluateAssistantRequest({ question, tier, category, role, records = {} }) {
  if (isHumanOnly({ tier, category })) {
    return {
      refused: true,
      code: 'human_only',
      auditType: 'assistant_human_escalation',
      blocks: [
        {
          key: 'assistant.refusal.humanRequired',
          vars: {},
        },
      ],
      reads: [],
      suggestions: ['assignments', 'followups'],
    };
  }

  const topic = matchTopic(question);

  if (topic === 'org_overview' && !can(role, 'ops.org.view')) {
    return {
      refused: true,
      code: 'role_refused',
      auditType: 'assistant_role_refusal',
      blocks: [
        {
          key: 'assistant.refusal.orgScope',
          vars: {},
        },
      ],
      reads: [],
      suggestions: ['assignments', 'glossary', 'billing'],
    };
  }

  if (topic === 'translate_refusal') {
    const terms = Array.isArray(records.terms) ? records.terms.slice(0, 3) : [];
    return {
      refused: false,
      code: 'translate_declined_glossary_shown',
      auditType: 'assistant_translation_declined',
      reads: ['glossary'],
      blocks: [
        { key: 'assistant.refusal.noTranslation', vars: {} },
        {
          key: 'assistant.glossary.matches',
          vars: { count: terms.length, labels: terms.map((t) => t.label).join(', ') || '-' },
        },
      ],
      suggestions: ['glossary', 'assignments'],
    };
  }

  const assignments = Array.isArray(records.assignments) ? records.assignments : [];
  const followups = Array.isArray(records.followups) ? records.followups : [];
  const billing = Array.isArray(records.billing) ? records.billing : [];
  const terms = Array.isArray(records.terms) ? records.terms : [];

  if (topic === 'billing') {
    const invoiced = billing.filter((b) => b.status === 'invoiced').length;
    return {
      refused: false,
      reads: ['records'],
      blocks: [{ key: 'assistant.billing.summary', vars: { total: billing.length, invoiced } }],
      suggestions: ['assignments', 'followups'],
    };
  }

  if (topic === 'followups') {
    const open = followups.filter((f) => f.status !== 'completed' && f.status !== 'cancelled').length;
    return {
      refused: false,
      reads: ['records'],
      blocks: [{ key: 'assistant.followups.summary', vars: { open } }],
      suggestions: ['assignments', 'billing'],
    };
  }

  if (topic === 'glossary') {
    return {
      refused: false,
      reads: ['glossary'],
      blocks: [{ key: 'assistant.glossary.summary', vars: { count: terms.length } }],
      suggestions: ['assignments', 'followups'],
    };
  }

  const upcoming = assignments.filter((a) => !['completed', 'cancelled'].includes(a.status));
  return {
    refused: false,
    reads: ['records'],
    blocks: [
      {
        key: 'assistant.assignments.summary',
        vars: { count: upcoming.length, nextRef: upcoming[0]?.ref || '-' },
      },
    ],
    suggestions: ['followups', 'billing', 'glossary'],
  };
}
