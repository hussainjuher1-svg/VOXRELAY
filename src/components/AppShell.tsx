import { type ReactNode, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Headset,
  LayoutDashboard,
  Menu,
  Mic,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth, useLocale, useTheme } from '../context/hooks';
import { AssistantDock, AssistantTrigger } from './AssistantSheet';
import { BrandWordmark } from './BrandLogo';
import { CommandPalette } from './ui/CommandPalette';
import '../workspace.css';

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
  const { locale, toggleLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [internalPaletteOpen, setInternalPaletteOpen] = useState(false);
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const assistantTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isAr = locale === 'ar';
  const isBn = locale === 'bn';

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

  const navGroups = isAr
    ? [
        {
          heading: 'العمل اليومي',
          items: [
            { to: '/app', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
            { to: '/app/ops', label: 'لوحة العمليات', icon: Activity },
            { to: '/app/assignments', label: 'المواعيد', icon: CalendarDays },
            { to: '/app/availability', label: 'التوفر', icon: CalendarClock },
          ],
        },
        {
          heading: 'التحضير والصوت',
          items: [
            { to: '/app/terminology', label: 'المصطلحات', icon: BookOpen },
            { to: '/app/device-check', label: 'فحص الصوت', icon: Mic },
          ],
        },
        {
          heading: 'الفوترة والحوكمة',
          items: [
            { to: '/app/billing', label: 'الفوترة', icon: CreditCard },
            { to: '/app/reports', label: 'التقارير', icon: BarChart3 },
            { to: '/app/quality', label: 'الجودة', icon: CheckCircle2 },
            { to: '/app/support', label: 'الدعم البشري', icon: Headset },
            { to: '/app/admin', label: 'مراجعة الطلبات', icon: ShieldCheck },
            { to: '/app/settings', label: 'الإعدادات', icon: Settings },
          ],
        },
      ]
    : isBn
      ? [
          {
            heading: 'কর্মপ্রবাহ',
            items: [
              { to: '/app', label: 'সংক্ষিপ্তসার', icon: LayoutDashboard, end: true },
              { to: '/app/ops', label: 'অপারেশন কিউ', icon: Activity },
              { to: '/app/assignments', label: 'দায়িত্বসমূহ', icon: CalendarDays },
              { to: '/app/availability', label: 'প্রাপ্যতা', icon: CalendarClock },
            ],
          },
          {
            heading: 'প্রস্তুতি ও অডিও',
            items: [
              { to: '/app/terminology', label: 'পরিভাষা', icon: BookOpen },
              { to: '/app/device-check', label: 'ডিভাইস পরীক্ষা', icon: Mic },
            ],
          },
          {
            heading: 'বিলিং ও সহায়তা',
            items: [
              { to: '/app/billing', label: 'বিলিং', icon: CreditCard },
              { to: '/app/reports', label: 'প্রতিবেদন', icon: BarChart3 },
              { to: '/app/quality', label: 'মান যাচাই', icon: CheckCircle2 },
              { to: '/app/support', label: 'মানব সহায়তা', icon: Headset },
              { to: '/app/admin', label: 'প্রবেশাধিকার কিউ', icon: ShieldCheck },
              { to: '/app/settings', label: 'সেটিংস', icon: Settings },
            ],
          },
        ]
      : [
          {
            heading: 'Workflow',
            items: [
              { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
              { to: '/app/ops', label: 'Ops queues', icon: Activity },
              { to: '/app/assignments', label: 'Assignments', icon: CalendarDays },
              { to: '/app/availability', label: 'Availability', icon: CalendarClock },
            ],
          },
          {
            heading: 'Prep & Audio',
            items: [
              { to: '/app/terminology', label: 'Terminology', icon: BookOpen },
              { to: '/app/device-check', label: 'Device check', icon: Mic },
            ],
          },
          {
            heading: 'Billing & Ops',
            items: [
              { to: '/app/billing', label: 'Billing', icon: CreditCard },
              { to: '/app/reports', label: 'Reports', icon: BarChart3 },
              { to: '/app/quality', label: 'Quality', icon: CheckCircle2 },
              { to: '/app/support', label: 'Support', icon: Headset },
              { to: '/app/admin', label: 'Access queue', icon: ShieldCheck },
              { to: '/app/settings', label: 'Settings', icon: Settings },
            ],
          },
        ];

  const allItems = navGroups.flatMap((g) => g.items);
  const currentNav =
    allItems.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))) || allItems[0];

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-left">
          <button
            type="button"
            className="app-menu-btn"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Close workspace menu' : 'Open workspace menu'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Link to="/" className="brand-wordmark-link" aria-label="VOXRELAY Home">
            <BrandWordmark size={20} />
          </Link>
          <span className="app-topbar-crumb">{currentNav?.label}</span>
        </div>

        <div className="app-topbar-right">
          <button type="button" className="hdr-util-btn" onClick={openPalette} aria-label="Command palette">
            ⌘K
          </button>
          <button
            type="button"
            className="app-topbar-assistant-btn"
            onClick={() => setAssistantOpen(!assistantOpen)}
          >
            <span className="vox-border-beam-glow vox-border-beam-glow--pill vox-border-beam-glow--always" aria-hidden="true" />
            <span className="vox-border-beam vox-border-beam--pill vox-border-beam--always" aria-hidden="true" />
            <span>{isAr ? 'المساعد' : 'Assistant'}</span>
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div
          className="app-drawer-backdrop"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`app-sidebar${drawerOpen ? ' is-open' : ''}`}>
        <div className="app-sidebar-top">
          <Link to="/" className="brand-wordmark-link" aria-label="VOXRELAY Home">
            <BrandWordmark size={24} />
          </Link>
          <button
            type="button"
            className="app-sidebar-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="app-nav" aria-label={isAr ? 'مساحة العمل' : 'Workspace navigation'}>
          {navGroups.map((group) => (
            <div key={group.heading} className="app-nav-group">
              <span className="app-nav-heading">{group.heading}</span>
              {group.items.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{link.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-policy-card">
          <div className="sidebar-policy-title">
            <span className="status-dot is-ok" aria-hidden="true" />
            <span>{isAr ? 'سياسة T3 البشرية' : isBn ? 'T3 মানব-নেতৃত্ব নীতি' : 'T3 Human-Only Policy'}</span>
          </div>
          <p>
            {isAr
              ? 'لا تسجيل صوتي. تحليل التوقيت فقط في ملفات .ics.'
              : isBn
                ? 'কোনো অডিও সংরক্ষণ নয়। .ics থেকে কেবল সময় পড়া হয়।'
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
            <strong>{user?.email || (isAr ? 'جلسة ضيف' : isBn ? 'অতিথি ভিউ' : 'Guest view')}</strong>
            <span>{userRole}</span>
          </div>
          <div className="app-util-row">
            <button type="button" className="hdr-util-btn" onClick={openPalette}>
              ⌘K
            </button>
            <button
              type="button"
              className="hdr-util-btn"
              onClick={toggleLocale}
              title="Switch language (EN / BN / AR)"
            >
              {locale.toUpperCase()}
            </button>
            <button type="button" className="hdr-util-btn" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
          {user ? (
            <button
              type="button"
              className="app-signout-btn"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              {isAr ? 'تسجيل الخروج' : isBn ? 'সাইন আউট' : 'Sign out'}
            </button>
          ) : (
            <Link to="/login?mode=signup" className="app-signout-btn" style={{ textAlign: 'center' }}>
              {isAr ? 'تسجيل الدخول / إنشاء حساب' : isBn ? 'সাইন ইন / অ্যাকাউন্ট' : 'Sign in / Create account'}
            </Link>
          )}
        </div>
      </aside>

      <div className="app-main-wrap">
        <nav className="app-mobile-ribbon" aria-label={isAr ? 'تنقل سريع' : 'Quick workspace links'}>
          {allItems.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `app-ribbon-pill${isActive ? ' is-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <main id="main-content" className="app-main">
          {children}
        </main>
      </div>

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
