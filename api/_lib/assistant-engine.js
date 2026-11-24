import crypto from 'node:crypto';
import { searchKnowledgeBase } from './kb.js';

export function redactPii(text) {
  return String(text || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_ID]');
}

const LIVE_INTERPRET_RE = /\b(translate|interpret|transcribe|record\s+session|patient\s+said|doctor\s+said|diagnose|prescribe|legal\s+advice|medical\s+advice|verdict|lawsuit)\b/i;
const HUMAN_ESCALATE_RE = /\b(human|person|agent|staff|coordinator|escalate|ticket|support\s+team|talk\s+to\s+someone|بشر|دعم|تذكرة)\b/i;
const GREETING_RE = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings|salam|assalamu\s+alaikum|hola|مرحبا|أهلا|السلام\s+عليكم|হ্যালো|হাই)[\s!.,?]*$/i;

const DOMAIN_RESEARCH_BRIEFS = [
  {
    match: /\b(cardio|heart|chest|ecg|ekg|triage|emergency|hospital|clinic|medical|intake|consent|قلب|طوارئ|عيادة)\b/i,
    title: 'Healthcare & Clinical Intake Terminology Prep',
    confidence: 'high',
    sources: [
      { id: 'REF-MED-1', title: 'VOXRELAY Medical Encounter Preparation Guide', href: '/how-it-works' },
      { id: 'KB-03', title: 'Multilingual glossary & script normalization', href: '/app/terminology' },
    ],
    summary:
      'Focus preparation on intake consent workflows, symptom-onset descriptors, medication reconciliation terms, and pre-session audio checks. Remember: VOXRELAY supports preparation around the session only and never stores patient identifiers or live clinical dialogue.',
    proposedTerms: [
      { label: 'Informed consent', source_lang: 'en', target_lang: 'ar', target_term: 'الموافقة المستنيرة', notes: 'Procedural intake consent prior to examination' },
      { label: 'Shortness of breath', source_lang: 'en', target_lang: 'ar', target_term: 'ضيق في التنفس', notes: 'Common triage intake symptom' },
      { label: 'Medication reconciliation', source_lang: 'en', target_lang: 'ar', target_term: 'مراجعة الأدوية الحالية', notes: 'Verifying active prescriptions and dosages' },
    ],
  },
  {
    match: /\b(legal|court|deposition|asylum|immigration|hearing|housing|tenant|attorney|محكمة|قانون|لجوء)\b/i,
    title: 'Community & Administrative Hearing Prep',
    confidence: 'high',
    sources: [
      { id: 'REF-ADM-1', title: 'Consecutive & Sight Translation Operational Checklist', href: '/interpreters' },
      { id: 'KB-05', title: 'T0–T3 Human-Led Boundaries', href: '/organizations' },
    ],
    summary:
      'Review procedural roles (officer, petitioner, counsel), oath and affirmation phrasing, and consecutive note-taking readiness. VOXRELAY does not provide legal advice or store case files.',
    proposedTerms: [
      { label: 'Sworn affirmation', source_lang: 'en', target_lang: 'ar', target_term: 'إقرار تحت القسم', notes: 'Opening procedural statement' },
      { label: 'Continuance request', source_lang: 'en', target_lang: 'ar', target_term: 'طلب تأجيل الجلسة', notes: 'Request to reschedule a procedural date' },
      { label: 'Stipulation', source_lang: 'en', target_lang: 'ar', target_term: 'اتفاق إجرائي', notes: 'Formal agreement on procedural facts' },
    ],
  },
  {
    match: /\b(video|vri|audio|mic|microphone|latency|bandwidth|setup|remote|صوت|فيديو|ميكروفون)\b/i,
    title: 'Remote Video & Audio (VRI) Operational Prep',
    confidence: 'high',
    sources: [
      { id: 'KB-07', title: 'Pre-session audio readiness check', href: '/app/device-check' },
      { id: 'KB-02', title: 'Assignment lifecycle & Session Focus', href: '/how-it-works' },
    ],
    summary:
      'Run the browser microphone check within 24 hours of start, confirm quiet room lighting, keep a backup wired headset ready, and use Session Focus during the call to record operational pause timestamps only.',
    proposedTerms: [
      { label: 'Audio latency', source_lang: 'en', target_lang: 'ar', target_term: 'زمن تأخر الصوت', notes: 'Signal delay affecting turn-taking' },
      { label: 'Clarification pause', source_lang: 'en', target_lang: 'ar', target_term: 'وقفة استيضاح', notes: 'Brief operational pause to verify a term' },
    ],
  },
];

