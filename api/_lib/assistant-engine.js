import crypto from 'node:crypto';
import { matchTopic } from './assistant.js';
import { can } from './authz.js';
import { KB_STRONG_MATCH_THRESHOLD, searchKnowledgeBase, searchKnowledgeBaseWithScores } from './kb.js';

export function redactPii(text) {
  return String(text || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_ID]');
}

const LIVE_INTERPRET_RE = /\b(translate|interpret|transcribe|record\s+session|patient\s+said|doctor\s+said|diagnose|prescribe|legal\s+advice|medical\s+advice|verdict|lawsuit)\b/i;
const HUMAN_ESCALATE_RE = /\b(human|person|agent|staff|coordinator|escalate|ticket|support\s+team|talk\s+to\s+someone|بشر|دعم|تذكرة)\b/i;
const GREETING_RE = /^(hi|hello|hey|yo|bro|mate|friend|good\s+(morning|afternoon|evening)|greetings|salam|assalamu\s+alaikum|hola|thanks|thank\s+you|ok|okay|cool|test|مرحبا|أهلا|السلام\s+عليكم|شكرا|হ্যালো|হাই|ধন্যবাদ)[\s!.,?]*$/i;
const IDENTITY_RE = /^(what\s+is\s+(your|ur)\s+name|who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|about\s+you|introduce\s+yourself|ما\s+اسمك|من\s+أنت|তোমার\s+নাম\s+কি|তুমি\s+কে)[\s!.,?]*$/i;

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

export function buildWorkspaceSnapshot({ db, supabase, userId }) {
  if (!userId || (!db && !supabase)) return { assignments: 0, terms: 0, openTickets: 0 };
  if (db) {
    const assignments = db.prepare('SELECT COUNT(*) AS c FROM assignments WHERE owner_id = ?').get(userId)?.c || 0;
    const terms = db.prepare('SELECT COUNT(*) AS c FROM terms WHERE owner_id = ?').get(userId)?.c || 0;
    const openTickets =
      db.prepare("SELECT COUNT(*) AS c FROM support_tickets WHERE requester_id = ? AND status != 'closed'").get(userId)?.c || 0;
    return { assignments, terms, openTickets };
  }
  return readSupabaseWorkspaceSnapshot(supabase, userId);
}

async function countSupabaseRows(supabase, table, applyFilters) {
  const query = applyFilters(supabase.from(table).select('id'));
  const { data, error } = await query.limit(200);
  if (error) throw new Error('snapshot read failed');
  return Array.isArray(data) ? data.length : 0;
}

async function readSupabaseWorkspaceSnapshot(supabase, userId) {
  const [assignments, terms, tickets] = await Promise.all([
    countSupabaseRows(supabase, 'assignments', (q) => q.eq('owner_id', userId)),
    countSupabaseRows(supabase, 'terms', (q) => q.eq('owner_id', userId)),
    countSupabaseRows(supabase, 'support_tickets', (q) => q.eq('requester_id', userId).neq('status', 'closed')),
  ]);
  return { assignments, terms, openTickets: tickets };
}

const CORRECTION_RE = /^(?:no|nope|nah)\b[\s,!.?]*(?:i\s+)?(?:meant|said|asked)\b[\s:,-]*(.+)$/i;
const FOLLOWUP_CUE_RE = /^(?:what|how)\s+about\b|^and\s+\S|^what\s+else\b|^continue\b/i;
const FOLLOWUP_MAX_WORDS = 3;

export function resolveConversationQuery(sanitized, history = []) {
  const lastUser = [...(Array.isArray(history) ? history : [])].reverse().find((m) => m?.role === 'user' && m.text);
  if (!lastUser) return { query: sanitized, kind: 'standalone' };
  const lastText = redactPii(lastUser.text);
  const correction = sanitized.match(CORRECTION_RE);
  if (correction && correction[1]?.trim()) return { query: correction[1].trim(), kind: 'correction' };
  const wordCount = sanitized.split(/\s+/).filter(Boolean).length;
  if (wordCount <= FOLLOWUP_MAX_WORDS || FOLLOWUP_CUE_RE.test(sanitized)) {
    return { query: `${lastText} ${sanitized}`, kind: 'followup' };
  }
  return { query: sanitized, kind: 'standalone' };
}

