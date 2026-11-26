import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useLocale } from '../context/hooks';
import { sanitizeReturnTo } from '../lib/returnTo';

/** UX boundary only. Every API must independently authenticate and authorize. */
export function RequireWorkspaceSession() {
  const { user, loading } = useAuth();
  const { locale } = useLocale();
  const location = useLocation();
  if (loading) {
    return (
      <main className="pub-container" style={{ paddingBlock: '64px' }}>
        <p role="status">{locale === 'ar' ? 'جارٍ التحقق من الجلسة…' : 'Checking your session…'}</p>
      </main>
    );
  }
  if (!user) {
    const returnTo = sanitizeReturnTo(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}