async function callAnthropicIfConfigured({ systemPrompt, userMessage }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 550,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.content?.[0]?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function buildWorkspaceSnapshot({ db, userId }) {
  if (!db || !userId) return { assignments: 0, terms: 0, openTickets: 0 };
  const assignments = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE owner_id = ?').get(userId)?.c || 0;
  const terms = db.prepare('SELECT COUNT(*) AS c FROM terms WHERE owner_id = ?').get(userId)?.c || 0;
  const openTickets =
    db.prepare("SELECT COUNT(*) AS c FROM support_tickets WHERE requester_id = ? AND status != 'closed'").get(userId)?.c || 0;
  return { assignments, terms, openTickets };
}

export async function runAssistantStream({ mode = 'ask', question, locale = 'en', db, userId, emit }) {
  const sanitized = redactPii(question).trim();
  const lang = locale === 'ar' ? 'ar' : locale === 'bn' ? 'bn' : 'en';

  if (!sanitized) {
    emit({
      type: 'error',
      message:
        lang === 'ar'
          ? 'الرجاء إدخال سؤال.'
          : lang === 'bn'
            ? 'অনুগ্রহ করে একটি প্রশ্ন লিখুন।'
            : 'Please enter a question.',
    });
    return;
  }

  if (GREETING_RE.test(sanitized)) {
    const greetingText =
      lang === 'ar'
        ? 'مرحباً! أنا مساعد عمل VOXRELAY. كيف يمكنني مساعدتك اليوم؟ يمكنك سؤالي عن الجدولة واستيراد .ics، الخصوصية وعدم التسجيل، فحص الجهاز، أو مستويات T0–T3 — أو اختيار موضوع سريع أدناه.'
        : lang === 'bn'
          ? 'হ্যালো! আমি VOXRELAY কর্মক্ষেত্র সহকারী। সময়সূচী ও .ics আমদানি, গোপনীয়তা, ডিভাইস পরীক্ষা, বা T0–T3 নীতি সম্পর্কে প্রশ্ন করুন বা নিচের যেকোনো বিষয়ে ক্লিক করুন।'
          : "Hello! I'm the VOXRELAY Work Assistant. How can I help you today? Pick a quick topic below or ask about scheduling, privacy, device readiness, or billing.";
    emit({ type: 'delta', text: greetingText });
    emit({ type: 'quick_chips', show: true });
    return;
  }

  // Hard policy guardrail: never interpret, translate live speech, record, or give clinical/legal advice.
  if (LIVE_INTERPRET_RE.test(sanitized)) {
    const refusalText =
      lang === 'ar'
        ? 'لا يقوم VOXRELAY بالترجمة الفورية أو التحريرية لمحتوى الجلسات، ولا بالتسجيل أو تقديم استشارات طبية أو قانونية. يمكنك استخدام وضع **البحث والتحضير** لإعداد قائمة مصطلحات قبل الجلسة، أو التصعيد لفريق الدعم البشري.'
        : 'VOXRELAY does not translate or interpret live session content, record/transcribe audio, or provide medical or legal advice (T3 human-only boundary). You can switch to **Research** mode for pre-session subject preparation or escalate this question to human support.';
    emit({ type: 'delta', text: refusalText });
    emit({
      type: 'citations',
      items: [{ id: 'KB-01', title: 'What VOXRELAY does and never does', href: '/privacy' }],
    });
    emit({ type: 'offer_ticket', reason: 'policy_boundary' });
    return;
  }

  if (HUMAN_ESCALATE_RE.test(sanitized) && mode === 'ask') {
    const kbMatches = searchKnowledgeBase(sanitized, lang, 2);
    const msg =
      lang === 'ar'
        ? 'يمكنك فتح تذكرة دعم بشري مباشرة من الزر أدناه وسيرفق النظام ملخص سؤالك لفريق الدعم.'
        : 'You can open a human support ticket directly below. Your question summary will be attached so a coordinator or support staff member can follow up.';
    emit({ type: 'delta', text: msg });
    emit({
      type: 'citations',
      items: kbMatches.map((m) => ({ id: m.id, title: m.title[lang] || m.title.en, href: m.href })),
    });
    emit({ type: 'offer_ticket', reason: 'user_requested' });
    return;
  }

  if (mode === 'research') {
    emit({ type: 'step', step: 'planning', label: lang === 'ar' ? 'تخطيط محاور البحث والتحضير...' : 'Planning subject & terminology search...' });
    await new Promise((r) => setTimeout(r, 80));

    emit({ type: 'step', step: 'searching', label: lang === 'ar' ? 'البحث في قاعدة المعرفة والمراجع التشغيلية...' : 'Searching knowledge base & domain terminology references...' });
    await new Promise((r) => setTimeout(r, 90));

    const kbMatches = searchKnowledgeBase(sanitized, lang, 3);
    const domain = DOMAIN_RESEARCH_BRIEFS.find((b) => b.match.test(sanitized));

    emit({ type: 'step', step: 'synthesizing', label: lang === 'ar' ? 'تلخيص موجز التحضير واقتراح المصطلحات...' : 'Synthesizing prep brief & candidate terms...' });
    await new Promise((r) => setTimeout(r, 60));

    if (domain) {
      const bulletSteps = domain.proposedTerms
        .slice(0, 3)
        .map((t) => `- **${t.label}** — ${t.target_term}${t.notes ? ` (${t.notes})` : ''}`)
        .join('\n');
      emit({
        type: 'delta',
        text: `### ${domain.title}\n\n${domain.summary}\n\n- **Confidence:** ${domain.confidence}\n${bulletSteps}\n- Review and click **Save** below to add terms to your glossary.`,
      });
      emit({ type: 'citations', items: domain.sources });
      emit({ type: 'proposed_terms', terms: domain.proposedTerms });
      return;
    }

    const fallbackSummary =
      kbMatches.length > 0
        ? `### Subject & Workspace Preparation Brief\n\n${kbMatches
            .slice(0, 2)
            .map((m) => `- **${m.title[lang] || m.title.en}:** ${m.summary[lang] || m.summary.en}`)
            .join('\n')}\n\n- **Confidence:** medium — add custom terms in Terminology or escalate to human support.`
        : `### Research Brief\n\n- No domain pack matched **"${sanitized}"** in the offline reference set.\n- Add custom terms in Terminology or open a support ticket for coordinator guidance.`;

    emit({ type: 'delta', text: fallbackSummary });
    emit({
      type: 'citations',
      items: kbMatches.map((m) => ({ id: m.id, title: m.title[lang] || m.title.en, href: m.href })),
    });
    if (kbMatches.length === 0) emit({ type: 'offer_ticket', reason: 'no_research_match' });
    return;
  }

  // Ask mode: grounded KB + workspace records + optional Anthropic provider
  const kbMatches = searchKnowledgeBase(sanitized, lang, 2);
  const snapshot = buildWorkspaceSnapshot({ db, userId });

  if (kbMatches.length === 0) {
    const ungrounded =
      lang === 'ar'
        ? 'لم أجد إجابة موثقة لهذا السؤال في قاعدة معرفة VOXRELAY. يمكنك تصعيد السؤال إلى الدعم البشري أدناه.'
        : "I couldn't find a verified answer for that in the VOXRELAY knowledge base. You can escalate this directly to human support below.";
    emit({ type: 'delta', text: ungrounded });
    emit({ type: 'citations', items: [] });
    emit({ type: 'offer_ticket', reason: 'ungrounded' });
    return;
  }

  const contextBlock = kbMatches
    .map((m) => {
      const bullets = (m.bullets?.[lang] || m.bullets?.en || []).map((b) => `- ${b}`).join('\n');
      return `[${m.id}] ${m.title[lang] || m.title.en}\n${bullets || m.summary[lang] || m.summary.en}`;
    })
    .join('\n\n');

  const anthropicText = await callAnthropicIfConfigured({
    systemPrompt: `You are the VOXRELAY Workspace Assistant. Answer strictly using ONLY the provided knowledge-base excerpts and workspace counts (assignments=${snapshot.assignments}, terms=${snapshot.terms}, openTickets=${snapshot.openTickets}). Format EVERY answer as: a short bold heading (with [KB-xx] citation) followed by 2–4 concise bullet points ("- ..."). Never write long paragraphs or dump unrelated rules. Never interpret/translate live dialogue, never record/transcribe, never give medical/legal advice. Keep total length under 95 words. Language: ${lang}.`,
    userMessage: `Question: ${sanitized}\n\nKnowledge base:\n${contextBlock}`,
  });

  const top = kbMatches[0];
  const topTitle = top.title[lang] || top.title.en;
  const topBullets = (top.bullets?.[lang] || top.bullets?.en || [top.summary[lang] || top.summary.en])
    .slice(0, 4)
    .map((b) => `- ${b}`)
    .join('\n');

  const structuredFallback =
    `### ${topTitle} [${top.id}]\n${topBullets}` +
    (userId
      ? lang === 'ar'
        ? `\n\n- **مساحتك الحالية:** ${snapshot.assignments} مهام · ${snapshot.terms} مصطلحات · ${snapshot.openTickets} تذاكر`
        : `\n\n- **Your workspace:** ${snapshot.assignments} assignments · ${snapshot.terms} terms · ${snapshot.openTickets} open tickets`
      : '');

  const answerText = anthropicText || structuredFallback;

  emit({ type: 'delta', text: answerText });
  emit({
    type: 'citations',
    items: kbMatches.map((m) => ({ id: m.id, title: m.title[lang] || m.title.en, href: m.href })),
  });
}

export function hashQuestion(q) {
  return crypto.createHash('sha256').update(String(q || '')).digest('hex').slice(0, 16);
}
