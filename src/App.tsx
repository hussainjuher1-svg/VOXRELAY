import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PublicShell } from './components/PublicShell';
import { CommandPalette } from './components/ui/CommandPalette';
import { AuthProvider } from './context/AuthContext';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';
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
const AssignmentsPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.AssignmentsPage })));
const SessionFocusPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.SessionFocusPage })));
const TerminologyPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.TerminologyPage })));
const DeviceCheckPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.DeviceCheckPage })));
const BillingPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.BillingPage })));
const RecordsAssistantPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.RecordsAssistantPage })));
const SupportPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.SupportPage })));
const AdminReviewPage = lazy(() => import('./pages/AppWorkspace').then((m) => ({ default: m.AdminReviewPage })));
const WorkspacePlaceholderPage = lazy(() =>
  import('./pages/AppWorkspace').then((m) => ({ default: m.WorkspacePlaceholderPage }))
);

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="pub-container" style={{ paddingBlock: '64px' }}>
          <h1>Something went wrong</h1>
          <p>Reload the page to continue.</p>
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
          <Route
            path="/onboarding"
            element={
              <WorkspacePlaceholderPage
                eyebrow="ONBOARDING"
                title="Workspace setup"
                description="Configure your time zone, language pairs, and notification preferences in Settings."
              />
            }
          />

          <Route path="/app" element={<OverviewPage />} />
          <Route
            path="/app/ops"
            element={
              <WorkspacePlaceholderPage
                eyebrow="OPS DASHBOARD"
                title="Today's sessions and queues"
                description="Counts link directly to assignments, documentation drafts, follow-ups, billing, and support queues."
              />
            }
          />
          <Route path="/app/assignments" element={<AssignmentsPage />} />
          <Route path="/app/assignments/:id" element={<AssignmentsPage />} />
          <Route path="/app/assignments/:id/close" element={<SessionFocusPage />} />
          <Route path="/app/session/:id" element={<SessionFocusPage />} />
          <Route
            path="/app/availability"
            element={
              <WorkspacePlaceholderPage
                eyebrow="AVAILABILITY"
                title="Weekly hours & date overrides"
                description="Set recurring weekly capacity and date-specific unavailable or custom windows."
              />
            }
          />
          <Route path="/app/terminology" element={<TerminologyPage />} />
          <Route path="/app/device-check" element={<DeviceCheckPage />} />
          <Route path="/app/billing" element={<BillingPage />} />
          <Route path="/app/assistant" element={<RecordsAssistantPage />} />
          <Route path="/app/support" element={<SupportPage />} />
          <Route path="/app/admin" element={<AdminReviewPage />} />
          <Route
            path="/app/reports"
            element={
              <WorkspacePlaceholderPage
                eyebrow="REPORTS"
                title="Interpreter & organization totals"
                description="Sessions and minutes grouped by language pair and modality, computed from completed assignments."
              />
            }
          />
          <Route
            path="/app/quality"
            element={
              <WorkspacePlaceholderPage
                eyebrow="QUALITY MONITORING"
                title="Six operational indicators"
                description="Numerator/denominator ratios across device checks, on-time starts, technical exceptions, documentation, close-out, and follow-ups."
              />
            }
          />
          <Route
            path="/app/organization"
            element={
              <WorkspacePlaceholderPage
                eyebrow="ORGANIZATION"
                title="Directory, offers, policy & audit"
                description="Manage invitations, role assignments, versioned assistance policy tiers, and metadata-only audit events."
              />
            }
          />
          <Route
            path="/app/settings"
            element={
              <WorkspacePlaceholderPage
                eyebrow="SETTINGS"
                title="Profile, locale & retention"
                description="Manage language preference (English / Arabic), time zone, theme, and retention settings."
              />
            }
          />
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
