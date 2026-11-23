import { useState } from 'react';
import { useLocale, useTheme } from '../context/hooks';
import { BrandMark, BrandWordmark } from '../components/BrandLogo';
import {
  ChapterFollowupIllustration,
  ChapterPrepareIllustration,
  ChapterSessionIllustration,
  EmptyAssignmentsIllustration,
  EmptyTerminologyIllustration,
  HeroRelayIllustration,
  InterpretersIllustration,
  NotFoundIllustration,
  OrganizationsIllustration,
  PrivacyVaultIllustration,
} from '../components/EditorialIllustrations';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Badge } from '../components/ui/Primitives';
import { Select } from '../components/ui/Select';

const SWATCHES = [
  { name: 'Studio Warm Canvas', token: '--vr-paper', hex: '#FAF7F2', contrast: '15.8:1 vs Ink' },
  { name: 'Warm Linen Panel', token: '--vr-panel-warm', hex: '#F3EDE2', contrast: 'Card stage surface' },
  { name: 'Surface White', token: '--vr-card', hex: '#FFFFFF', contrast: 'Floating cards & forms' },
  { name: 'Espresso Ink', token: '--vr-ink', hex: '#1F1A17', contrast: 'Primary copy & display' },
  { name: 'Terracotta', token: '--vr-accent-brand', hex: '#B84A2E', contrast: '5.3:1 AA Primary CTA' },
  { name: 'Studio Gold', token: '--vr-gold', hex: '#C6922B', contrast: 'Warm accent & seal' },
  { name: 'Warm Hairline', token: '--vr-hairline', hex: '#E4DBCE', contrast: 'Structural rules' },
];

