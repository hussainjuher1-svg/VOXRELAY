export const KNOWLEDGE_BASE = [
  {
    id: 'KB-01',
    category: 'boundaries',
    href: '/privacy',
    title: {
      en: 'What VOXRELAY does and never does',
      ar: 'ما يفعله VOXRELAY وما لا يفعله أبداً',
    },
    summary: {
      en: 'VOXRELAY manages the operational workflow around remote interpreting sessions: schedules, preparation checklists, personal terminology glossaries, device checks, billing logs, and human support queues. It never interprets, translates, records audio, transcribes sessions, or stores patient or client identities.',
      ar: 'يدير VOXRELAY سير العمل التشغيلي حول جلسات الترجمة عن بُعد: الجداول وقوائم التحضير ومسارد المصطلحات وفحص الأجهزة وسجلات الفوترة وطوابير الدعم البشري. لا يترجم ولا يسجل الصوت ولا يفرغ الجلسات ولا يحفظ بيانات المرضى أو العملاء.',
    },
    keywords: ['privacy', 'record', 'recording', 'transcript', 'translate', 'interpret', 'patient', 'phi', 'pii', 'never', 'boundary', 'boundaries', 'خصوصية', 'تسجيل', 'ترجمة', 'تفريغ'],
  },
  {
    id: 'KB-02',
    category: 'workflow',
    href: '/how-it-works',
    title: {
      en: 'Assignment lifecycle from offer to close-out',
      ar: 'دورة حياة المهمة من العرض حتى الإغلاق',
    },
    summary: {
      en: 'Assignments follow strict state transitions: offered → scheduled → preparation_required → ready → in_progress → completed (or rescheduled / cancelled). During an active session, VOXRELAY switches to Session Focus mode so you can log operational timestamps such as clarification or technical pauses without distraction.',
      ar: 'تتبع المهام انتقالات حالة دقيقة: معروضة ← مجدولة ← تحتاج تحضيراً ← جاهزة ← قيد التنفيذ ← مكتملة. أثناء الجلسة النشطة يتحول VOXRELAY إلى وضع التركيز لتسجيل التوقيتات التشغيلية فقط دون تشتيت.',
    },
    keywords: ['assignment', 'assignments', 'schedule', 'workflow', 'offer', 'ready', 'session', 'close-out', 'status', 'lifecycle', 'مهمة', 'مهام', 'جدول', 'إغلاق'],
  },
  {
    id: 'KB-03',
    category: 'terminology',
    href: '/app/terminology',
    title: {
      en: 'Multilingual glossary, script search & CSV import/export',
      ar: 'المسرد متعدد اللغات والبحث واستيراد وتصدير CSV',
    },
    summary: {
      en: 'The Terminology workspace normalizes Latin diacritics, Arabic alef/teh/harakat variants, Hebrew nikud, and Devanagari scripts using NFKC/NFD normalization so searches match reliably. You can import UTF-8 and UTF-16 CSV files (with BOM detection) and export UTF-8 BOM CSV files safely for Excel.',
      ar: 'يوحد قسم المصطلحات علامات التشكيل والهمزات والحركات باستخدام معيار NFKC/NFD ليطابق البحث بدقة عبر العربية والإنجليزية والعبرية والديفاناغاري، مع دعم استيراد UTF-8/UTF-16 وتصدير CSV.',
    },
    keywords: ['glossary', 'terminology', 'term', 'terms', 'csv', 'utf-8', 'utf-16', 'bom', 'arabic', 'search', 'excel', 'مصطلحات', 'مسرد', 'بحث'],
  },
  {
    id: 'KB-04',
    category: 'calendar',
    href: '/app/assignments',
    title: {
      en: 'Timing-only .ics calendar import & time zones',
      ar: 'استيراد تقويم .ics للتوقيت فقط والمناطق الزمنية',
    },
    summary: {
      en: 'When importing an .ics file, VOXRELAY reads only DTSTART and DTEND to calculate start timestamps and duration in minutes. Event titles, summaries, attendee emails, and descriptions are deliberately ignored so client details never enter your workspace.',
      ar: 'عند استيراد ملف .ics، يقرأ VOXRELAY فقط DTSTART وDTEND لحساب وقت البدء والمدة بالدقائق، ويتجاهل العناوين والوصف وأسماء الحضور لحماية سرية العملاء.',
    },
    keywords: ['ics', 'calendar', 'import', 'dtstart', 'dtend', 'timezone', 'time zone', 'utc', 'تقويم', 'استيراد', 'توقيت'],
  },
  {
    id: 'KB-05',
    category: 'policy',
    href: '/organizations',
    title: {
      en: 'T0–T3 assistance policy & human-only decisions',
      ar: 'سياسة المساعدة T0–T3 والقرارات البشرية فقط',
    },
    summary: {
      en: 'VOXRELAY classifies operational actions into four tiers: T0–T2 are disabled by default unless an organization admin enables versioned policies, while T3 (clinical/legal judgment, live interpreting, quality grading, and dispute resolution) is permanently sealed as human-only and cannot be automated.',
      ar: 'يصنف VOXRELAY الإجراءات إلى أربعة مستويات: T0–T2 معطلة افتراضياً ما لم يفعلها مسؤول المنظمة، أما T3 (القرارات البشرية والترجمة الحية والنزاعات) فمغلقة دائماً للإنسان فقط.',
    },
    keywords: ['t0', 't1', 't2', 't3', 'policy', 'human', 'tier', 'tiers', 'rbac', 'role', 'admin', 'coordinator', 'سياسة', 'بشري', 'صلاحيات'],
  },
  {
    id: 'KB-06',
    category: 'billing',
    href: '/app/billing',
    title: {
      en: 'Billing calculation, minimum minutes & rounding rules',
      ar: 'حساب الفواتير والحد الأدنى للدقائق وقواعد التقريب',
    },
    summary: {
      en: 'The Billing log calculates billable minutes by applying your minimum-minute floor first, then rounding up to your chosen increment (such as 15 minutes), and tracks invoiced vs. paid status cleanly.',
      ar: 'يحسب سجل الفواتير الدقائق القابلة للفوترة بتطبيق الحد الأدنى أولاً ثم التقريب لأعلى إلى أقرب فاصل زمني محدد مع تتبع حالة الفاتورة والدفع.',
    },
    keywords: ['billing', 'invoice', 'paid', 'rate', 'minutes', 'rounding', 'minimum', 'pay', 'فواتير', 'سعر', 'دقائق'],
  },
  {
    id: 'KB-07',
    category: 'device',
    href: '/app/device-check',
    title: {
      en: 'Pre-session audio readiness check',
      ar: 'فحص جاهزية الصوت قبل الجلسة',
    },
    summary: {
      en: 'Device check verifies browser microphone permission and live input signal levels locally using Web Audio API without recording, buffering, or uploading any audio stream.',
      ar: 'يتحقق فحص الجهاز من إذن الميكروفون ومستوى الإشارة محلياً في المتصفح دون تسجيل أو تخزين أو رفع أي صوت.',
    },
    keywords: ['device', 'microphone', 'mic', 'audio', 'check', 'readiness', 'browser', 'ميكروفون', 'صوت', 'جهاز'],
  },
  {
    id: 'KB-08',
    category: 'access',
    href: '/contact',
    title: {
      en: 'Requesting access, invites & human support',
      ar: 'طلب الوصول والدعوات والدعم البشري',
    },
    summary: {
      en: 'Submit a request on the Request Access / Contact page with your role and languages. Platform or organization admins review requests in the review queue and issue one-time invite links, or you can open a support ticket directly from the Workspace Assistant.',
      ar: 'قدّم طلباً عبر صفحة طلب الوصول مع دورك ولغاتك، ويقوم المسؤول بمراجعته وإرسال رابط دعوة لمرة واحدة، أو افتح تذكرة دعم مباشر من المساعد.',
    },
    keywords: ['access', 'request', 'invite', 'login', 'account', 'support', 'ticket', 'contact', 'help', 'دعم', 'وصول', 'دعوة', 'حساب'],
  },
];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from',
  'how', 'in', 'into', 'is', 'it', 'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
  'في', 'من', 'على', 'إلى', 'عن', 'ما', 'هل', 'كيف', 'أو', 'مع', 'هذا', 'هذه',
]);

export function searchKnowledgeBase(query, locale = 'en', limit = 4) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return KNOWLEDGE_BASE.slice(0, limit);
  const tokens = q
    .split(/[^\p{L}\p{N}.-]+/u)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return [];
  const scored = KNOWLEDGE_BASE.map((entry) => {
    const title = (entry.title[locale] || entry.title.en).toLowerCase();
    const summary = (entry.summary[locale] || entry.summary.en).toLowerCase();
    const kw = entry.keywords.join(' ').toLowerCase();
    let score = 0;
    if (title.includes(q)) score += 10;
    if (summary.includes(q)) score += 6;
    for (const token of tokens) {
      if (title.includes(token)) score += 4;
      if (kw.includes(token)) score += 3;
      if (summary.includes(token)) score += 2;
    }
    return { entry, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.entry);
}
