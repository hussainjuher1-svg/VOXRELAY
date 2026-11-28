import crypto from 'node:crypto';
import { matchTopic } from './assistant.js';
import { can } from './authz.js';
import { KB_STRONG_MATCH_THRESHOLD, KNOWLEDGE_BASE, searchKnowledgeBase, searchKnowledgeBaseWithScores } from './kb.js';

export function redactPii(text) {
  return String(text || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_ID]');
}

const LIVE_INTERPRET_RE = /\b(translate|interpret|transcribe|record\s+session|patient\s+said|doctor\s+said|diagnose|prescribe|legal\s+advice|medical\s+advice|verdict|lawsuit)\b/i;
const HUMAN_ESCALATE_RE = /\b(human|person|agent|staff|coordinator|escalate|ticket|support\s+team|talk\s+to\s+someone|بشر|دعم|تذكرة)\b/i;
const GREETING_RE = /^(hi|hello|hey|yo|bro|mate|friend|good\s+(morning|afternoon|evening)|greetings|salam|assalamu\s+alaikum|hola|thanks|thank\s+you|ok|okay|cool|test|مرحبا|أهلا|السلام\s+عليكم|شكرا|হ্যালো|হাই|ধন্যবাদ)(\s+vox)?[\s!.,?]*$/i;
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
const FOLLOWUP_CUE_RE =
  /^(?:what|how)\s+about\b|^and\s+\S|^what\s+else\b|^continue\b|^give\s+me\s+an?\s+example\b|^tell\s+me\s+more\b|^explain\s+(?:that|it)\s+again\b|^make\s+it\s+simpler\b|^what\s+did\s+you\s+mean\b|^compare\b/i;
const FOLLOWUP_MAX_WORDS = 3;
const PRODUCT_RE =
  /^(?:what\s+is\s+voxrelay|what\s+does\s+voxrelay\s+do|tell\s+me\s+about\s+voxrelay|about\s+voxrelay)\s*[?!.]*$/i;
const BROAD_DOMAIN_FILLER_RE =
  /^(?:can\s+you\s+)?(?:please\s+)?(?:help\s+me\s+(?:with|understand)|tell\s+me\s+about|what\s+(?:is|are)|i\s+(?:want|would)\s+to\s+know\s+about|explain|what\s+about)\s+(?:the\s+)?/i;
const BROAD_DOMAIN_TOPIC_RE = /^(?:an?\s+)?interpreters?$|^interpreting$|^interpreter\s+help$|^interpreters?\s+work$/i;

function knowledgeEntryById(id) {
  return KNOWLEDGE_BASE.find((entry) => entry.id === id) || null;
}

function entryLines(entry, lang, max) {
  return (entry.bullets?.[lang] || entry.bullets?.en || [entry.summary[lang] || entry.summary.en])
    .slice(0, max)
    .map((b) => `- ${b}`)
    .join('\n');
}

export function isBroadDomainQuery(sanitized) {
  const stripped = String(sanitized || '')
    .replace(/[!.?]+$/, '')
    .replace(BROAD_DOMAIN_FILLER_RE, '')
    .trim();
  return BROAD_DOMAIN_TOPIC_RE.test(stripped);
}