export function DesignSystemPage() {
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const isAr = locale === 'ar';
  const [sampleRole, setSampleRole] = useState('interpreter');
  const [pulsingLogo, setPulsingLogo] = useState(false);

  return (
    <div className="pub-page">
      <section className="page-header-band">
        <div className="pub-container">
          <div className="section-head-row">
            <div>
              <p className="eyebrow">{isAr ? 'مواصفات التصميم ٢.٠' : 'Design System v2.0'}</p>
              <h1 className="page-display">
                {isAr ? 'نظام التصميم Studio Warm لـ VOXRELAY' : 'VOXRELAY Studio Warm Design System'}
              </h1>
              <p className="editorial-prose">
                {isAr
                  ? 'خلفية ورقية دافئة (#FAF7F2) مع التراكوتا (#B84A2E) والذهب (#C6922B) وخطوط Instrument Serif و Instrument Sans و IBM Plex Sans Arabic.'
                  : 'Editorial Studio Warm palette (#FAF7F2, terracotta #B84A2E, gold #C6922B), Instrument Serif + Instrument Sans + IBM Plex Sans Arabic typography, hand-drawn underline, floating cards, and tilted language marquee.'}
              </p>
            </div>
            <div className="hero-cta-row">
              <Button variant="secondary" onClick={() => setLocale(isAr ? 'en' : 'ar')}>
                {isAr ? 'عرض بالإنجليزية (LTR)' : 'Preview Arabic (RTL)'}
              </Button>
              <Button variant="secondary" onClick={toggleTheme}>
                {theme === 'dark' ? (isAr ? 'الوضع النهاري' : 'Light canvas') : isAr ? 'الوضع الليلي' : 'Dark canvas'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Brand Logo & Assistant State */}
      <section className="band-vellum">
        <div className="pub-container">
          <p className="eyebrow">{isAr ? 'الشعار الأصلي' : '01 · Brand Mark & States'}</p>
          <div className="ds-logo-grid">
            <div className="editorial-card">
              <BrandWordmark size={34} />
              <p className="editorial-prose">
                {isAr
                  ? 'قوسا تواصل بشري يربط بينهما محور ارتكاز ثابت بلون الأخضر النهري.'
                  : 'Opposing acoustic relay arches bridged across a steady human checkpoint node.'}
              </p>
            </div>
            <div className="editorial-card">
              <div className="ds-mark-row">
                <BrandMark size={20} pulsing={pulsingLogo} />
                <BrandMark size={32} pulsing={pulsingLogo} />
                <BrandMark size={48} pulsing={pulsingLogo} />
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPulsingLogo((p) => !p)}>
                {pulsingLogo
                  ? isAr
                    ? 'إيقاف نبض المساعد'
                    : 'Stop assistant pulse'
                  : isAr
                    ? 'تجربة نبض المساعد'
                    : 'Preview assistant pulse'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Color Palette */}
      <section className="band-paper">
        <div className="pub-container">
          <p className="eyebrow">{isAr ? 'الألوان والتباين' : '02 · Palette & AA Contrast'}</p>
          <div className="ds-swatch-grid">
            {SWATCHES.map((s) => (
              <div key={s.token} className="ds-swatch-card">
                <div className="ds-swatch-chip" style={{ backgroundColor: s.hex }} />
                <div className="ds-swatch-meta">
                  <strong>{s.name}</strong>
                  <code>{s.hex}</code>
                  <span>{s.contrast}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Typography & Controls */}
      <section className="band-vellum">
        <div className="pub-container ds-two-col">
          <div className="editorial-card">
            <p className="eyebrow">{isAr ? 'الطباعة' : '03 · Typography'}</p>
            <h2 className="section-display">
              {isAr ? 'Instrument Serif + Instrument Sans + IBM Plex Sans Arabic' : 'Instrument Serif + Instrument Sans'}
            </h2>
            <p className="editorial-prose">
              {isAr
                ? 'عناوين تحريرية دافئة مع نصوص واضحة وأرقام جدولية للأوقات والمواعيد.'
                : 'Expressive editorial Instrument Serif display headlines paired with crisp Instrument Sans UI copy and tabular numerals for session times.'}
            </p>
            <span className="vr-tabular-time">14:30–15:15 · VR-0042</span>
          </div>

          <div className="editorial-card">
            <p className="eyebrow">{isAr ? 'العناصر التفاعلية' : '04 · Controls'}</p>
            <div className="ds-controls-stack">
              <div className="hero-cta-row">
                <Button variant="primary">{isAr ? 'إجراء رئيسي' : 'Primary action'}</Button>
                <Button variant="secondary">{isAr ? 'إجراء ثانوي' : 'Secondary'}</Button>
                <Badge tone="teal">T3 Human</Badge>
                <Badge tone="amber">Verified</Badge>
              </div>
              <Field label={isAr ? 'قائمة Radix المخصصة' : 'Radix Select'} htmlFor="ds-select">
                <Select
                  id="ds-select"
                  value={sampleRole}
                  onValueChange={setSampleRole}
                  options={[
                    { value: 'interpreter', label: isAr ? 'مترجم مستقل' : 'Independent interpreter' },
                    { value: 'org_admin', label: isAr ? 'منسق مؤسسة' : 'Organization admin' },
                  ]}
                />
              </Field>
              <Field label={isAr ? 'حقل نصي' : 'Text input'} htmlFor="ds-input">
                <Input id="ds-input" placeholder={isAr ? 'أدخل المرجع...' : 'Enter assignment reference...'} />
              </Field>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Hand-Inked Spot Illustrations */}
      <section className="band-paper">
        <div className="pub-container">
          <p className="eyebrow">{isAr ? 'الرسوم التوضيحية الأصلية' : '05 · Spot Illustration System'}</p>
          <div className="ds-ill-grid">
            <div className="ds-ill-card">
              <HeroRelayIllustration />
              <span>Hero Relay</span>
            </div>
            <div className="ds-ill-card">
              <ChapterPrepareIllustration />
              <span>Prepare</span>
            </div>
            <div className="ds-ill-card">
              <ChapterSessionIllustration />
              <span>Session</span>
            </div>
            <div className="ds-ill-card">
              <ChapterFollowupIllustration />
              <span>Follow-up</span>
            </div>
            <div className="ds-ill-card">
              <PrivacyVaultIllustration />
              <span>Privacy Vault</span>
            </div>
            <div className="ds-ill-card">
              <InterpretersIllustration />
              <span>Interpreters</span>
            </div>
            <div className="ds-ill-card">
              <OrganizationsIllustration />
              <span>Organizations</span>
            </div>
            <div className="ds-ill-card">
              <EmptyAssignmentsIllustration />
              <span>Empty Ledger</span>
            </div>
            <div className="ds-ill-card">
              <EmptyTerminologyIllustration />
              <span>Empty Glossary</span>
            </div>
            <div className="ds-ill-card">
              <NotFoundIllustration />
              <span>404 Bookmark</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
