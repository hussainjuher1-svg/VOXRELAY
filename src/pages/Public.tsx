import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Check, Lock, Mic, ShieldCheck } from 'lucide-react';
import { useLocale } from '../context/hooks';
import { KNOWLEDGE_BASE } from '../../api/_lib/kb.js';
import {
  ChapterFollowupIllustration,
  ChapterPrepareIllustration,
  ChapterSessionIllustration,
  InterpretersIllustration,
  NotFoundIllustration,
  OrganizationsIllustration,
  PrivacyVaultIllustration,
} from '../components/EditorialIllustrations';
import { Button } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Badge, Skeleton } from '../components/ui/Primitives';
import { Select } from '../components/ui/Select';

export function HomePage({ onOpenAssistant }: { onOpenAssistant?: (q?: string) => void }) {
  const { locale } = useLocale();
  const isAr = locale === 'ar';
  const [heroTab, setHeroTab] = useState<'schedule' | 'glossary' | 'readiness'>('schedule');
  const [checks, setChecks] = useState({ mic: true, phi: true, boundary: true });

  return (
    <div className="pub-page">
      {/* 1. Enterprise Split Hero — Upright Typography + Real Workspace Ledger */}
      <section className="hero-band">
        <div className="pub-container hero-split-enterprise">
          <div className="hero-copy">
            <p className="eyebrow">
              {isAr ? 'إدارة عمليات الترجمة الفورية عن بُعد' : 'Remote interpreting operations'}
            </p>
            <h1 className="hero-h1">
              {isAr
                ? 'منصة تشغيل منظمة للتحضير والمواعيد والمصطلحات قبل الجلسة وبعدها.'
                : 'Coordinate interpreting schedules, readiness, and terminology in one workspace.'}
            </h1>
            <p className="hero-lead">
              {isAr
                ? 'استورد مواعيد التقويم بالتوقيت المحلي والعالمي، افحص الميكروفون محلياً في المتصفح، وأدر مسارد ثنائية اللغة — دون تسجيل صوتي أو تفريغ نصي أو حفظ هوية المريض.'
                : 'Manage timing-only calendar assignments, run browser-local microphone checks, and maintain bilingual glossaries—without audio recording, live transcription, or patient identity storage.'}
            </p>
            <div className="hero-cta-row">
              <Link to="/contact" className="cta-primary-pill">
                {isAr ? 'طلب الوصول' : 'Request access'}
              </Link>
              <Link to="/privacy" className="cta-secondary-pill">
                {isAr ? 'ميثاق الخصوصية' : 'Read privacy charter'}
              </Link>
            </div>
            <div className="hero-trust-strip">
              <span>
                <Lock size={13} aria-hidden="true" />
                {isAr ? 'استيراد .ics بدون بيانات مرضى' : 'Timing-only .ics intake'}
              </span>
              <span>
                <Mic size={13} aria-hidden="true" />
                {isAr ? 'فحص صوت محلي بلا تسجيل' : 'Browser-local mic check'}
              </span>
              <span>
                <ShieldCheck size={13} aria-hidden="true" />
                {isAr ? 'سير عمل بشري حصري T3' : 'Human-only T3 policy'}
              </span>
            </div>
          </div>

          {/* Crisp Interactive Enterprise Workspace Ledger */}
          <div className="workspace-preview-card" aria-label={isAr ? 'معاينة مساحة العمل' : 'Interactive workspace preview'}>
            <div className="workspace-preview-bar">
              <div className="workspace-preview-title">
                <span className="status-dot is-ok" aria-hidden="true" />
                <span>{isAr ? 'هيكل جدول المواعيد' : 'Workspace structure'}</span>
              </div>
              <Badge tone="teal">{isAr ? 'سير عمل بشري T3' : 'T3 · Human-only'}</Badge>
            </div>

            <Tabs.Root
              value={heroTab}
              onValueChange={(v) => setHeroTab(v as 'schedule' | 'glossary' | 'readiness')}
            >
              <Tabs.List className="workspace-tabs-list" aria-label={isAr ? 'تبويبات المعاينة' : 'Workspace tabs'}>
                <Tabs.Trigger value="schedule" className="workspace-tab-btn">
                  {isAr ? 'المواعيد' : 'Schedule ledger'}
                </Tabs.Trigger>
                <Tabs.Trigger value="glossary" className="workspace-tab-btn">
                  {isAr ? 'المسرد' : 'Terminology'}
                </Tabs.Trigger>
                <Tabs.Trigger value="readiness" className="workspace-tab-btn">
                  {isAr ? 'فحص الجاهزية' : 'Pre-flight'}
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="schedule" className="workspace-tab-body">
                <div className="ledger-table" role="table" aria-label={isAr ? 'حقول جدول المواعيد' : 'Assignment fields'}>
                  <div className="ledger-row ledger-row--head" role="row">
                    <span>{isAr ? 'الحقل' : 'Field'}</span>
                    <span>{isAr ? 'النوع' : 'Type'}</span>
                    <span>{isAr ? 'سياسة المعالجة' : 'Handling rule'}</span>
                    <span>{isAr ? 'النطاق' : 'Scope'}</span>
                  </div>
                  <div className="ledger-row" role="row">
                    <code>start_at</code>
                    <span>ISO-8601</span>
                    <span>{isAr ? 'مقروء من DTSTART فقط' : 'Parsed from DTSTART only'}</span>
                    <code>UTC + TZ</code>
                  </div>
                  <div className="ledger-row" role="row">
                    <code>duration_min</code>
                    <span>Integer</span>
                    <span>{isAr ? 'محسوب من DTEND − DTSTART' : 'Derived from DTEND − DTSTART'}</span>
                    <code>Minutes</code>
                  </div>
                  <div className="ledger-row" role="row">
                    <code>summary</code>
                    <span>Discarded</span>
                    <span>{isAr ? 'مُستبعد لمنع إدخال هوية العميل' : 'Ignored on import to exclude PHI'}</span>
                    <code>0 bytes</code>
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content value="glossary" className="workspace-tab-body">
                <div className="ledger-table" role="table" aria-label={isAr ? 'خصائص المسرد' : 'Terminology engine'}>
                  <div className="ledger-row ledger-row--head" role="row">
                    <span>{isAr ? 'الخاصية' : 'Capability'}</span>
                    <span>{isAr ? 'المعيار' : 'Standard'}</span>
                    <span>{isAr ? 'السلوك' : 'Behavior'}</span>
                    <span>{isAr ? 'الحالة' : 'Status'}</span>
                  </div>
                  <div className="ledger-row" role="row">
                    <span>{isAr ? 'استيراد CSV' : 'CSV intake'}</span>
                    <code>UTF-8/16</code>
                    <span>{isAr ? 'كشف BOM وتوافق Excel' : 'Automatic BOM detection'}</span>
                    <code>Active</code>
                  </div>
                  <div className="ledger-row" role="row">
                    <span>{isAr ? 'تطبيع البحث' : 'Script search'}</span>
                    <code>NFKC/NFD</code>
                    <span>{isAr ? 'تجاهل التشكيل والهمزات' : 'Matches Arabic & Latin variants'}</span>
                    <code>Active</code>
                  </div>
                  <div className="ledger-row" role="row">
                    <span>{isAr ? 'وصول سريع' : 'Quick lookup'}</span>
                    <code>Cmd+K</code>
                    <span>{isAr ? 'انتقال فوري للمصطلحات والمهام' : 'Jump across terms and routes'}</span>
                    <code>Ready</code>
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content value="readiness" className="workspace-tab-body">
                <div className="readiness-checks">
                  <button
                    type="button"
                    className={`readiness-item${checks.mic ? ' is-checked' : ''}`}
                    onClick={() => setChecks((c) => ({ ...c, mic: !c.mic }))}
                  >
                    <span className="readiness-box">{checks.mic && <Check size={12} />}</span>
                    <span>
                      <strong>{isAr ? 'فحص الميكروفون عبر AudioContext' : 'Local AudioContext mic signal check'}</strong>
                      <small>{isAr ? 'يعمل في المتصفح دون إرسال أي صوت' : 'Runs locally in browser; zero server stream'}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`readiness-item${checks.phi ? ' is-checked' : ''}`}
                    onClick={() => setChecks((c) => ({ ...c, phi: !c.phi }))}
                  >
                    <span className="readiness-box">{checks.phi && <Check size={12} />}</span>
                    <span>
                      <strong>{isAr ? 'تنقيح البيانات الشخصية آلياً' : 'Automatic PII & attendee stripping'}</strong>
                      <small>{isAr ? 'استبعاد أسماء المرضى والعناوين عند الاستيراد' : 'Names, attendees, and descriptions discarded on intake'}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`readiness-item${checks.boundary ? ' is-checked' : ''}`}
                    onClick={() => setChecks((c) => ({ ...c, boundary: !c.boundary }))}
                  >
                    <span className="readiness-box">{checks.boundary && <Check size={12} />}</span>
                    <span>
                      <strong>{isAr ? 'التزام T3 البشري الحصري' : 'Sealed T3 human-only runtime policy'}</strong>
                      <small>{isAr ? 'لا ترجمة حية ولا تفريغ نصي داخل أي جلسة' : 'Live interpreting and speech capture permanently disabled'}</small>
                    </span>
                  </button>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
      </section>

      {/* 2. Architectural Boundary Band */}
      <section className="band-wrapper">
        <div className="pub-container">
          <div className="dark-pause-band">
            <p className="eyebrow eyebrow--inverse">
              {isAr ? 'الحد الفاصل في البنية' : 'Architectural boundary'}
            </p>
            <h2 className="dark-band-display">
              {isAr
                ? 'تقنية منظمة تساند المترجم البشري ولا تحل محله.'
                : 'Operational software built to support human interpreters—never replace them.'}
            </h2>
            <p className="dark-band-prose">
              {isAr
                ? 'لا ترجمة آلية، لا تسجيل صوتي، ولا تفريغ نصي في أي شاشة. كل جلسة تبقى بقيادة بشرية خالصة.'
                : 'VOXRELAY enforces a sealed T3 human-only policy across API endpoints, database schema, and assistant guardrails. Live audio stays strictly within your external call platform.'}
            </p>
            <div className="dark-band-actions">
              <Link to="/privacy" className="cta-cream-pill">
                {isAr ? 'ميثاق الخصوصية' : 'Read the Privacy Charter'}
              </Link>
              <button
                type="button"
                className="cta-ghost-inverse"
                onClick={() => onOpenAssistant?.(isAr ? 'ما حدود عمل VOXRELAY؟' : 'What does VOXRELAY never do?')}
              >
                {isAr ? 'اسأل المساعد' : 'Ask the assistant'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Asymmetrical [34/66] Statement + Hairline-Ruled Rows */}
      <section className="band-vellum">
        <div className="pub-container split-editorial-rows">
          <div className="split-editorial-lead">
            <p className="eyebrow">{isAr ? 'المعمارية التشغيلية' : 'Operational discipline'}</p>
            <h2 className="section-display">
              {isAr ? 'كل ما تحتاجه قبل الجلسة وبعدها' : 'Structured control before and after every session'}
            </h2>
            <p className="editorial-prose">
              {isAr
                ? 'تفصل المنصة المواعيد والمصطلحات والفوترة عن محتوى اللقاء الطبي أو القانوني.'
                : 'Designed with clear tabular schedules, strict role isolation, and full auditability for independent practitioners and language teams.'}
            </p>
          </div>

          <div className="ruled-statement-list">
            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? '01 · استيراد مواعيد آمن' : '01 · Timing-only calendar intake'}</h3>
                <p>
                  {isAr
                    ? 'اقرأ أوقات البدء والمدة فقط من ملفات .ics وتجاهل العناوين وأسماء المشاركين.'
                    : 'Parse DTSTART and DTEND from .ics files while discarding event titles, attendee names, and clinical context.'}
                </p>
              </div>
              <Link to="/how-it-works" className="editorial-inline-link">
                {isAr ? 'التفاصيل' : 'Workflow'}
              </Link>
            </div>

            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? '02 · فحص الميكروفون محلياً' : '02 · Local AudioContext check'}</h3>
                <p>
                  {isAr
                    ? 'قِس مستوى الإشارة داخل المتصفح قبل الاتصال دون رفع أي مقطع صوتي إلى الخادم.'
                    : 'Verify input signal level live in your browser before joining calls—zero media streams leave your device.'}
                </p>
              </div>
              <Link to="/interpreters" className="editorial-inline-link">
                {isAr ? 'للمترجمين' : 'Interpreters'}
              </Link>
            </div>

            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? '03 · مسارد مصطلحات ثنائية اللغة' : '03 · Bilingual terminology vault'}</h3>
                <p>
                  {isAr
                    ? 'ابحث في المسارد العربية والإنجليزية بدعم كامل للاستيراد والتصدير بترميز UTF-16.'
                    : 'Maintain English–Arabic glossaries with diacritic-tolerant search and Excel-safe UTF-8/UTF-16 CSV export.'}
                </p>
              </div>
              <Link to="/app/terminology" className="editorial-inline-link">
                {isAr ? 'المسرد' : 'Glossary'}
              </Link>
            </div>

            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? '04 · مراجعة الطلبات والدعم البشري' : '04 · Reviewed access & human support'}</h3>
                <p>
                  {isAr
                    ? 'تُراجع طلبات الانضمام عبر بوابة الإدارة مع إصدار دعوات لمرة واحدة وتذاكر دعم موثقة.'
                    : 'Every access request goes through an admin approval queue with single-use invite tokens and support ticket SLAs.'}
                </p>
              </div>
              <Link to="/organizations" className="editorial-inline-link">
                {isAr ? 'للمؤسسات' : 'Organizations'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Grounded Specifications */}
      <section className="band-paper">
        <div className="pub-container">
          <div className="section-head-row">
            <div>
              <p className="eyebrow">{isAr ? 'مواصفات موثقة' : 'Documented specifications'}</p>
              <h2 className="section-display">
                {isAr ? 'ضوابط منشورة في قاعدة المعرفة' : 'Verified rules from the system knowledge base'}
              </h2>
            </div>
            <Link to="/faq" className="editorial-inline-link">
              {isAr ? 'عرض جميع الأسئلة' : 'Read full FAQ'}
            </Link>
          </div>

          <div className="field-notes-grid">
            {KNOWLEDGE_BASE.slice(0, 3).map((entry) => (
              <article key={entry.id} className="field-note-card">
                <div className="field-note-meta">
                  <span>{entry.id}</span>
                  <span>{entry.category}</span>
                </div>
                <h3>{isAr ? entry.title.ar : entry.title.en}</h3>
                <p>{isAr ? entry.summary.ar : entry.summary.en}</p>
                <Link to={entry.href} className="editorial-inline-link">
                  {isAr ? 'عرض المرجع' : 'Read specification'}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function HowItWorksPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  const chapters = [
    {
      num: '01',
      title: isAr ? 'الفصل الأول: التحضير قبل الجلسة' : 'Chapter 01: Prepare before the call',
      lead: isAr
        ? 'استورد جدولك بالتوقيت المحلي والعالمي، تحقق من الميكروفون، وراجع المسرد.'
        : 'Import timing-only .ics blocks, run a local microphone signal check, and review domain terminology before joining.',
      bullets: isAr
        ? ['قراءة DTSTART و DTEND فقط', 'تجاهل عناوين الاجتماعات وأسماء المرضى', 'قائمة تحقق متدرجة للجاهزية']
        : ['Reads DTSTART and DTEND only', 'Discards event titles and attendee names', 'Structured pre-session readiness checklist'],
      illustration: <ChapterPrepareIllustration />,
    },
    {
      num: '02',
      title: isAr ? 'الفصل الثاني: التركيز أثناء الجلسة' : 'Chapter 02: Hold the session',
      lead: isAr
        ? 'شاشة تركيز داكنة تعرض المؤقت والمصطلحات المرتبطة بالجلسة فقط — دون أي تسجيل.'
        : 'Use a low-glare dark focus surface showing session timing and linked glossary terms—zero transcription, zero audio capture.',
      bullets: isAr
        ? ['واجهة منخفضة السطوع مريحة للعين', 'وصول سريع للمسرد عبر Cmd+K', 'حماية T3: العمل البشري الحصري']
        : ['Low-glare dark session view', 'Instant Cmd+K glossary lookup', 'Strict T3 human-only runtime seal'],
      illustration: <ChapterSessionIllustration />,
    },
    {
      num: '03',
      title: isAr ? 'الفصل الثالث: المتابعة والفوترة' : 'Chapter 03: Close and log cleanly',
      lead: isAr
        ? 'سجل المدة الفعلية والرسوم والملاحظات التشغيلية دون تخزين أي تفاصيل سريرية.'
        : 'Record completed duration, billing totals, and non-clinical operational handoffs without patient identifiers.',
      bullets: isAr
        ? ['حساب المدة والتعرفة بدقة جدولية', 'ربط تذاكر الدعم البشري عند الحاجة', 'تصدير بياناتك أو حذفها بالكامل']
        : ['Tabular duration and fee summaries', 'Human support escalation thread', 'Full user-controlled export and deletion'],
      illustration: <ChapterFollowupIllustration />,
    },
  ];

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container narrow-measure">
          <p className="eyebrow">{isAr ? 'فصول سير العمل' : 'Workflow'}</p>
          <h1 className="page-display">
            {isAr ? 'ثلاث مراحل تحترم تركيز المترجم' : 'Three operational stages around every session'}
          </h1>
          <p className="editorial-prose">
            {isAr
              ? 'صُممت كل مرحلة لتعمل مع أي منصة اتصال مرئية أو هاتفية دون لمس القناة الصوتية.'
              : 'Each stage supports what happens before and after your video or telephone interpreting session without touching the audio stream.'}
          </p>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container chapters-stack">
          {chapters.map((ch) => (
            <article key={ch.num} className="chapter-row">
              <div className="chapter-copy">
                <span className="chapter-num">{ch.num}</span>
                <h2>{ch.title}</h2>
                <p className="editorial-prose">{ch.lead}</p>
                <ul className="editorial-checklist">
                  {ch.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="chapter-art">{ch.illustration}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function InterpretersPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container hero-split-enterprise">
          <div>
            <p className="eyebrow">{isAr ? 'للمترجمين الفوريين' : 'For interpreters'}</p>
            <h1 className="page-display">
              {isAr ? 'بيئة عمل مستقلة ومنظمة للمترجم الفوري' : 'A disciplined desk for independent practice'}
            </h1>
            <p className="editorial-prose">
              {isAr
                ? 'احتفظ بمواعيدك باللغة والمدة، وجهز مساردك الخاصة، وراقب فواتيرك دون إرباك أو تشتيت.'
                : 'Keep language pairs, readiness checks, bilingual CSV glossaries, and billing records organized in one predictable workspace.'}
            </p>
            <div className="hero-cta-row">
              <Link to="/contact" className="cta-primary-pill">
                {isAr ? 'طلب حساب مترجم' : 'Request interpreter access'}
              </Link>
            </div>
          </div>
          <div className="hero-illustration-wrap">
            <InterpretersIllustration />
          </div>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container split-editorial-rows">
          <div className="split-editorial-lead">
            <h2 className="section-display">{isAr ? 'مصمم للعمل الفعلي' : 'Built for daily reliability'}</h2>
          </div>
          <div className="ruled-statement-list">
            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? 'استيراد تقويم .ics بنقرة' : 'Clean .ics calendar intake'}</h3>
                <p>{isAr ? 'يعالج المنطقة الزمنية ويحسب الدقائق تلقائياً.' : 'Converts timestamps to UTC + your local zone automatically.'}</p>
              </div>
            </div>
            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? 'فحص الصوت قبل الدخول' : 'Browser microphone verification'}</h3>
                <p>{isAr ? 'يعمل محلياً عبر Web Audio API دون حفظ أي ملف.' : 'Measures real-time microphone RMS locally without recording.'}</p>
              </div>
            </div>
            <div className="ruled-statement-row">
              <div>
                <h3>{isAr ? 'تصدير UTF-16 المتوافق مع Excel' : 'UTF-16 Excel-safe glossary export'}</h3>
                <p>{isAr ? 'تظهر الحروف العربية بدقة تامة عند فتح الملف في Excel.' : 'Preserves Arabic diacritics and right-to-left strings cleanly.'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function OrganizationsPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container hero-split-enterprise">
          <div>
            <p className="eyebrow">{isAr ? 'للمؤسسات وفرق التنسيق' : 'For organizations'}</p>
            <h1 className="page-display">
              {isAr ? 'إشراف منضبط يحترم خصوصية المريض' : 'Operational visibility without clinical overreach'}
            </h1>
            <p className="editorial-prose">
              {isAr
                ? 'أدر طلبات الانضمام، الصلاحيات، وسجلات التدقيق الموقّتة مع بقاء الملاحظات الشخصية للمترجم خاصة.'
                : 'Coordinate access approvals, role boundaries, support SLAs, and append-only audit trails while keeping interpreters’ private preparation notes strictly personal.'}
            </p>
            <div className="hero-cta-row">
              <Link to="/contact" className="cta-primary-pill">
                {isAr ? 'طلب وصول للمؤسسة' : 'Request organization access'}
              </Link>
            </div>
          </div>
          <div className="hero-illustration-wrap">
            <OrganizationsIllustration />
          </div>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container index-grid-4">
          <div className="index-cell">
            <span className="index-kicker">{isAr ? 'الصلاحيات' : 'RBAC'}</span>
            <h3>{isAr ? 'أربعة أدوار واضحة' : 'Scoped roles'}</h3>
            <p>{isAr ? 'مترجم، منسق مؤسسة، موظف دعم، ومدير منصة.' : 'Interpreter, org admin, support agent, and platform admin.'}</p>
          </div>
          <div className="index-cell">
            <span className="index-kicker">{isAr ? 'الخصوصية' : 'Isolation'}</span>
            <h3>{isAr ? 'عزل الملاحظات الشخصية' : 'Note isolation'}</h3>
            <p>{isAr ? 'المديرون يرون الحالة والمدة دون الملاحظات الخاصة.' : 'Org admins see scheduling status, never personal prep notes.'}</p>
          </div>
          <div className="index-cell">
            <span className="index-kicker">{isAr ? 'الدعوات' : 'Onboarding'}</span>
            <h3>{isAr ? 'طابور موافقة موثق' : 'Reviewed queue'}</h3>
            <p>{isAr ? 'دعوات لمرة واحدة وتوثيق في صندوق البريد الصادر.' : 'Admin approval queue generating single-use invite links.'}</p>
          </div>
          <div className="index-cell">
            <span className="index-kicker">{isAr ? 'التدقيق' : 'Audit'}</span>
            <h3>{isAr ? 'سجل أحداث قابل للتصدير' : 'Append-only log'}</h3>
            <p>{isAr ? 'تتبع تسجيل الدخول والموافقات والتغييرات الحساسة.' : 'Records approvals, sign-ins, and deletions transparently.'}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PrivacyPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container hero-split-enterprise">
          <div>
            <p className="eyebrow">{isAr ? 'ميثاق الخصوصية' : 'Privacy charter'}</p>
            <h1 className="page-display">
              {isAr ? 'البيانات التي لا نجمعها هي خط الدفاع الأول' : 'What we refuse to store is our primary safeguard'}
            </h1>
            <p className="editorial-prose">
              {isAr
                ? 'صُممت بنية VOXRELAY لتستبعد الصوت المباشر والتفريغ النصي وبيانات المرضى من الأساس.'
                : 'Privacy in interpreting is architectural, not a checkbox. VOXRELAY excludes live speech, transcripts, and patient identities by design.'}
            </p>
          </div>
          <div className="hero-illustration-wrap">
            <PrivacyVaultIllustration />
          </div>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container essay-layout">
          <aside className="essay-toc" aria-label={isAr ? 'فهرس المقال' : 'Essay contents'}>
            <p className="eyebrow">{isAr ? 'المحتويات' : 'Sections'}</p>
            <a href="#zero-capture">{isAr ? '01 · عدم تسجيل الصوت' : '01 · Zero audio capture'}</a>
            <a href="#ics-hygiene">{isAr ? '02 · تقليص بيانات المواعيد' : '02 · Timing-only scheduling'}</a>
            <a href="#pii-redaction">{isAr ? '03 · تنقيح المساعد المعرفي' : '03 · Assistant PII redaction'}</a>
            <a href="#export-delete">{isAr ? '04 · التصدير والحذف' : '04 · Export & erasure'}</a>
          </aside>

          <article className="essay-body">
            <section id="zero-capture" className="essay-section">
              <h2>{isAr ? '01 · لا تسجيل صوتي ولا تفريغ نصي' : '01 · Zero audio capture and zero transcription'}</h2>
              <p className="editorial-prose">
                {isAr
                  ? 'يعمل فحص الميكروفون عبر Web Audio API محلياً داخل المتصفح لقراءة مستوى الصوت فقط. لا توجد أي واجهة برمجية لرفع الصوت أو تخزينه أو تحويله إلى نص.'
                  : 'The pre-session device check runs locally inside your browser using Web Audio API RMS metering. No audio buffers are recorded, uploaded, transcribed, or sent to any external speech endpoint.'}
              </p>
              <blockquote className="editorial-pullquote">
                {isAr
                  ? '«أفضل وسيلة لحماية سرية الجلسة الطبية هي ألا يمر صوتها عبر خوادمنا مطلقاً.»'
                  : '“The cleanest safeguard for confidential interpreting is ensuring live session speech never touches our servers.”'}
              </blockquote>
            </section>

            <section id="ics-hygiene" className="essay-section">
              <h2>{isAr ? '02 · تقليص بيانات التقويم' : '02 · Timing-only calendar intake'}</h2>
              <p className="editorial-prose">
                {isAr
                  ? 'عند استيراد ملف .ics، يلتقط المحلل حقلي DTSTART و DTEND لحساب الوقت والمدة بالدقائق فقط، ويتجاهل الحقول الوصفية وأسماء الحضور.'
                  : 'When importing an .ics file, the parser extracts only DTSTART and DTEND to derive UTC/local timing and duration. Event titles, locations, attendee emails, and clinical descriptions are ignored.'}
              </p>
            </section>

            <section id="pii-redaction" className="essay-section">
              <h2>{isAr ? '03 · تنقيح البيانات الشخصية في المساعد' : '03 · PII redaction in the Work Assistant'}</h2>
              <p className="editorial-prose">
                {isAr
                  ? 'يقوم المساعد تلقائياً بتنقيح البريد الإلكتروني وأرقام الهواتف والمعرّفات قبل توليد الإجابة الموثقة، ويرفض أي طلب لترجمة محادثات حية أو تقديم استشارة طبية أو قانونية.'
                  : 'Every question sent to /api/assistant passes a regex redaction filter stripping emails, phone numbers, and government ID patterns before response synthesis, and hard-blocks live translation or clinical/legal advice.'}
              </p>
            </section>

            <section id="export-delete" className="essay-section">
              <h2>{isAr ? '04 · حق التصدير والحذف الكامل' : '04 · Full user export and erasure'}</h2>
              <p className="editorial-prose">
                {isAr
                  ? 'يمكنك تصدير مساردك وجداولك وإغلاق حسابك أو إبطال جلساتك النشطة من صفحة الإعدادات.'
                  : 'Operators can export glossaries and assignment records, inspect active device sessions, sign out everywhere, or remove records cleanly from workspace settings.'}
              </p>
            </section>
          </article>
        </div>
      </section>
    </div>
  );
}

export function FaqPage({ onOpenAssistant }: { onOpenAssistant?: (q?: string) => void }) {
  const { locale } = useLocale();
  const isAr = locale === 'ar';
  const [openId, setOpenId] = useState<string>(KNOWLEDGE_BASE[0]?.id || 'KB-01');

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container narrow-measure">
          <p className="eyebrow">{isAr ? 'الأسئلة الشائعة' : 'Frequently asked questions'}</p>
          <h1 className="page-display">
            {isAr ? 'إجابات موثقة متزامنة مع المساعد المعرفي' : 'Canonical answers synced with the Work Assistant'}
          </h1>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container narrow-measure">
          <div className="faq-accordion">
            {KNOWLEDGE_BASE.map((item) => {
              const expanded = openId === item.id;
              const qTitle = isAr ? item.title.ar : item.title.en;
              const qSummary = isAr ? item.summary.ar : item.summary.en;
              return (
                <article key={item.id} className="faq-row">
                  <button
                    type="button"
                    className="faq-trigger"
                    aria-expanded={expanded}
                    onClick={() => setOpenId(expanded ? '' : item.id)}
                  >
                    <span className="faq-id">{item.id}</span>
                    <span className="faq-question">{qTitle}</span>
                    <span className="faq-chevron" aria-hidden="true">
                      {expanded ? '−' : '+'}
                    </span>
                  </button>
                  {expanded && (
                    <div className="faq-panel">
                      <p className="editorial-prose">{qSummary}</p>
                      <div className="faq-panel-links">
                        <Link to={item.href} className="editorial-inline-link">
                          {isAr ? 'المصدر في الموقع' : 'View reference'}
                        </Link>
                        {onOpenAssistant && (
                          <button
                            type="button"
                            className="editorial-inline-link"
                            onClick={() => onOpenAssistant(qTitle)}
                          >
                            {isAr ? 'متابعة مع المساعد' : 'Ask follow-up'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export function StatusPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';
  const [statusData, setStatusData] = useState<{
    ok: boolean;
    storageMode: string;
    directDatabaseAccess: string;
    aiProviderEnabled: boolean;
    checkedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((d) => setStatusData(d))
      .catch(() => setStatusData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container narrow-measure">
          <p className="eyebrow">{isAr ? 'حالة النظام الحية' : 'Live diagnostics'}</p>
          <h1 className="page-display">{isAr ? 'حالة المنصة والجاهزية' : 'System status'}</h1>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container narrow-measure">
          {loading ? (
            <div className="status-skeletons">
              <Skeleton height="44px" />
              <Skeleton height="44px" />
              <Skeleton height="44px" />
            </div>
          ) : statusData ? (
            <div className="ruled-ledger status-ledger">
              <div className="ruled-ledger-row">
                <span>{isAr ? 'صحة واجهة البرمجة (/api/health)' : 'API Health (/api/health)'}</span>
                <Badge tone={statusData.ok ? 'sage' : 'danger'}>
                  {statusData.ok ? (isAr ? 'متصل' : 'Operational') : (isAr ? 'متعثر' : 'Degraded')}
                </Badge>
              </div>
              <div className="ruled-ledger-row">
                <span>{isAr ? 'محرك التخزين الفعلي' : 'Persistence backend'}</span>
                <code>{statusData.storageMode}</code>
              </div>
              <div className="ruled-ledger-row">
                <span>{isAr ? 'عزل قاعدة البيانات المباشرة' : 'Public DB RLS lock'}</span>
                <code>{statusData.directDatabaseAccess}</code>
              </div>
              <div className="ruled-ledger-row">
                <span>{isAr ? 'محرك المساعد المعرفي' : 'Assistant engine'}</span>
                <code>{statusData.aiProviderEnabled ? 'Anthropic + Grounded KB' : 'Grounded KB + Research'}</code>
              </div>
              <div className="ruled-ledger-row">
                <span>{isAr ? 'وقت الفحص (UTC)' : 'Checked at (UTC)'}</span>
                <code>{statusData.checkedAt}</code>
              </div>
            </div>
          ) : (
            <p className="editorial-prose">
              {isAr ? 'تعذر الوصول إلى نقطة فحص الحالة.' : 'Unable to reach /api/status.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export function ContactPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [audience, setAudience] = useState('interpreter');
  const [organization, setOrganization] = useState('');
  const [country, setCountry] = useState('');
  const [languages, setLanguages] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedId, setSubmittedId] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          audience,
          organization,
          country,
          languages,
          message,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || (isAr ? 'تحقق من البيانات المدخلة.' : 'Please check your submission.'));
      } else {
        setSubmittedId(data.id || 'queued');
      }
    } catch {
      setError(isAr ? 'تعذر إرسال الطلب حالياً.' : 'Unable to submit request right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container narrow-measure">
          <p className="eyebrow">{isAr ? 'طلب الوصول' : 'Request access'}</p>
          <h1 className="page-display">
            {isAr ? 'ابدأ مساحة عمل VOXRELAY الخاصة بك' : 'Request access to VOXRELAY'}
          </h1>
          <p className="editorial-prose">
            {isAr
              ? 'يراجع فريقنا الطلبات ويصدر رابط دعوة لمرة واحدة مع تأكيد بريدي مباشر.'
              : 'Every request enters our review queue. Approved operators receive a single-use invite link and confirmation notice.'}
          </p>
        </div>
      </section>

      <section className="band-vellum">
        <div className="pub-container narrow-measure">
          {submittedId ? (
            <div className="editorial-card editorial-card--success" role="status">
              <Badge tone="sage">{isAr ? 'تم استلام الطلب' : 'Request queued'}</Badge>
              <h2>{isAr ? 'شكراً لتواصلك مع VOXRELAY' : 'Access request recorded'}</h2>
              <p className="editorial-prose">
                {isAr
                  ? 'تم تسجيل طلبك في طابور المراجعة وتجهيز رسالة التأكيد. رقم المرجع:'
                  : 'Your request has been saved in the review queue and your confirmation email is queued. Reference ID:'}
              </p>
              <code className="ref-code">{submittedId}</code>
              <div className="hero-cta-row">
                <Link to="/status" className="cta-secondary-pill">
                  {isAr ? 'عرض حالة النظام' : 'View system status'}
                </Link>
              </div>
            </div>
          ) : (
            <form className="editorial-form" onSubmit={handleSubmit}>
              {error && (
                <div className="form-alert--error" role="alert">
                  {error}
                </div>
              )}

              <div className="form-two-col">
                <Field label={isAr ? 'الاسم الكامل' : 'Full name'} htmlFor="contact-name" required>
                  <Input
                    id="contact-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder={isAr ? 'مثال: سارة المنصور' : 'e.g. Nadia Al-Mansoor'}
                  />
                </Field>
                <Field label={isAr ? 'البريد الإلكتروني للعمل' : 'Work email'} htmlFor="contact-email" required>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="name@organization.org"
                  />
                </Field>
              </div>

              <div className="form-two-col">
                <Field label={isAr ? 'الفئة / الدور' : 'Role'} htmlFor="contact-audience">
                  <Select
                    id="contact-audience"
                    value={audience}
                    onValueChange={setAudience}
                    ariaLabel={isAr ? 'الفئة / الدور' : 'Role'}
                    options={[
                      { value: 'interpreter', label: isAr ? 'مترجم فوري مستقل' : 'Independent interpreter' },
                      { value: 'organization', label: isAr ? 'مستشفى أو فريق لغات' : 'Clinic or language team' },
                      { value: 'support', label: isAr ? 'شريك دعم وتشغيل' : 'Operations / support partner' },
                    ]}
                  />
                </Field>
                <Field label={isAr ? 'أزواج اللغات' : 'Language pairs'} htmlFor="contact-langs">
                  <Input
                    id="contact-langs"
                    value={languages}
                    onChange={(e) => setLanguages(e.target.value)}
                    placeholder="EN ↔ AR"
                  />
                </Field>
              </div>

              <div className="form-two-col">
                <Field label={isAr ? 'المؤسسة (اختياري)' : 'Organization (optional)'} htmlFor="contact-org">
                  <Input
                    id="contact-org"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                  />
                </Field>
                <Field label={isAr ? 'البلد / المنطقة' : 'Country / region'} htmlFor="contact-country">
                  <Input
                    id="contact-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </Field>
              </div>

              <Field label={isAr ? 'نبذة عن احتياج العمل' : 'Workflow notes'} htmlFor="contact-msg">
                <Textarea
                  id="contact-msg"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    isAr
                      ? 'اذكر متطلبات التحضير أو عدد المترجمين دون إدراج بيانات مرضى...'
                      : 'Describe scheduling or glossary needs without patient identifiers...'
                  }
                />
              </Field>

              <div className="hp-field" aria-hidden="true">
                <label htmlFor="contact-website">Website</label>
                <input
                  id="contact-website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div className="form-submit-row">
                <Button type="submit" size="lg" loading={submitting}>
                  {isAr ? 'إرسال طلب الوصول' : 'Submit access request'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export function NotFoundPage() {
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container narrow-measure center-stack">
          <NotFoundIllustration />
          <p className="eyebrow">404</p>
          <h1 className="page-display">
            {isAr ? 'هذه الصفحة غير موجودة في الفهرس' : 'This page is not in the index'}
          </h1>
          <p className="editorial-prose">
            {isAr
              ? 'ربما تغيّر الرابط أو أُغلق. يمكنك العودة إلى الصفحة الرئيسية أو استعراض الأسئلة.'
              : 'The address may have moved. Return to the home ledger or open the command palette with Cmd+K.'}
          </p>
          <div className="hero-cta-row">
            <Link to="/" className="cta-primary-pill">
              {isAr ? 'العودة للرئيسية' : 'Back to home'}
            </Link>
            <Link to="/faq" className="cta-secondary-pill">
              {isAr ? 'الأسئلة الشائعة' : 'Open FAQ'}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
