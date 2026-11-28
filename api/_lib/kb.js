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
      en: 'VOXRELAY manages the operational workflow around remote interpreting sessions and never interprets, records audio, or stores client identities.',
      ar: 'يدير VOXRELAY سير العمل التشغيلي حول جلسات الترجمة عن بُعد ولا يترجم ولا يسجل الصوت ولا يحفظ بيانات العملاء.',
    },
    bullets: {
      en: [
        'Manages schedules, prep checklists, personal glossaries, device checks, billing logs, and human support.',
        'Never interprets, translates live dialogue, records audio, or transcribes sessions.',
        'Never stores patient, client, or caller identities (PHI/PII).',
      ],
      ar: [
        'يدير الجداول وقوائم التحضير ومسارد المصطلحات وفحص الأجهزة وسجلات الفوترة والدعم البشري.',
        'لا يترجم المحادثات الحية ولا يسجل الصوت ولا يفرغ الجلسات.',
        'لا يحفظ بيانات المرضى أو العملاء أو هوياتهم.',
      ],
    },
    keywords: ['privacy', 'record', 'recording', 'zero', 'transcript', 'translate', 'interpret', 'patient', 'phi', 'pii', 'never', 'boundary', 'boundaries', 'خصوصية', 'تسجيل', 'ترجمة', 'تفريغ'],
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
      en: 'Assignments follow strict state transitions from offered through close-out, with a distraction-free Session Focus mode during live calls.',
      ar: 'تتبع المهام انتقالات حالة دقيقة من العرض حتى الإغلاق مع وضع التركيز أثناء الجلسة.',
    },
    bullets: {
      en: [
        'Workflow states: offered → scheduled → preparation_required → ready → in_progress → completed.',
        'Reschedule or cancel transitions are tracked with timestamps and audit events.',
        'Session Focus hides secondary UI during an active call and logs operational pauses only.',
      ],
      ar: [
        'مراحل المهمة: معروضة ← مجدولة ← تحتاج تحضيراً ← جاهزة ← قيد التنفيذ ← مكتملة.',
        'يتتبع النظام إعادة الجدولة والإلغاء بتوقيتات وسجل تدقيق.',
        'وضع التركيز يخفي التشتيت أثناء الجلسة ويسجل التوقفات التشغيلية فقط.',
      ],
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
      en: 'Terminology normalizes diacritics across scripts for instant search and supports UTF-8 / UTF-16 CSV import and Excel-safe BOM export.',
      ar: 'يوحد قسم المصطلحات علامات التشكيل عبر اللغات لبحث دقيق ويدعم استيراد وتصدير CSV بأمان.',
    },
    bullets: {
      en: [
        'Normalizes Latin accents, Arabic alef/teh/harakat, Hebrew nikud, and Devanagari (NFKC/NFD).',
        'Imports UTF-8 and UTF-16 CSV files with automatic BOM detection.',
        'Exports UTF-8 BOM CSV files so Arabic and multilingual characters open cleanly in Excel.',
      ],
      ar: [
        'يوحد التشكيل والهمزات والحركات عبر العربية والإنجليزية والعبرية والديفاناغاري.',
        'يدعم استيراد ملفات CSV بترميز UTF-8 وUTF-16 مع اكتشاف BOM تلقائياً.',
        'يصدر ملفات UTF-8 BOM لتفتح بشكل سليم في Excel.',
      ],
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
      en: 'Calendar .ics import reads start and end timestamps only while stripping titles, descriptions, and attendee data.',
      ar: 'يقرأ استيراد .ics أوقات البدء والانتهاء فقط ويتجاهل العناوين والوصف والحضور.',
    },
    bullets: {
      en: [
        'Drop or select an .ics file in Assignments to parse DTSTART and DTEND timestamps.',
        'Computes session start time and duration in minutes in your chosen time zone.',
        'Event summaries, attendee emails, and descriptions are discarded so client details never enter VOXRELAY.',
      ],
      ar: [
        'اسحب أو اختر ملف .ics في صفحة المهام لقراءة DTSTART وDTEND فقط.',
        'يحسب وقت البدء والمدة بالدقائق وفق منطقتك الزمنية.',
        'يتجاهل العناوين والوصف وبريد الحضور لحماية سرية العملاء.',
      ],
    },
    keywords: ['ics', 'calendar', 'import', 'scheduling', 'schedule', 'dtstart', 'dtend', 'timezone', 'time zone', 'utc', 'تقويم', 'استيراد', 'توقيت'],
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
      en: 'T0–T2 are optional admin-enabled operational assists, while T3 human judgment and live interpreting remain permanently locked.',
      ar: 'مستويات T0–T2 اختيارية وبموافقة المسؤول، بينما يبقى T3 مغلقاً للقرار البشري فقط.',
    },
    bullets: {
      en: [
        'T0–T2 cover non-clinical operational prep and reminders and are off until enabled by an org admin.',
        'T3 is permanently sealed as human-only: live interpreting, clinical/legal judgment, QA grading, and disputes.',
        'Every policy change is versioned and recorded in the audit log.',
      ],
      ar: [
        'تشمل T0–T2 التحضير والتنبيهات التشغيلية وتكون معطلة حتى يفعلها مسؤول المنظمة.',
        'T3 مغلق دائماً للإنسان فقط: الترجمة الحية، القرارات الطبية والقانونية، وتقييم الجودة والنزاعات.',
        'يُحفظ كل تعديل في السياسة برقم إصدار وسجل تدقيق.',
      ],
    },
    keywords: ['t0', 't1', 't2', 't3', 'operational', 'policy', 'human', 'tier', 'tiers', 'rbac', 'role', 'admin', 'coordinator', 'سياسة', 'بشري', 'صلاحيات'],
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
      en: 'Billing applies your minimum-minute floor first, rounds up to your increment, and tracks invoiced vs. paid records.',
      ar: 'تطبق الفوترة الحد الأدنى أولاً ثم التقريب لأعلى مع تتبع حالة الفاتورة والدفع.',
    },
    bullets: {
      en: [
        'Applies your minimum-minute floor (e.g., 30 min) before calculating billable time.',
        'Rounds up to your selected increment (e.g., 15 min) and multiplies by your hourly rate.',
        'Tracks each logged entry as invoiced or paid.',
      ],
      ar: [
        'يطبق الحد الأدنى للدقائق أولاً (مثل 30 دقيقة) قبل الحساب.',
        'يقرب لأعلى إلى أقرب فاصل محدد (مثل 15 دقيقة) ويحسب القيمة بالساعة.',
        'يتتبع كل سجل بين حالة المفوتر والمدفوع.',
      ],
    },
    keywords: ['billing', 'invoice', 'paid', 'payout', 'payouts', 'rate', 'minutes', 'rounding', 'minimum', 'pay', 'فواتير', 'سعر', 'دقائق'],
  },
  {
    id: 'KB-07',
    category: 'device',
    href: '/app/device-check',
    title: {
      en: 'Pre-session audio & readiness check',
      ar: 'فحص جاهزية الصوت والجهاز قبل الجلسة',
    },
    summary: {
      en: 'Device check measures browser microphone, speaker, camera, and network RTT locally without recording or uploading audio.',
      ar: 'يقيس فحص الجهاز الميكروفون والسماعة والكاميرا والشبكة محلياً دون تسجيل أو رفع أي صوت.',
    },
    bullets: {
      en: [
        'Open **Device check** and pick your session profile (`Voice-only`, `Voice + Video`, or `Full`).',
        'Click **Test mic** to measure live signal dBFS, peak %, and sample rate locally via Web Audio API.',
        'Click **Play 440Hz tone** and **Confirm audible** to verify speaker output, then run **Test camera** if needed.',
        'Network RTT, jitter, packet loss, and WebRTC/Opus readiness are measured live — zero audio is ever recorded or uploaded.',
      ],
      ar: [
        'افتح **فحص الجهاز** واختر نوع الجلسة (`صوت فقط`، `صوت + فيديو`، أو `كامل`).',
        'اضغط **فحص الميكروفون** لقياس الإشارة محلياً عبر Web Audio API.',
        'اضغط **تشغيل نغمة 440Hz** ثم **تأكيد السماع**، وافحص الكاميرا عند الحاجة.',
        'تُقاس استجابة الشبكة والفقد وWebRTC مباشرة دون أي تسجيل أو رفع للصوت.',
      ],
    },
    keywords: ['device', 'microphone', 'mic', 'audio', 'check', 'readiness', 'latency', 'network', 'browser', 'speaker', 'camera', 'ميكروفون', 'صوت', 'جهاز'],
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
      en: 'Request access with your role and languages for admin invite approval, or open a human support ticket directly.',
      ar: 'قدّم طلب وصول مع دورك ولغاتك، أو افتح تذكرة دعم بشري مباشرة.',
    },
    bullets: {
      en: [
        'Submit your role, languages, and work email on the **Request Access** page.',
        'Organization or platform admins review requests and issue one-time invite links.',
        'Need human help anytime? Open a ticket in **Support** or click **Human support** in this drawer.',
      ],
      ar: [
        'قدّم دورك ولغاتك وبريدك في صفحة **طلب الوصول**.',
        'يراجع المسؤولون الطلب ويرسلون رابط دعوة لمرة واحدة.',
        'يمكنك فتح تذكرة في **الدعم** أو مباشرة من هذا المساعد في أي وقت.',
      ],
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

export const KB_STRONG_MATCH_THRESHOLD = 8;

export function searchKnowledgeBaseWithScores(query, locale = 'en', limit = 4) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return KNOWLEDGE_BASE.slice(0, limit).map((entry) => ({ entry, score: 0 }));
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

  return scored.slice(0, limit);
}

export function searchKnowledgeBase(query, locale = 'en', limit = 4) {
  return searchKnowledgeBaseWithScores(query, locale, limit).map((s) => s.entry);
}