function broadDomainAnswer(lang) {
  if (lang === 'ar') {
    return {
      text:
        '### الترجمة التفسيرية — ما يمكنني المساعدة فيه\n\n- **مساحة عمل VOXRELAY:** المهمام والجدولة (KB-02)، المصطلحات والقاموس (KB-03)، استيراد التقويم (KB-04)، سياسة المساعدة (KB-05)، الفوترة (KB-06)، جهوزية الجهاز (KB-07)، والحصول على الدعم (KB-08).\n- **حدود الخصوصية:** ما لا يفعله VOXRELAY أبدًا (KB-01).\n- **مواضيع مهنة الترجمة التفسيرية** (التقنيات، التفسير التتابعي والفوري، الأخلاقيات، التخصصات الطبية والقانونية): قاعدة المعرفة المدمجة لا تتضمن بعدُ صفحات موثقة عن هذه المواضيع — اسأل عن ميزة محددة أعلاه، أو استخدم وضع **البحث** للتحضير قبل الجلسة، أو اصعد إلى الدعم البشري.\n\nبأي مجال تريد أن نبدأ؟',
      citations: KNOWLEDGE_BASE.map((entry) => ({ id: entry.id, title: entry.title.en, href: entry.href })),
    };
  }
  if (lang === 'bn') {
    return {
      text:
        '### ইন্টারপ্রিটিং — আমি যেসব ক্ষেত্রে সাহায্য করতে পারি\n\n- **VOXRELAY ওয়ার্কস্পেস:** অ্যাসাইনমেন্ট ও শিডিউল (KB-02), টার্মিনোলজি ও গ্লসারি (KB-03), ক্যালেন্ডার ইম্পোর্ট (KB-04), অ্যাসিস্ট্যান্স পলিসি (KB-05), বিলিং (KB-06), ডিভাইস রেডিনেস (KB-07), এবং সাপোর্ট (KB-08)।\n- **প্রাইভেসি সীমানা:** VOXRELAY কখনই যা করে না (KB-01)।\n- **ইন্টারপ্রিটিং পেশার বিষয়** (কৌশল, consecutive ও simultaneous interpreting, নৈতিকতা, মেডিকেল/লিগ্যাল বিশেষায়িত ক্ষেত্র): নির্মিত নলেজ বেসে এগুলোর যাচাই করা পাতা এখনো নেই — উপরের কোনো নির্দিষ্ট ফিচার সম্পর্কে জিজ্ঞাসা করুন, সেশনের আগে **Research** মোড ব্যবহার করুন, বা মানব সহায়তায় এস্কেলেট করুন।\n\nকোন ক্ষেত্র দিয়ে শুরু করতে চান?',
      citations: KNOWLEDGE_BASE.map((entry) => ({ id: entry.id, title: entry.title.en, href: entry.href })),
    };
  }
  return {
    text:
      '### Interpreting — what I can help with\n\n- **VOXRELAY workspace:** assignments & scheduling (KB-02), terminology & glossaries (KB-03), calendar import (KB-04), assistance policy tiers (KB-05), billing (KB-06), device readiness (KB-07), and getting support (KB-08).\n- **Privacy boundaries:** what VOXRELAY never does (KB-01).\n- **Interpreting-domain topics** (techniques, consecutive vs simultaneous, ethics, medical/legal specialties): the built-in knowledge base does not yet include verified pages on these — ask me about a specific workspace feature above, use **Research** mode for pre-session preparation on a named topic, or escalate to human support.\n\nWhich area would you like to start with?',
    citations: KNOWLEDGE_BASE.map((entry) => ({ id: entry.id, title: entry.title[lang] || entry.title.en, href: entry.href })),
  };
}

