import { type ReactNode, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth, useLocale, useTheme } from '../context/hooks';
import { AssistantDock, AssistantTrigger } from './AssistantSheet';
import { BrandWordmark } from './BrandLogo';
import { CommandPalette } from './ui/CommandPalette';

export function AppShell({
  children,
  focusMode = false,
  onOpenCommandPalette,
  assistantOpen: controlledAssistantOpen,
  onAssistantOpenChange,
}: {
  children: ReactNode;
  focusMode?: boolean;
  onOpenCommandPalette?: () => void;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (next: boolean) => void;
}) {
  const { user, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [internalPaletteOpen, setInternalPaletteOpen] = useState(false);
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isAr = locale === 'ar';

  const assistantOpen = controlledAssistantOpen ?? internalAssistantOpen;
  const setAssistantOpen = onAssistantOpenChange ?? setInternalAssistantOpen;
  const openPalette = onOpenCommandPalette ?? (() => setInternalPaletteOpen(true));
  const userRole =
    (user && 'role' in user && user.role) ||
    (user && 'user_metadata' in user && typeof user.user_metadata?.role === 'string'
      ? user.user_metadata.role
      : '') ||
    'interpreter';

  if (focusMode) {
    return (
      <div className="app-focus-shell">
        {children}
        <AssistantDock
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          returnFocusToRef={assistantTriggerRef}
        />
      </div>
    );
  }

  const navLinks = isAr
    ? [
        { to: '/app', label: 'نظرة عامة', end: true },
        { to: '/app/ops', label: 'لوحة العمليات' },
        { to: '/app/assignments', label: 'المواعيد' },
        { to: '/app/availability', label: 'التوفر' },
        { to: '/app/terminology', label: 'المصطلحات' },
        { to: '/app/device-check', label: 'فحص الصوت' },
        { to: '/app/billing', label: 'الفوترة' },
        { to: '/app/reports', label: 'التقارير' },
        { to: '/app/quality', label: 'الجودة' },
        { to: '/app/support', label: 'الدعم البشري' },
        { to: '/app/admin', label: 'مراجعة الطلبات' },
        { to: '/app/settings', label: 'الإعدادات' },
      ]
    : [
        { to: '/app', label: 'Overview', end: true },
        { to: '/app/ops', label: 'Ops queues' },
        { to: '/app/assignments', label: 'Assignments' },
        { to: '/app/availability', label: 'Availability' },
        { to: '/app/terminology', label: 'Terminology' },
        { to: '/app/device-check', label: 'Device check' },
        { to: '/app/billing', label: 'Billing' },
        { to: '/app/reports', label: 'Reports' },
        { to: '/app/quality', label: 'Quality' },
        { to: '/app/support', label: 'Support' },
        { to: '/app/admin', label: 'Access queue' },
        { to: '/app/settings', label: 'Settings' },
      ];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-top">
          <Link to="/" className="brand-wordmark-link" aria-label="VOXRELAY Home">
            <BrandWordmark size={24} />
          </Link>
        </div>

        <nav className="app-nav" aria-label={isAr ? 'مساحة العمل' : 'Workspace navigation'}>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-policy-card">
          <div className="sidebar-policy-title">
            <span className="status-dot is-ok" aria-hidden="true" />
            <span>{isAr ? 'سياسة T3 البشرية' : 'T3 Human-Only Policy'}</span>
          </div>
          <p>
            {isAr
              ? 'لا تسجيل صوتي. تحليل التوقيت فقط في ملفات .ics.'
              : 'Zero audio storage. Timing-only .ics intake active.'}
          </p>
        </div>

        <div className="app-sidebar-footer">
          <AssistantTrigger
            variant="sidebar"
            open={assistantOpen}
            onToggle={() => setAssistantOpen(!assistantOpen)}
            buttonRef={assistantTriggerRef}
          />
          <div className="app-user-meta">
            <strong>{user?.email || (isAr ? 'جلسة ضيف' : 'Guest view')}</strong>
            <span>{userRole}</span>
          </div>
          <div className="app-util-row">
            <button type="button" className="hdr-util-btn" onClick={openPalette}>
              ⌘K
            </button>
            <button
              type="button"
              className="hdr-util-btn"
              onClick={() => setLocale(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'AR'}
            </button>
            <button type="button" className="hdr-util-btn" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
          {user && (
            <button
              type="button"
              className="app-signout-btn"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              {isAr ? 'تسجيل الخروج' : 'Sign out'}
            </button>
          )}
        </div>
      </aside>

      <main id="main-content" className="app-main">
        {children}
      </main>

      {!onOpenCommandPalette && (
        <CommandPalette
          open={internalPaletteOpen}
          onOpenChange={setInternalPaletteOpen}
          onOpenAssistant={() => setAssistantOpen(true)}
        />
      )}

      <AssistantDock
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        returnFocusToRef={assistantTriggerRef}
      />
    </div>
  );
}
