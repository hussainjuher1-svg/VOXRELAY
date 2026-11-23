import { type ReactNode, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useLocale, useTheme } from '../context/hooks';
import { AssistantDock, AssistantTrigger } from './AssistantSheet';
import { BrandWordmark } from './BrandLogo';
import { CommandPalette } from './ui/CommandPalette';

export function PublicShell({
  children,
  onOpenCommandPalette,
  assistantOpen: controlledAssistantOpen,
  onAssistantOpenChange,
  assistantPrompt,
  onClearAssistantPrompt,
}: {
  children: ReactNode;
  onOpenCommandPalette?: () => void;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (next: boolean) => void;
  assistantPrompt?: string | null;
  onClearAssistantPrompt?: () => void;
}) {
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const [internalPaletteOpen, setInternalPaletteOpen] = useState(false);
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isAr = locale === 'ar';

  const assistantOpen = controlledAssistantOpen ?? internalAssistantOpen;
  const setAssistantOpen = onAssistantOpenChange ?? setInternalAssistantOpen;
  const openPalette = onOpenCommandPalette ?? (() => setInternalPaletteOpen(true));

  const navItems = isAr
    ? [
        { to: '/how-it-works', label: 'آلية العمل' },
        { to: '/interpreters', label: 'للمترجمين' },
        { to: '/organizations', label: 'للمؤسسات' },
        { to: '/privacy', label: 'الخصوصية' },
        { to: '/faq', label: 'الأسئلة' },
      ]
    : [
        { to: '/how-it-works', label: 'Workflow' },
        { to: '/interpreters', label: 'Interpreters' },
        { to: '/organizations', label: 'Organizations' },
        { to: '/privacy', label: 'Privacy' },
        { to: '/faq', label: 'FAQ' },
      ];

  return (
    <div className="public-shell">
      <a href="#main-content" className="skip-link">
        {isAr ? 'تخطي إلى المحتوى الرئيسي' : 'Skip to main content'}
      </a>

      <header className="pub-header">
        <div className="pub-header-inner">
          <Link to="/" className="brand-wordmark-link" aria-label="VOXRELAY">
            <BrandWordmark size={24} />
          </Link>

          <nav className="pub-nav" aria-label={isAr ? 'التنقل الرئيسي' : 'Primary'}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `pub-nav-link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="pub-actions">
            <AssistantTrigger
              open={assistantOpen}
              onToggle={() => setAssistantOpen(!assistantOpen)}
              buttonRef={assistantTriggerRef}
            />

            <button
              type="button"
              className="hdr-ghost-btn"
              onClick={() => setLocale(isAr ? 'en' : 'ar')}
              aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              {isAr ? 'EN' : 'العربية'}
            </button>

            <button
              type="button"
              className="hdr-icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <Link to="/login" className="hdr-signin-link">
              {isAr ? 'دخول' : 'Sign in'}
            </Link>
            <Link to="/contact" className="hdr-cta-btn">
              {isAr ? 'طلب الوصول' : 'Request access'}
            </Link>

            <button
              type="button"
              className="mobile-menu-btn"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? 'mobile-nav-drawer' : undefined}
              onClick={() => setMenuPath((prev) => (prev === pathname ? null : pathname))}
            >
              {menuOpen ? (isAr ? 'إغلاق' : 'Close') : isAr ? 'القائمة' : 'Menu'}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-nav-drawer" className="mobile-nav-sheet">
            <nav aria-label={isAr ? 'قائمة الجوال' : 'Mobile navigation'}>
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} className="mobile-nav-item">
                  {item.label}
                </Link>
              ))}
              <Link to="/status" className="mobile-nav-item">
                {isAr ? 'حالة النظام' : 'System status'}
              </Link>
              <Link to="/design" className="mobile-nav-item">
                {isAr ? 'نظام التصميم' : 'Design system'}
              </Link>
              <button
                type="button"
                className="mobile-nav-item"
                style={{ textAlign: 'start', background: 'transparent', borderInline: 0, borderTop: 0 }}
                onClick={openPalette}
              >
                {isAr ? 'لوحة الأوامر (Cmd+K)' : 'Command palette (Cmd+K)'}
              </button>
              <Link to="/login" className="mobile-nav-item">
                {isAr ? 'تسجيل الدخول' : 'Sign in'}
              </Link>
              <Link to="/contact" className="mobile-nav-cta">
                {isAr ? 'طلب الوصول' : 'Request access'}
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main id="main-content" className="pub-main">
        {children}
      </main>

      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-brand">
            <BrandWordmark size={26} />
            <p>
              {isAr
                ? 'مساحة عمل تشغيلية للمترجمين الفوريين عن بُعد بقيادة بشرية — دون تسجيل صوتي ودون تفريغ نصي.'
                : 'Operational workspace for remote medical and community interpreting — built without audio recording, live translation, or patient identity storage.'}
            </p>
          </div>

          <div className="pub-footer-cols">
            <div>
              <h3>{isAr ? 'المنصة' : 'Platform'}</h3>
              <Link to="/how-it-works">{isAr ? 'آلية العمل' : 'Workflow'}</Link>
              <Link to="/interpreters">{isAr ? 'للمترجمين' : 'Interpreters'}</Link>
              <Link to="/organizations">{isAr ? 'للمؤسسات' : 'Organizations'}</Link>
            </div>
            <div>
              <h3>{isAr ? 'الحوكمة' : 'Governance'}</h3>
              <Link to="/privacy">{isAr ? 'ميثاق الخصوصية' : 'Privacy Charter'}</Link>
              <Link to="/status">{isAr ? 'حالة النظام' : 'System Status'}</Link>
              <Link to="/faq">{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</Link>
            </div>
            <div>
              <h3>{isAr ? 'الوصول' : 'Access'}</h3>
              <Link to="/contact">{isAr ? 'طلب الوصول' : 'Request access'}</Link>
              <Link to="/login">{isAr ? 'تسجيل الدخول' : 'Sign in'}</Link>
              <Link to="/design">{isAr ? 'نظام التصميم' : 'Design system'}</Link>
            </div>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>© 2026 VOXRELAY</span>
          <span>
            {isAr
              ? 'حد العمل البشري الحصري (T3) · عربي / إنجليزي'
              : 'Human-led T3 workflow boundary · English & Arabic RTL'}
          </span>
        </div>
      </footer>

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
        externalPrompt={assistantPrompt}
        onClearExternalPrompt={onClearAssistantPrompt}
        returnFocusToRef={assistantTriggerRef}
      />
    </div>
  );
}