export async function runAssistantStream({
  mode = 'ask',
  question,
  locale = 'en',
  db,
  supabase = null,
  userId,
  role = null,
  history = [],
  emit,
}) {
  const sanitized = redactPii(question).trim();
  const lang = locale === 'ar' ? 'ar' : locale === 'bn' ? 'bn' : 'en';
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-4)
    .map((m) => ({
      role: m?.role === 'user' ? 'user' : 'assistant',
      text: redactPii(String(m?.text || '')).slice(0, 300),
    }))
    .filter((m) => m.text);

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

  if (IDENTITY_RE.test(sanitized)) {
    const identityText =
      lang === 'ar'
        ? '### مساعد عمل VOXRELAY\n\n- **الاسم:** مساعد عمل VOXRELAY (Grounded KB).\n- **المهام:** المساعدة في الجدولة واستيراد `.ics`، فحص الجهاز، القاموس، وقواعد الخصوصية.\n- **حدود الأمان:** لا أسجل الصوت ولا أترجم المحادثات الحية (المستوى T3 للبشر فقط).'
        : lang === 'bn'
          ? '### VOXRELAY কর্মক্ষেত্র সহকারী\n\n- **নাম:** VOXRELAY কর্মক্ষেত্র সহকারী (Grounded KB)।\n- **কাজ:** সময়সূচী ও `.ics` আমদানি, ডিভাইস পরীক্ষা, পরিভাষা এবং গোপনীয়তা নীতিতে সাহায্য করা।\n- **সীমা:** আমি কোনো অডিও রেকর্ড করি না বা লাইভ অনুবাদ করি না (T3 মানব-বিচারসীমা)।'
          : "### VOXRELAY Work Assistant\n\n- **Name:** VOXRELAY Work Assistant (grounded workspace & KB helper).\n- **How I help:** Scheduling & `.ics` imports, terminology prep, device readiness, and T0–T3 privacy rules.\n- **Safety boundary:** Zero audio recording and no live translation (T3 human-only).";
    emit({ type: 'delta', text: identityText });
    emit({ type: 'quick_chips', show: true });
    return;
  }

  if (GREETING_RE.test(sanitized)) {
    if (mode === 'research') {
      const researchPrompt =
        lang === 'ar'
          ? '### أدخل موضوع الجلسة للتحضير\n\n- اكتب مجال الجلسة مثل: **استقبال أمراض القلب** أو **جلسة هجرة** أو **فحص الفيديو (VRI)**.\n- سأجهز لك ملخص التحضير والمصطلحات المقترحة لحفظها في القاموس.'
          : lang === 'bn'
            ? '### প্রস্তুতির জন্য সেশনের বিষয় লিখুন\n\n- যেমন: **cardiology intake**, **immigration hearing**, অথবা **video remote setup**।\n- আমি পরিভাষা ও প্রস্তুতির সংক্ষিপ্তসার তৈরি করে দেব।'
            : '### Share a Session Topic for Prep\n\n- Enter a domain or encounter topic (for example: **cardiology intake**, **immigration hearing**, or **VRI audio setup**).\n- I will generate a concise prep brief and suggested glossary terms.';
      emit({ type: 'delta', text: researchPrompt });
      emit({ type: 'quick_chips', show: true });
      return;
    }

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

  if (role && !can(role, 'ops.org.view') && matchTopic(sanitized) === 'org_overview') {
    const refusalText =
      lang === 'ar'
        ? 'بيانات المؤسسة (الفريق، الجودة، إعدادات المؤسسة) متاحة فقط للمنسّقين والمسؤولين. يمكنني مساعدتك في مهامك ومصطلحاتك وفواتيرك وتحضير جلستك، أو يمكنك التصعيد إلى الدعم البشري أدناه.'
        : lang === 'bn'
          ? 'সংস্থার স্তরের রেকর্ড (টিম, কোয়ালিটি, সংস্থার সেটিংস) শুধু কোঅর্ডিনেটর ও অ্যাডমিনদের জন্য। আমি আপনার নিজের অ্যাসাইনমেন্ট, গ্লসারি, বিলিং ও প্রস্তুতিতে সাহায্য করতে পারি, অথবা আপনি নিচে মানব সহায়তায় এস্কেলেট করতে পারেন।'
          : 'Organization-level records (team, quality, org settings) are restricted to coordinators and admins. I can help with your own assignments, glossary, billing, and session prep — or escalate to human support below.';
    emit({ type: 'delta', text: refusalText });
    emit({ type: 'refusal', code: 'role_refused', topic: 'org_overview' });
    emit({ type: 'offer_ticket', reason: 'role_scope' });
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

  // Ask mode: grounded KB (with conversation-resolved retrieval) + workspace records
  const resolved = resolveConversationQuery(sanitized, safeHistory);
  const kbScored = searchKnowledgeBaseWithScores(resolved.query, lang, 2);
  const kbMatches = kbScored.map((s) => s.entry);
  const topScore = kbScored[0]?.score ?? 0;
  const weakMatch = kbMatches.length > 0 && topScore < KB_STRONG_MATCH_THRESHOLD;
  let snapshot = null;
  let workspaceReadFailed = Boolean(userId && !db && !supabase);
  if (!workspaceReadFailed) {
    try {
      snapshot = await buildWorkspaceSnapshot({ db, supabase, userId });
    } catch {
      workspaceReadFailed = true;
    }
  }

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

  const top = kbMatches[0];
  const topTitle = top.title[lang] || top.title.en;
  const topBullets = (top.bullets?.[lang] || top.bullets?.en || [top.summary[lang] || top.summary.en])
    .slice(0, 4)
    .map((b) => `- ${b}`)
    .join('\n');

  let workspaceNote = '';
  if (userId) {
    if (workspaceReadFailed) {
      workspaceNote =
        lang === 'ar'
          ? '\n\n- **بيانات مساحتك:** غير متوفرة حالياً — تعذّر قراءة سجلاتك.'
          : lang === 'bn'
            ? '\n\n- **আপনার ওয়ার্কস্পেস:** সাময়িকভাবে অনুপলব্ধ — রেকর্ড পড়া যায়নি।'
            : '\n\n- **Your workspace:** temporarily unavailable — your records could not be read right now.';
    } else {
      workspaceNote =
        lang === 'ar'
          ? `\n\n- **مساحتك الحالية:** ${snapshot.assignments} مهام · ${snapshot.terms} مصطلحات · ${snapshot.openTickets} تذاكر`
          : `\n\n- **Your workspace:** ${snapshot.assignments} assignments · ${snapshot.terms} terms · ${snapshot.openTickets} open tickets`;
    }
  }

  const weakMatchNote = weakMatch
    ? lang === 'ar'
      ? '\n\n- **ملاحظة:** هذا أقرب موضوع ذي صلة في قاعدة معرفة VOXRELAY — إذا لم يُجب عن سؤالك، يمكنك التصعيد إلى الدعم البشري أدناه.'
      : lang === 'bn'
        ? '\n\n- **নোট:** এটি VOXRELAY নলেজ বেসের সবচেয়ে কাছের সম্পর্কিত বিষয় — এটি যদি আপনার প্রশ্নের উত্তর না দেয়, আপনি নিচে মানব সহায়তায় এস্কেলেট করতে পারেন।'
        : '\n\n- **Note:** this is the closest related topic in the VOXRELAY knowledge base — if it does not answer your question, you can escalate to human support below.'
    : '';

  const structuredFallback = `### ${topTitle} [${top.id}]\n${topBullets}` + workspaceNote + weakMatchNote;

  const answerText = structuredFallback;

  emit({ type: 'delta', text: answerText });
  emit({
    type: 'citations',
    items: kbMatches.map((m) => ({ id: m.id, title: m.title[lang] || m.title.en, href: m.href })),
  });
  if (workspaceReadFailed) emit({ type: 'unavailable', reason: 'workspace_read' });
}

export function hashQuestion(q) {
  return crypto.createHash('sha256').update(String(q || '')).digest('hex').slice(0, 16);
}

export function assistantRateLimitMessage(locale = 'en') {
  const lang = locale === 'ar' ? 'ar' : locale === 'bn' ? 'bn' : 'en';
  if (lang === 'ar') return 'طلبات كثيرة جدًا. يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.';
  if (lang === 'bn') return 'অতিরিক্ত অনুরোধ। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।';
  return 'Too many requests. Please wait a moment and try again.';
}

export function assistantServiceErrorMessage(locale = 'en') {
  const lang = locale === 'ar' ? 'ar' : locale === 'bn' ? 'bn' : 'en';
  if (lang === 'ar') return 'خدمة المساعد غير متوفرة مؤقتاً. يرجى المحاولة مرة أخرى.';
  if (lang === 'bn') return 'সহকারী পরিষেবা সাময়িকভাবে অনুপলব্ধ। অনুগ্রহ করে আবার চেষ্টা করুন।';
  return 'The assistant service is temporarily unavailable. Please try again.';
}
