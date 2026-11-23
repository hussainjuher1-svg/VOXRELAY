import type { ReactNode } from 'react';

function IllustrationFrame({
  viewBox = '0 0 280 200',
  filterId,
  className = '',
  children,
}: {
  viewBox?: string;
  filterId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      aria-hidden="true"
      className={`vr-spot-svg${className ? ` ${className}` : ''}`}
    >
      <defs>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.25" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>{children}</g>
    </svg>
  );
}

/** Hero editorial scene: dual acoustic relay arches over calm open folios */
export function HeroRelayIllustration() {
  return (
    <IllustrationFrame
      viewBox="0 0 360 250"
      filterId="vr-wobble-hero"
      className="vr-hero-breathing"
    >
      {/* Muted editorial paper ground blocks */}
      <rect x="26" y="42" width="136" height="162" rx="10" fill="var(--vr-oat)" />
      <rect x="198" y="42" width="136" height="162" rx="10" fill="var(--vr-vellum)" />
      <path d="M162 123H198" stroke="var(--vr-accent)" strokeWidth="2.2" strokeLinecap="round" />

      {/* Left folio ruled lines */}
      <path
        d="M46 76H134M46 98H126M46 120H142M46 142H112M46 164H128"
        stroke="var(--vr-ink)"
        strokeOpacity="0.72"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="46" y="176" width="44" height="12" rx="6" fill="var(--vr-ill-teal)" fillOpacity="0.28" />

      {/* Right folio glossary / readiness marks */}
      <circle cx="232" cy="84" r="14" fill="var(--vr-ill-ochre)" fillOpacity="0.28" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <path d="M226 84L230 88L239 79" stroke="var(--vr-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M256 79H314M256 92H302M220 122H314M220 144H296M220 166H308"
        stroke="var(--vr-ink)"
        strokeOpacity="0.72"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* Relay bridge arcs — calm human connection */}
      <path
        d="M116 42C136 12 224 12 244 42"
        stroke="var(--vr-secondary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <path
        d="M108 204C138 232 222 232 252 204"
        stroke="var(--vr-ink)"
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="180" cy="123" r="15" fill="var(--vr-paper)" stroke="var(--vr-secondary)" strokeWidth="2" />
      <circle cx="180" cy="123" r="5" fill="var(--vr-accent)" />

      {/* Outer ink frame lines */}
      <rect x="26" y="42" width="136" height="162" rx="10" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <rect x="198" y="42" width="136" height="162" rx="10" stroke="var(--vr-ink)" strokeWidth="1.45" />
    </IllustrationFrame>
  );
}

/** Chapter 01: Prepare — checklist & timing calendar */
export function ChapterPrepareIllustration() {
  return (
    <IllustrationFrame filterId="vr-wobble-prep">
      <rect x="44" y="28" width="192" height="144" rx="12" fill="var(--vr-vellum)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <path d="M44 62H236" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <circle cx="74" cy="45" r="5" fill="var(--vr-ill-ochre)" />
      <path d="M92 45H172" stroke="var(--vr-ink)" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="68" y="82" width="18" height="18" rx="4" fill="var(--vr-ill-teal)" fillOpacity="0.25" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <path d="M72 91L76 95L83 87" stroke="var(--vr-ink)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M100 91H208" stroke="var(--vr-ink)" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="68" y="114" width="18" height="18" rx="4" fill="var(--vr-paper)" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <path d="M100 123H192" stroke="var(--vr-ink)" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="68" y="144" width="64" height="10" rx="5" fill="var(--vr-ill-sage)" fillOpacity="0.45" />
    </IllustrationFrame>
  );
}

/** Chapter 02: Session — calm focus desk & unrecorded microphone cadence */
export function ChapterSessionIllustration() {
  return (
    <IllustrationFrame filterId="vr-wobble-session">
      <circle cx="140" cy="100" r="64" fill="var(--vr-oat)" />
      <path
        d="M58 100C78 72 104 72 122 100C138 126 154 126 172 100C188 78 206 78 222 100"
        stroke="var(--vr-secondary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="116" y="76" width="48" height="48" rx="24" fill="var(--vr-paper)" stroke="var(--vr-ink)" strokeWidth="1.5" />
      <circle cx="140" cy="100" r="8" fill="var(--vr-accent)" />
      <path d="M72 154H208" stroke="var(--vr-ink)" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M110 170H170" stroke="var(--vr-ink)" strokeOpacity="0.55" strokeWidth="1.35" strokeLinecap="round" />
    </IllustrationFrame>
  );
}

