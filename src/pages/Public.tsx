import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LandingHero } from '../components/LandingHero';
import { Mic, MicOff, X } from 'lucide-react';
import { useAuth, useLocale } from '../context/hooks';
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

const MARQUEE_LANGS = [
  'Русский',
  'हिन्दी',
  'Italiano',
  'Polski',
  'English',
  'Español',
  'Français',
  'العربية',
];

function LiveDeviceCheckCard({ isAr }: { isAr: boolean }) {
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const measureLatency = useCallback(async (showSpinner = false) => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    if (window.location.origin === 'null') return;
    if (showSpinner) setPinging(true);
    try {
      const t0 = performance.now();
      const res = await fetch('/api/health', { cache: 'no-store' });
      const elapsed = Math.max(1, Math.round(performance.now() - t0));
      if (res.ok) {
        setLatencyMs(elapsed);
      }
    } catch {
      // Leave latency as null if offline / unreachable
    } finally {
      if (showSpinner) setPinging(false);
    }
  }, []);

  const stopMic = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setMicActive(false);
    setMicLevel(0);
  }, []);

  async function toggleMic() {
    if (micActive) {
      stopMic();
      return;
    }
    setMicError(null);
    void measureLatency();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError(isAr ? 'واجهة الميكروفون غير متاحة في هذا المتصفح.' : 'Microphone API is unavailable in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        stream.getTracks().forEach((t) => t.stop());
        setMicError(isAr ? 'محرك Web Audio غير مدعوم.' : 'Web Audio is not supported.');
        return;
      }

      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      streamRef.current = stream;
      ctxRef.current = ctx;
      setMicActive(true);
      setPeakLevel(0);

      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const pct = Math.min(100, Math.round(rms * 280));
        setMicLevel(pct);
        setPeakLevel((prev) => Math.max(prev, pct));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setMicError(
        isAr ? 'تم رفض إذن الميكروفون أو لا يوجد ميكروفون متصل.' : 'Microphone permission denied or no device found.'
      );
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void measureLatency(false);
    }, 0);
    return () => {
      window.clearTimeout(id);
      stopMic();
    };
  }, [measureLatency, stopMic]);

  useEffect(() => {
    if (!micActive) return;
    const id = window.setInterval(() => {
      void measureLatency(false);
    }, 2500);
    return () => window.clearInterval(id);
  }, [micActive, measureLatency]);

  return (
    <div className="vx-ws-card-terracotta">
      <div className="vx-ws-device-head">
        <h3>{isAr ? 'فحص الجهاز' : 'Device check'}</h3>
        <button
          type="button"
          className="vx-ws-mic-btn"
          onClick={toggleMic}
          aria-pressed={micActive}
        >
          {micActive ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
          <span>
            {micActive
              ? isAr
                ? 'إيقاف الميكروفون'
                : 'Stop mic test'
              : isAr
                ? 'اختبار الميكروفون'
                : 'Test mic live'}
          </span>
        </button>
      </div>

      <div className="vx-ws-meter-wrap">
        <div
          className="vx-ws-meter"
          role="progressbar"
          aria-label={isAr ? 'مستوى إشارة الميكروفون' : 'Live microphone input level'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={micLevel}
        >
          <div className="vx-ws-meter-fill" style={{ width: `${micLevel}%` }} />
        </div>
        <div className="vx-ws-meter-meta">
          <span>
            {micError
              ? micError
              : micActive
                ? isAr
                  ? `بث مباشر من المتصفح · المستوى ${micLevel}% (الذروة ${peakLevel}%)`
                  : `Live in-tab input · Level ${micLevel}% (peak ${peakLevel}%)`
                : isAr
                  ? 'اضغط لاختبار الميكروفون محلياً دون إرسال أي صوت'
                  : 'Click Test mic live — audio stays in your tab'}
          </span>
        </div>
      </div>

      <div className="vx-ws-device-foot">
        <button
          type="button"
          className="vx-ws-rtt-btn"
          onClick={() => void measureLatency(true)}
          disabled={pinging}
        >
          {isAr ? 'زمن الاستجابة الفعلي ↻' : 'ROUND-TRIP (LIVE) ↻'}
        </button>
        <strong>
          {latencyMs !== null ? latencyMs : '—'}
          <span>ms</span>
        </strong>
      </div>
    </div>
  );
}

interface HomeAssignment {
  id: string;
  ref: string;
  start_at: string;
  duration_minutes: number;
  language_pair: string;
  modality: string;
  status: string;
}

export function HomePage() {
  const { locale } = useLocale();
  const { user, session } = useAuth();
  const isAr = locale === 'ar';
  const [assignments, setAssignments] = useState<HomeAssignment[]>([]);

  useEffect(() => {
    if (!user && !session?.access_token) return;
    let active = true;
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    fetch('/api/assignments', { headers, credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && Array.isArray(json?.data)) {
          setAssignments(json.data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, session?.access_token]);

  const activeAssignments = user ? assignments : [];
  const nextAssignment =
    activeAssignments.find((a) => a.status !== 'completed' && a.status !== 'cancelled') || activeAssignments[0] || null;
  const userGreetingName =
    (user && 'full_name' in user && typeof user.full_name === 'string' && user.full_name.trim()) ||
    (user && 'user_metadata' in user && typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (user?.email ? user.email.split('@')[0] : '');

  function formatUtcTime(iso: string) {
    try {
      return `${new Date(iso).toISOString().slice(11, 16)} UTC`;
    } catch {
      return '—';
    }
  }

  const stages = isAr
    ? [
        {
          num: '01',
          tone: 'terracotta',
          title: 'تعيين',
          desc: 'سجل المهام بالوسم ونوع الجلسة والوقت — دون هوية العميل مطلقاً.',
        },
        {
          num: '02',
          tone: 'gold',
          title: 'تحضير',
          desc: 'اربط ملخصات الإحاطة والمسارد والموارد بكل مهمة.',
        },
        {
          num: '03',
          tone: 'forest',
          title: 'فحص',
          desc: 'نفذ فحص جاهزية الجهاز. يُحلَّل صوتك داخل المتصفح ولا يُرسل أبداً.',
        },
        {
          num: '04',
          tone: 'sage',
          title: 'دعم',
          desc: 'كل ما يحتاج إلى تقدير بشري يصل إلى شخص حقيقي لا إلى رد آلي.',
        },
      ]
    : [
        {
          num: '01',
          tone: 'terracotta',
          title: 'Assign',
          desc: 'Log assignments by label, modality and time — never client identity.',
        },
        {
          num: '02',
          tone: 'gold',
          title: 'Prepare',
          desc: 'Link briefing summaries, glossaries and resources to every assignment.',
        },
        {
          num: '03',
          tone: 'forest',
          title: 'Check',
          desc: 'Run a device readiness check. Your audio is analyzed in-tab, never sent.',
        },
        {
          num: '04',
          tone: 'sage',
          title: 'Support',
          desc: 'Anything needing live judgment reaches a real person, not an automated reply.',
        },
      ];

  const frictions = isAr
    ? [
        {
          num: '01',
          accentTitle: true,
          pillTone: 'gold',
          pill: 'الجدول',
          title: 'المهام',
          desc: 'العروض والقبول والرفض ونموذج حالة واضح — بالكامل.',
        },
        {
          num: '02',
          pill: 'التقويم',
          title: 'التوفر',
          desc: 'الساعات المعتادة والاستثناءات والتجاوزات في تقويم يحترم منطقتك الزمنية.',
        },
        {
          num: '03',
          pill: 'المسرد',
          title: 'المصطلحات',
          desc: 'مسارد خاصة بكل زوج لغوي. لا يراها المنسقون أبداً.',
        },
        {
          num: '04',
          pill: 'فحص',
          title: 'جاهزية الجهاز',
          desc: 'مستوى الميكروفون وزمن الاستجابة وفحوص المتصفح قبل البث المباشر.',
        },
        {
          num: '05',
          pill: 'مرن',
          title: 'جاهز دون اتصال',
          desc: 'تخزين محلي وطوابير مزامنة نظيفة عند انقطاع الاتصال.',
        },
        {
          num: '06',
          pill: 'أشخاص',
          title: 'دعم بشري',
          desc: 'تصعيد دعم مترابط إلى منسق حقيقي أو مهندس دعم.',
        },
      ]
    : [
        {
          num: '01',
          accentTitle: true,
          pillTone: 'gold',
          pill: 'SCHEDULE',
          title: 'Assignments',
          desc: 'Offers, accepts, declines and a clean status model — in full.',
        },
        {
          num: '02',
          pill: 'CALENDAR',
          title: 'Availability',
          desc: 'Typical hours, exceptions and overrides on a calendar that respects your time zone.',
        },
        {
          num: '03',
          pill: 'GLOSSARY',
          title: 'Terminology',
          desc: 'Private glossaries by language pair. Coordinators never see them.',
        },
        {
          num: '04',
          pill: 'CHECK',
          title: 'Device readiness',
          desc: 'Mic level, round-trip latency and browser checks before you go live.',
        },
        {
          num: '05',
          pill: 'RESILIENT',
          title: 'Offline-ready',
          desc: 'IndexedDB caching and clean conflict queues when connectivity drops.',
        },
        {
          num: '06',
          pill: 'PEOPLE',
          title: 'Human support',
          desc: 'Threaded support escalation to an actual coordinator or support engineer.',
        },
      ];

  const refuseItems = isAr
    ? [
        'تنفيذ ترجمة فورية أو تحريرية آلية',
        'تسجيل محتوى الجلسة أو تفريغه أو تخزينه',
        'ادعاء شهادات اعتماد لا يملكها النظام',
        'عرض شعارات مصطنعة أو أرقام تجميلية',
      ]
    : [
        'Perform automatic translation or interpretation',
        'Record, transcribe or store session content',
        'Claim certifications it doesn’t hold',
        'Display fabricated logos or vanity metrics',
      ];

  const aiTiers = isAr
    ? [
        {
          tier: 'T0',
          title: 'أدوات حتمية',
          desc: 'الفرز والجدولة والتنسيق. دون ذكاء اصطناعي.',
          badge: 'مفعّل',
          tone: 'forest',
        },
        {
          tier: 'T1',
          title: 'مساعدة ذكية محدودة المخاطر',
          desc: 'معطّلة حتى تختار تفعيلها.',
          badge: 'مرفوض افتراضياً',
          tone: 'muted',
        },
        {
          tier: 'T2',
          title: 'تنسيق المصطلحات المقترحة',
          desc: 'معطّل حتى تختار تفعيله.',
          badge: 'مرفوض افتراضياً',
          tone: 'muted',
        },
        {
          tier: 'T3',
          title: 'التقدير البشري',
          desc: 'مقصور برمجياً على الإنسان في الخادم.',
          badge: '✓ بشري فقط',
          tone: 'dark',
        },
      ]
    : [
        {
          tier: 'T0',
          title: 'Deterministic utilities',
          desc: 'Sorting, scheduling, formatting. No AI.',
          badge: 'On',
          tone: 'forest',
        },
        {
          tier: 'T1',
          title: 'Low-risk AI assistance',
          desc: 'Disabled until you opt in.',
          badge: 'Default deny',
          tone: 'muted',
        },
        {
          tier: 'T2',
          title: 'Candidate term formatting',
          desc: 'Disabled until you opt in.',
          badge: 'Default deny',
          tone: 'muted',
        },
        {
          tier: 'T3',
          title: 'Human judgment',
          desc: 'Hard-stopped to a person in server code.',
          badge: '✓ Human only',
          tone: 'dark',
        },
      ];

  return (
    <div className="pub-page">
      <LandingHero />

      {/* 2. Tilted Forest-Green Language Marquee */}
      <section className="vx-marquee-band" aria-label={isAr ? 'اللغات المدعومة' : 'Supported languages'}>
        <div className="vx-marquee-ribbon">
          <div className="vx-marquee-track">
            {[...MARQUEE_LANGS, ...MARQUEE_LANGS, ...MARQUEE_LANGS].map((lang, idx) => (
              <span key={idx} className="vx-marquee-item">
                <span className="vx-marquee-lang">{lang}</span>
                <span className="vx-marquee-star" aria-hidden="true">✦</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 3. One workflow, four honest stages. */}
      <section className="vx-stages-band">
        <div className="pub-container">
          <h2 className="vx-section-title">
            {isAr ? 'سير عمل واحد، أربع مراحل صادقة.' : 'One workflow, four honest stages.'}
          </h2>

          <div className="vx-stages-grid">
            {stages.map((st) => (
              <article key={st.num} className={`vx-stage-card vx-stage-card--${st.tone}`}>
                <span className="vx-stage-num">{st.num}</span>
                <h3>{st.title}</h3>
                <p>{st.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Dark Forest Workspace Preview Band */}
      <section className="vx-workspace-band">
        <div className="pub-container">
          <p className="vx-workspace-eyebrow">{isAr ? 'مساحة عملك' : 'YOUR WORKSPACE'}</p>
          <h2 className="vx-workspace-heading">
            {isAr ? (
              <>
                هادئة من الداخل. <span className="vx-workspace-alive">حية</span> حيثما يلزم.
              </>
            ) : (
              <>
                Calm on the inside. <span className="vx-workspace-alive">Alive</span> where it counts.
              </>
            )}
          </h2>

          <div className="vx-workspace-cards">
            <div className="vx-ws-card-cream">
              <div className="vx-ws-top-row">
                <div>
                  <span className="vx-ws-greet">
                    {userGreetingName
                      ? isAr
                        ? `مرحباً، ${userGreetingName}`
                        : `WORKSPACE · ${userGreetingName.toUpperCase()}`
                      : isAr
                        ? 'جدول المترجم الفوري'
                        : 'INTERPRETER SCHEDULE'}
                  </span>
                  <h3>{isAr ? 'مهامك المجدولة' : 'Your assignments'}</h3>
                </div>
                <Link to={user ? '/app/assignments' : '/login?mode=signup'} className="vx-ws-count-pill">
                  {isAr ? `${activeAssignments.length} مجدول` : `${activeAssignments.length} scheduled`}
                </Link>
              </div>

              {nextAssignment ? (
                <Link to={`/app/session/${nextAssignment.id}`} className="vx-ws-row-item">
                  <span className="vx-ws-lang-badge">{nextAssignment.language_pair.slice(0, 5)}</span>
                  <div className="vx-ws-row-copy">
                    <strong>{nextAssignment.ref} · {nextAssignment.language_pair}</strong>
                    <span>
                      {formatUtcTime(nextAssignment.start_at)} · {nextAssignment.modality} · {nextAssignment.duration_minutes} min
                    </span>
                  </div>
                  <span className="vx-ws-status-pill">{nextAssignment.status}</span>
                </Link>
              ) : (
                <Link to={user ? '/app/assignments' : '/login?mode=signup'} className="vx-ws-row-item">
                  <span className="vx-ws-lang-badge">.ics</span>
                  <div className="vx-ws-row-copy">
                    <strong>
                      {user
                        ? isAr
                          ? 'لا توجد مهام مجدولة بعد'
                          : 'No assignments scheduled yet'
                        : isAr
                          ? 'سجّل الدخول أو أنشئ حساباً لبدء الجدول'
                          : 'Sign in or create an account to save your schedule'}
                    </strong>
                    <span>
                      {user
                        ? isAr
                          ? 'اضغط لإضافة مهمة أو استيراد ملف .ics'
                          : 'Click to create an assignment or import .ics timing slots'
                        : isAr
                          ? 'توقيت الجلسات واللغة والمدة فقط — دون هوية العميل'
                          : 'Timing, modality & language pairs only — zero client identity'}
                    </span>
                  </div>
                  <span className="vx-ws-status-pill">{user ? (isAr ? 'إضافة' : 'Add') : isAr ? 'ابدأ' : 'Open'}</span>
                </Link>
              )}
            </div>

            <LiveDeviceCheckCard isAr={isAr} />
          </div>
        </div>
      </section>

      {/* 5. Built against real friction. */}
      <section className="vx-friction-band">
        <div className="pub-container">
          <h2 className="vx-section-title">
            {isAr ? 'مبنية لمواجهة الاحتكاك الفعلي.' : 'Built against real friction.'}
          </h2>

          <div className="vx-friction-grid">
            {frictions.map((item) => (
              <article key={item.num} className="vx-friction-item">
                <div className="vx-friction-head">
                  <div className="vx-friction-title-wrap">
                    <span className="vx-friction-num">{item.num}</span>
                    <h3 className={item.accentTitle ? 'is-accent' : ''}>{item.title}</h3>
                  </div>
                  <span className={`vx-friction-pill${item.pillTone === 'gold' ? ' is-gold' : ''}`}>
                    {item.pill}
                  </span>
                </div>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 6. What VOXRELAY will not do. + AI, on your terms. */}
      <section className="vx-guardrails-band">
        <div className="pub-container vx-guardrails-grid">
          <div className="vx-refuse-card">
            <h2>{isAr ? 'ما لن يفعله VOXRELAY.' : 'What VOXRELAY will not do.'}</h2>
            <ul className="vx-refuse-list">
              {refuseItems.map((txt) => (
                <li key={txt}>
                  <span className="vx-refuse-x" aria-hidden="true">
                    <X size={13} />
                  </span>
                  <span>{txt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="vx-tiers-card">
            <h2>{isAr ? 'الذكاء الاصطناعي بشروطك.' : 'AI, on your terms.'}</h2>
            <div className="vx-tiers-list">
              {aiTiers.map((t) => (
                <div key={t.tier} className="vx-tier-row">
                  <span className="vx-tier-code">{t.tier}</span>
                  <div className="vx-tier-copy">
                    <strong>{t.title}</strong>
                    <span>{t.desc}</span>
                  </div>
                  <span className={`vx-tier-badge vx-tier-badge--${t.tone}`}>{t.badge}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Full-Bleed Terracotta Closing CTA */}
      <section className="vx-closing-band">
        <div className="pub-container vx-closing-inner">
          <h2>{isAr ? 'جاهز عندما تكون جاهزاً.' : 'Ready when you are.'}</h2>
          <p>
            {isAr
              ? 'أنشئ مساحة عملك الشخصية في دقائق. لا يلزمك دعوة مؤسسة لبدء التحضير.'
              : 'Create your personal workspace in minutes. No organization invite required to start preparing.'}
          </p>
          <Link to={user ? '/app' : '/login?mode=signup'} className="vx-closing-btn">
            {user
              ? isAr
                ? 'افتح مساحة عملك'
                : 'Open your workspace'
              : isAr
                ? 'أنشئ مساحة عملك'
                : 'Create your workspace'}
          </Link>
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
            <a href="#cookies-sessions">{isAr ? '05 · ملفات تعريف الارتباط والجلسات' : '05 · Cookies & sessions'}</a>
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

            <section id="cookies-sessions" className="essay-section">
              <h2>{isAr ? '05 · ملفات تعريف الارتباط والجلسات' : '05 · Cookies & sessions'}</h2>
              <p className="editorial-prose">
                {isAr
                  ? 'يستخدم VOXRELAY ملفات تعريف ارتباط أساسية للمصادقة فقط عند الحاجة. لا نستخدم ملفات تعريف ارتباط للتحليلات أو الإعلان أو التسويق.'
                  : 'VOXRELAY uses only the cookies needed for authentication and session security. We do not use analytics, advertising, or marketing cookies.'}
              </p>
              <p className="editorial-prose">
                {isAr
                  ? 'ملف جلسة محلي (voxrelay_session) هو ملف HttpOnly يملكه الخادم. عند تفعيل Supabase، قد تُستخدم ملفات تعريف ارتباط مصادقة يديرها المتصفح بواسطة @supabase/ssr؛ وهي ليست HttpOnly لأن عميل المتصفح يحتاج إليها، لكنها تستخدم SameSite=Lax وSecure في الإنتاج ومسار /.'
                  : 'The local workspace session cookie (voxrelay_session) is server-owned and HttpOnly. When Supabase Auth is configured, Supabase browser-managed auth cookies may be used by @supabase/ssr; these are not HttpOnly because the browser client must read/update them, but they are configured with SameSite=Lax, Secure in production, and Path=/.'}
              </p>
              <p className="editorial-prose">
                {isAr
                  ? 'خيار "تذكرني على هذا الجهاز" في تسجيل الدخول يتحكم في استمرار الجلسة: بدون تحديده تكون ملفات المصادقة جلسة متصفح وتنتهي عند إغلاق المتصفح (مع حد خادم أقصى يوم واحد للجلسة المحلية). عند تحديده تستمر الجلسة حتى 30 يوماً كحد أقصى للمتصفح، مع الالتزام بسياسات انتهاء صلاحية Supabase refresh token.'
                  : 'The "Remember me on this device" sign-in option controls persistence: unchecked uses browser-session auth cookies that end when the browser session closes (local server session capped at 1 day). Checked keeps auth persistence for up to 30 days in the browser, while Supabase refresh-token expiry and project security policies remain authoritative.'}
              </p>
              <p className="editorial-prose">
                {isAr
                  ? 'لا تُخزن كلمات المرور أو بيانات المرضى أو الهوية السريرية في ملفات تعريف الارتباط. يمكنك إدارة التفضيلات أو مسح ملفات تعريف الارتباط الاختيارية من الإعدادات > Cookie management، كما يمكنك تسجيل الخروج أو إبطال الجلسات لمسح جلسات المصادقة.'
                  : 'Passwords, patient data, clinical content, and unnecessary identifiers are never stored in cookies. You can manage cookie preferences and clear optional cookies from Settings &gt; Cookie management, and sign out or revoke sessions to clear auth sessions.'}
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
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState<'all' | 'privacy' | 'audio' | 'workflow'>('all');

  const filteredKb = KNOWLEDGE_BASE.filter((item) => {
    const text = `${item.id} ${item.title.en} ${item.summary.en} ${item.title.ar} ${item.summary.ar}`.toLowerCase();
    if (topic === 'privacy' && !/privacy|zero|pii|rls|ai|t3/.test(text)) return false;
    if (topic === 'audio' && !/audio|mic|device|latency|check/.test(text)) return false;
    if (topic === 'workflow' && !/schedule|ics|glossary|support|billing|assign/.test(text)) return false;
    return !search.trim() || text.includes(search.trim().toLowerCase());
  });

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
          <div className="vx-filter-row">
            <div className="vx-filter-chips" role="group" aria-label="Knowledge base topics">
              {(['all', 'workflow', 'privacy', 'audio'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`vx-filter-chip${topic === t ? ' is-active' : ''}`}
                  onClick={() => setTopic(t)}
                >
                  {t === 'all' ? `All (${KNOWLEDGE_BASE.length})` : t}
                </button>
              ))}
            </div>
            <input
              type="search"
              dir="auto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث في الأسئلة...' : 'Filter knowledge base...'}
              aria-label="Filter FAQ articles"
              className="ui-input"
              style={{ maxWidth: 240 }}
            />
          </div>

          <div className="faq-accordion">
            {filteredKb.map((item) => {
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
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    const t0 = performance.now();
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      const d = await r.json();
      setStatusData(d);
      setLatencyMs(Math.max(1, Math.round(performance.now() - t0)));
    } catch {
      setStatusData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchStatus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchStatus]);

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container narrow-measure">
          <p className="eyebrow">{isAr ? 'حالة النظام الحية' : 'Live diagnostics'}</p>
          <h1 className="page-display">{isAr ? 'حالة المنصة والجاهزية' : 'System status'}</h1>
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="vx-filter-chip is-active"
              onClick={() => {
                setLoading(true);
                void fetchStatus();
              }}
            >
              {isAr ? 'إعادة فحص الآن' : 'Run live re-check'}
              {latencyMs !== null ? ` · ${latencyMs} ms` : ''}
            </button>
          </div>
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
  const [searchParams] = useSearchParams();
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [audience, setAudience] = useState(() => searchParams.get('audience') === 'organization' ? 'organization' : 'interpreter');
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

              <Field label={isAr ? 'نبذة عن احتياج العمل' : 'Workflow notes'} htmlFor="contact-msg" required>
                <Textarea
                  id="contact-msg"
                  rows={4}
                  required
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
