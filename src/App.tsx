import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PublicShell } from './components/PublicShell';
import { CommandPalette } from './components/ui/CommandPalette';
import { AuthProvider } from './context/AuthContext';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';
import './workspace.css';
import {
  ContactPage,
  FaqPage,
  HomePage,
  HowItWorksPage,
  InterpretersPage,
  NotFoundPage,
  OrganizationsPage,
  PrivacyPage,
  StatusPage,
} from './pages/Public';

const DesignSystemPage = lazy(() => import('./pages/DesignSystem').then((m) => ({ default: m.DesignSystemPage })));
const LoginPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.LoginPage })));
const ResetPasswordPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ResetPasswordPage })));
const OverviewPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.OverviewPage })));
const OpsDashboardPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.OpsDashboardPage })));
const AssignmentsPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.AssignmentsPage })));
const AvailabilityPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.AvailabilityPage })));
const SessionFocusPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.SessionFocusPage })));
const TerminologyPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.TerminologyPage })));
const DeviceCheckPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.DeviceCheckPage })));
const BillingPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.BillingPage })));
const ReportsPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.ReportsPage })));
const QualityPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.QualityPage })));
const OrganizationPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.OrganizationPage })));
const OnboardingPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.OnboardingPage })));
const SettingsPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.SettingsPage })));
const RecordsAssistantPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.RecordsAssistantPage })));
const SupportPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.SupportPage })));
const AdminReviewPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.AdminReviewPage })));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="pub-container" style={{ paddingBlock: '64px', maxWidth: '540px' }}>
          <div className="subpage-card">
            <span className="eyebrow">APPLICATION ERROR</span>
            <h1 style={{ marginTop: '8px' }}>Something went wrong</h1>
            <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>
              An unexpected error interrupted this screen. Your workspace data remains saved.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
              <a className="btn-ghost" href="/">
                Back to home
              </a>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function RouteFallback() {
  return (
    <main className="pub-container" style={{ paddingBlock: '64px' }}>
      <p className="eyebrow">Loading...</p>
    </main>
  );
}

export function AppRoutes() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState<string | null>(null);

  const openAssistantWith = (q?: string) => {
    if (q) setAssistantPrompt(q);
    setAssistantOpen(true);
  };

  const wrapPublic = (node: ReactNode) => (
    <PublicShell
      onOpenCommandPalette={() => setPaletteOpen(true)}
      assistantOpen={assistantOpen}
      onAssistantOpenChange={setAssistantOpen}
      assistantPrompt={assistantPrompt}
      onClearAssistantPrompt={() => setAssistantPrompt(null)}
    >
      {node}
    </PublicShell>
  );

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenAssistant={() => setAssistantOpen(true)}
      />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={wrapPublic(<HomePage />)} />
          <Route path="/how-it-works" element={wrapPublic(<HowItWorksPage />)} />
          <Route path="/interpreters" element={wrapPublic(<InterpretersPage />)} />
          <Route path="/organizations" element={wrapPublic(<OrganizationsPage />)} />
          <Route path="/privacy" element={wrapPublic(<PrivacyPage />)} />
          <Route path="/about" element={wrapPublic(<HowItWorksPage />)} />
          <Route path="/faq" element={wrapPublic(<FaqPage onOpenAssistant={openAssistantWith} />)} />
          <Route path="/contact" element={wrapPublic(<ContactPage />)} />
          <Route path="/status" element={wrapPublic(<StatusPage />)} />
          <Route path="/design" element={wrapPublic(<DesignSystemPage />)} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          <Route path="/app" element={<OverviewPage />} />
          <Route path="/app/ops" element={<OpsDashboardPage />} />
          <Route path="/app/assignments" element={<AssignmentsPage />} />
          <Route path="/app/assignments/:id" element={<AssignmentsPage />} />
          <Route path="/app/assignments/:id/close" element={<SessionFocusPage />} />
          <Route path="/app/session/:id" element={<SessionFocusPage />} />
          <Route path="/app/availability" element={<AvailabilityPage />} />
          <Route path="/app/terminology" element={<TerminologyPage />} />
          <Route path="/app/device-check" element={<DeviceCheckPage />} />
          <Route path="/app/billing" element={<BillingPage />} />
          <Route path="/app/assistant" element={<RecordsAssistantPage />} />
          <Route path="/app/support" element={<SupportPage />} />
          <Route path="/app/admin" element={<AdminReviewPage />} />
          <Route path="/app/reports" element={<ReportsPage />} />
          <Route path="/app/quality" element={<QualityPage />} />
          <Route path="/app/organization" element={<OrganizationPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
          <Route path="*" element={wrapPublic(<NotFoundPage />)} />
        </Routes>
      </Suspense>
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LocaleProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