/** Chapter 03: Follow-up — structured ledger without patient identifiers */
export function ChapterFollowupIllustration() {
  return (
    <IllustrationFrame filterId="vr-wobble-follow">
      <rect x="52" y="34" width="150" height="132" rx="8" fill="var(--vr-vellum)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <rect x="78" y="48" width="150" height="122" rx="8" fill="var(--vr-paper)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <path d="M100 80H202M100 104H188M100 128H172" stroke="var(--vr-ink)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="192" cy="134" r="18" fill="var(--vr-ill-sage)" fillOpacity="0.38" stroke="var(--vr-ink)" strokeWidth="1.4" />
      <path d="M185 134L190 139L200 129" stroke="var(--vr-ink)" strokeWidth="1.5" strokeLinecap="round" />
    </IllustrationFrame>
  );
}

/** Privacy: Shielded ledger, zero audio capture */
export function PrivacyVaultIllustration() {
  return (
    <IllustrationFrame filterId="vr-wobble-privacy">
      <path
        d="M140 24L214 52V104C214 146 181 174 140 186C99 174 66 146 66 104V52L140 24Z"
        fill="var(--vr-oat)"
        stroke="var(--vr-ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M140 44L194 64V102C194 134 170 156 140 166C110 156 86 134 86 102V64L140 44Z"
        fill="var(--vr-paper)"
        stroke="var(--vr-secondary)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M114 102H166" stroke="var(--vr-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="140" cy="102" r="14" fill="var(--vr-ill-teal)" fillOpacity="0.24" stroke="var(--vr-ink)" strokeWidth="1.4" />
      <circle cx="140" cy="102" r="4" fill="var(--vr-accent)" />
    </IllustrationFrame>
  );
}

/** Interpreters: Bilingual glossary index cards */
export function InterpretersIllustration() {
  return (
    <IllustrationFrame filterId="vr-wobble-interp">
      <rect x="38" y="42" width="124" height="116" rx="10" fill="var(--vr-oat)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <rect x="118" y="54" width="124" height="116" rx="10" fill="var(--vr-paper)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <path d="M58 78H102M58 100H96M140 88H218M140 112H206M140 136H190" stroke="var(--vr-ink)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="164" cy="142" r="9" fill="var(--vr-ill-ochre)" fillOpacity="0.4" />
    </IllustrationFrame>
  );
}

/** Organizations: Coordinating team relay ledger */
export function OrganizationsIllustration() {
  return (
    <IllustrationFrame filterId="vr-wobble-orgs">
      <rect x="34" y="34" width="212" height="132" rx="10" fill="var(--vr-vellum)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <path d="M34 74H246M34 114H246M118 34V166" stroke="var(--vr-ink)" strokeOpacity="0.65" strokeWidth="1.35" />
      <circle cx="76" cy="54" r="7" fill="var(--vr-secondary)" />
      <circle cx="76" cy="94" r="7" fill="var(--vr-accent)" />
      <circle cx="76" cy="140" r="7" fill="var(--vr-ill-sage)" />
      <path d="M138 54H218M138 94H204M138 140H224" stroke="var(--vr-ink)" strokeWidth="1.45" strokeLinecap="round" />
    </IllustrationFrame>
  );
}

/** Empty state: Assignments */
export function EmptyAssignmentsIllustration() {
  return (
    <IllustrationFrame viewBox="0 0 180 120" filterId="vr-wobble-empty-a">
      <rect x="28" y="18" width="124" height="84" rx="10" fill="var(--vr-vellum)" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <path d="M28 42H152" stroke="var(--vr-ink)" strokeWidth="1.25" />
      <circle cx="48" cy="30" r="4" fill="var(--vr-secondary)" />
      <path d="M62 30H120" stroke="var(--vr-ink)" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M48 64H132M48 80H104" stroke="var(--vr-ink)" strokeOpacity="0.4" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="4 4" />
    </IllustrationFrame>
  );
}

/** Empty state: Terminology */
export function EmptyTerminologyIllustration() {
  return (
    <IllustrationFrame viewBox="0 0 180 120" filterId="vr-wobble-empty-t">
      <rect x="24" y="24" width="84" height="68" rx="8" fill="var(--vr-oat)" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <rect x="72" y="34" width="84" height="68" rx="8" fill="var(--vr-paper)" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <path d="M90 58H136M90 74H126" stroke="var(--vr-ink)" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="136" cy="84" r="6" fill="var(--vr-accent)" fillOpacity="0.45" />
    </IllustrationFrame>
  );
}

/** 404: Misplaced folio bookmark */
export function NotFoundIllustration() {
  return (
    <IllustrationFrame viewBox="0 0 220 150" filterId="vr-wobble-404">
      <rect x="44" y="20" width="132" height="110" rx="10" fill="var(--vr-vellum)" stroke="var(--vr-ink)" strokeWidth="1.45" />
      <path d="M132 20V74L144 64L156 74V20" fill="var(--vr-accent)" fillOpacity="0.35" stroke="var(--vr-ink)" strokeWidth="1.35" />
      <path d="M66 62H112M66 84H148M66 104H126" stroke="var(--vr-ink)" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
    </IllustrationFrame>
  );
}
