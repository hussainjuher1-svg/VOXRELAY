import { type ReactNode, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useLocale } from '../context/hooks';
import { AssistantDock } from './AssistantSheet';
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
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const [internalPaletteOpen, setInternalPaletteOpen] = useState(false);
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(false);
  const isAr = locale === 'ar';

  const assistantOpen = controlledAssistantOpen ?? internalAssistantOpen;
  const setAssistantOpen = onAssistantOpenChange ?? setInternalAssistantOpen;

  const navItems = isAr
    ? [
        { to: '/how-it-works', label: 'آلية العمل' },
        { to: '/privacy', label: 'الخصوصية' },
      ]
    : [
        { to: '/how-it-works', label: 'How it works' },
        { to: '/privacy', label: 'Privacy' },
      ];

  return (
    <div className="public-shell">
      <a href="#main-content" className="skip-link">
        {isAr ? 'تخطي إلى المحتوى الرئيسي' : 'Skip to main content'}
      </a>

      <header className="pub-header">
        <div className="pub-header-inner">
          <div className="pub-header-left">
            <Link to="/" className="brand-wordmark-link" aria-label="VOXRELAY">
              <BrandWordmark size={22} />
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
          </div>

          <div className="pub-actions">
            <button
              type="button"
              className="hdr-lang-btn"
              onClick={() => setLocale(isAr ? 'en' : 'ar')}
              aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              {isAr ? 'English' : 'العربية'}
            </button>

            <Link to="/login" className="hdr-signin-link">
              {isAr ? 'تسجيل الدخول' : 'Sign in'}
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
          <Link to="/" className="pub-footer-wordmark">
            VOXRELAY
          </Link>

          <nav className="pub-footer-links" aria-label={isAr ? 'روابط التذييل' : 'Footer'}>
            <Link to="/privacy">{isAr ? 'ميثاق الخصوصية' : 'Privacy charter'}</Link>
            <Link to="/status">{isAr ? 'حالة النظام' : 'System status'}</Link>
            <Link to="/contact">{isAr ? 'الدعم' : 'Support'}</Link>
            <Link to="/design">{isAr ? 'نظام التصميم' : 'Design system'}</Link>
          </nav>
        </div>
      </footer>

      {!onOpenCommandPalette && (
        <CommandPalette
          open={internalPaletteOpen}
          onOpenChange={setInternalPaletteOpen}
          onOpenAssistant={() => setAssistantOpen(true)}
        />
      )}

      {assistantOpen && (
        <AssistantDock
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          externalPrompt={assistantPrompt}
          onClearExternalPrompt={onClearAssistantPrompt}
        />
      )}
    </div>
  );
}