function productAnswer(lang) {
  const entry = knowledgeEntryById('KB-01');
  if (!entry) return null;
  const title = entry.title[lang] || entry.title.en;
  const summary = entry.summary[lang] || entry.summary.en;
  const lines = entryLines(entry, lang, 3);
  return {
    text: `### ${title}\n\n${summary}\n\n${lines}`,
    citations: [{ id: entry.id, title, href: entry.href }],
  };
}

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
        ? '### فوكس — مساعد VOXRELAY\n\n- **من أنا:** فوكس، المساعد المدمج في مساحة عمل VOXRELAY للمترجمين الفوريين.\n- **ما يمكنني فعله:**\n  - الإجابة عن الأسئلة المدعومة من قاعدة المعرفة المعتمدة — قواعد الخصوصية (KB-01)، سير عمل المهام (KB-02)، المصطلحات والقاموس (KB-03)، استيراد التقويم (KB-04)، سياسة المساعدة (KB-05)، الفوترة (KB-06)، جهوزية الجهاز (KB-07)، والدعم (KB-08) — مع ذكر المصادر.\n  - إعداد ملخصات التحضير والمصطلحات المقترحة في وضع **البحث**.\n  - قراءة سجلاتك الخاصة (المهام، المصطلحات، التذاكر المفتوحة) عند السؤال عنها.\n- **ما لا يمكنني فعله:** تسجيل الصوت، أو الترجمة الفورية للجلسات الحية (المستوى T3 للبشر فقط)، أو تقديم نصائح طبية أو قانونية، أو حجز المترجمين، أو التواصل مع المؤسسات نيابةً عنك.\n- **قاعدة الأمانة:** عندما لا أملك معلومات موثوقة أقول ذلك بدلاً من التخمين.'
        : lang === 'bn'
          ? '### ভক্স — VOXRELAY সহকারী\n\n- **আমি কে:** ভক্স, VOXRELAY ইন্টারপ্রেটার ওয়ার্কস্পেসের অন্তর্নির্মিত সহকারী।\n- **যা করতে পারি:**\n  - অনুমোদিত নলেজ বেস থেকে উত্তর — প্রাইভেসি নিয়ম (KB-01), অ্যাসাইনমেন্ট ওয়ার্কফ্লো (KB-02), টার্মিনোলজি ও গ্লসারি (KB-03), ক্যালেন্ডার ইম্পোর্ট (KB-04), অ্যাসিস্ট্যান্স পলিসি (KB-05), বিলিং (KB-06), ডিভাইস রেডিনেস (KB-07), এবং সাপোর্ট (KB-08) — সূত্রসহ।\n  - **Research** মোডে সেশন-পূর্ব প্রস্তুতির সারসংক্ষেপ ও প্রস্তাবিত টার্ম তৈরি।\n  - আপনার নিজের ওয়ার্কস্পেস রেকর্ড (অ্যাসাইনমেন্ট, গ্লসারি টার্ম, খোলা টিকিট) পড়া, জিজ্ঞাসা করলে।\n- **যা করতে পারি না:** অডিও রেকর্ড করা, লাইভ সেশন অনুবাদ করা (T3 মানব-বিচারসীমা), মেডিকেল বা লিগ্যাল পরামর্শ, ইন্টারপ্রেটার বুক করা, বা আপনার হয়ে সংস্থার সঙ্গে যোগাযোগ।\n- **সততার নিয়ম:** নির্ভরযোগ্য তথ্য না থাকলে আন্দাজ না করে সেটাই বলি।'
          : "### Vox — the VOXRELAY assistant\n\n- **Who I am:** Vox, the built-in assistant of the VOXRELAY interpreter workspace.\n- **What I can do:**\n  - Answer grounded questions from the approved knowledge base — privacy rules (KB-01), assignments workflow (KB-02), terminology & glossaries (KB-03), calendar import (KB-04), assistance policy (KB-05), billing (KB-06), device readiness (KB-07), and support (KB-08) — with citations.\n  - Build pre-session prep briefs and suggested glossary terms in **Research** mode.\n  - Read your own workspace records (assignments, glossary terms, open tickets) when you ask about them.\n- **What I can't do:** record audio, interpret or translate live sessions (T3 human-only), give medical or legal advice, book interpreters, or contact organizations on your behalf.\n- **Honesty rule:** when I don't have reliable information, I say so instead of guessing.";
    emit({ type: 'delta', text: identityText });
    emit({ type: 'quick_chips', show: true });
    return;
  }

  if (PRODUCT_RE.test(sanitized)) {
    const product = productAnswer(lang);
    if (product) {
      emit({ type: 'delta', text: product.text });
      emit({ type: 'citations', items: product.citations });
      emit({ type: 'quick_chips', show: true });
      return;
    }
  }

  if (mode === 'ask' && isBroadDomainQuery(sanitized)) {
    const broad = broadDomainAnswer(lang);
    emit({ type: 'delta', text: broad.text });
    emit({ type: 'citations', items: broad.citations });
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
        ? 'مرحباً! أنا فوكس، مساعد VOXRELAY. كيف يمكنني مساعدتك اليوم؟ يمكنك سؤالي عن الجدولة واستيراد .ics، الخصوصية وعدم التسجيل، فحص الجهاز، أو مستويات T0–T3 — أو اختيار موضوع سريع أدناه.'
        : lang === 'bn'
          ? 'হ্যালো! আমি ভক্স, VOXRELAY সহকারী। সময়সূচী ও .ics আমদানি, গোপনীয়তা, ডিভাইস পরীক্ষা, বা T0–T3 নীতি সম্পর্কে প্রশ্ন করুন বা নিচের যেকোনো বিষয়ে ক্লিক করুন।'
          : "Hello! I'm Vox, the VOXRELAY assistant. How can I help you today? Pick a quick topic below or ask about scheduling, privacy, device readiness, or billing.";
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
  const ambiguousMatch = kbScored.filter((s) => s.score === topScore).length > 1;
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
        ? 'لا أجد معلومات موثوقة عن هذا الموضوع في قاعدة معرفة VOXRELAY، لذلك لن أخمّن إجابة. ما يمكنني المساعدة فيه بدلاً من ذلك: قواعد الخصوصية وما لا يفعله VOXRELAY أبدًا، سير عمل المهام، المصطلحات والقاموس، استيراد التقويم، سياسة المساعدة، الفوترة، جهوزية الجهاز، والحصول على الدعم. يمكنك أيضًا إعادة السؤال بمصطلح أكثر تحديدًا، أو استخدام وضع **البحث** للتحضير قبل الجلسة، أو فتح تذكرة دعم أدناه ليتابعها فريق بشري.'
        : lang === 'bn'
          ? 'VOXRELAY নলেজ বেসে এই বিষয়ে নির্ভরযোগ্য তথ্য এখন নেই, তাই আন্দাজ করে উত্তর দেব না। এর বদলে আমি সাহায্য করতে পারি: প্রাইভেসি নিয়ম ও VOXRELAY কখনই যা করে না, অ্যাসাইনমেন্ট ওয়ার্কফ্লো, টার্মিনোলজি ও গ্লসারি, ক্যালেন্ডার ইম্পোর্ট, অ্যাসিস্ট্যান্স পলিসি, বিলিং, ডিভাইস রেডিনেস, এবং সাপোর্ট পাওয়া। আরও নির্দিষ্ট শব্দ দিয়ে আবার জিজ্ঞাসা করতে পারেন, সেশন-পূর্ব প্রস্তুতির জন্য **Research** মোড ব্যবহার করতে পারেন, অথবা নিচে সাপোর্ট টিকিট খুলতে পারেন — মানব টিম অনুসরণ করবে।'
          : "I don't have verified information on that in the VOXRELAY knowledge base, so I won't guess. What I can help with instead: privacy rules and what VOXRELAY never does, the assignments workflow, terminology and glossaries, calendar import, the assistance policy, billing, device readiness, and getting support. You can also rephrase with a more specific term, use **Research** mode for pre-session prep, or open a support ticket below for a human follow-up.";
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

  const bnFallbackNote =
    lang === 'bn' && !top.bullets?.bn && !top.summary?.bn
      ? 'তথ্য: এই বিষয়ের নির্ভরযোগ্য তথ্য এখন ইংরেজিতে আছে (প্রযুক্তিগত শব্দ ইংরেজিতেই থাকবে)।\n\n'
      : '';

  const ambiguousNote = ambiguousMatch
    ? lang === 'ar'
      ? '\n\n- **ملاحظة:** سؤالك يتعلق بأكثر من موضوع واحد هنا — أخبرني أيّها تقصد، أو اطلب تفاصيل أكثر عن أحدها.'
      : lang === 'bn'
        ? '\n\n- **নোট:** আপনার প্রশ্ন এখানে একাধিক বিষয়ের সঙ্গে মেলে — কোনটি বুঝিয়েছেন বলুন, বা আরও বিস্তারিত জিজ্ঞাসা করুন।'
        : '\n\n- **Note:** your question matches more than one knowledge-base topic — tell me which one you meant, or ask about one of them in more detail.'
    : '';

  const structuredFallback = bnFallbackNote + `### ${topTitle} [${top.id}]\n${topBullets}` + workspaceNote + weakMatchNote + ambiguousNote;

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
