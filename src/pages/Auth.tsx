import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PublicShell } from '../components/PublicShell';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { useAuth } from '../context/hooks';
import { sanitizeReturnTo } from '../lib/returnTo';
import { supabase } from '../lib/supabaseClient';

export function LoginPage() {
  const { user, loading, refreshSession } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
  const inviteToken = searchParams.get('invite') || '';
  const requestedMode = searchParams.get('mode');

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(
    inviteToken || requestedMode === 'signup' ? 'signup' : 'signin'
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate(returnTo, { replace: true });
    }
  }, [loading, user, navigate, returnTo]);

  async function handleResendConfirmation() {
    if (!supabase || !email) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) setFeedback({ kind: 'error', text: error.message });
      else {
        setFeedback({ kind: 'info', text: `Confirmation link re-sent to ${email}. Check your inbox and spam folder.` });
        setNeedsConfirmation(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    setNeedsConfirmation(false);

    try {
      if (mode === 'forgot') {
        if (!supabase) {
          setFeedback({
            kind: 'info',
            text: 'Password reset emails require Supabase Auth configuration; contact a local admin in /app/admin.',
          });
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) setFeedback({ kind: 'error', text: error.message });
        else setFeedback({ kind: 'info', text: 'If an account exists, a password reset link has been sent.' });
        return;
      }

      if (mode === 'signup' && password.length < 12) {
        setFeedback({ kind: 'error', text: 'Use at least 12 characters for your password.' });
        return;
      }

      // Try local cookie auth endpoint first so local/sandbox workspace works immediately
      const localRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(
          mode === 'signup'
            ? { action: 'signup', email, password, fullName, inviteToken: inviteToken || undefined }
            : { action: 'signin', email, password }
        ),
      }).catch(() => null);

      if (localRes && localRes.status !== 503) {
        const localData = await localRes.json().catch(() => ({}));
        if (localRes.ok) {
          if (mode === 'signup' && supabase) {
            // Mirror signup to Supabase Auth when configured so future Supabase sign-ins also work
            void supabase.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName } },
            });
          }
          await refreshSession();
          navigate(returnTo, { replace: true });
          return;
        }
        if (localRes.status !== 401 || !supabase) {
          setFeedback({ kind: 'error', text: localData.error || 'Authentication failed.' });
          return;
        }
      }

      if (!supabase) {
        setFeedback({ kind: 'error', text: 'Authentication service is unavailable.' });
        return;
      }

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) {
          setFeedback({ kind: 'error', text: error.message });
        } else if (data.session) {
          navigate(returnTo, { replace: true });
        } else {
          setNeedsConfirmation(true);
          setFeedback({
            kind: 'info',
            text: 'Account created. Check your inbox to confirm your email, or resend confirmation below.',
          });
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/email not confirmed/i.test(error.message)) {
          setNeedsConfirmation(true);
        }
        setFeedback({ kind: 'error', text: error.message });
      }
    } finally {
      setBusy(false);
    }
  }

  const passwordStrength = (() => {
    if (!password) return { score: 0, label: 'Enter 12+ characters' };
    let score = 0;
    if (password.length >= 12) score += 25;
    if (password.length >= 16) score += 15;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 20;
    if (/\d/.test(password)) score += 20;
    if (/[^A-Za-z0-9]/.test(password)) score += 20;
    const label = score >= 80 ? 'Strong' : score >= 50 ? 'Good' : 'Weak — add length, digits & symbols';
    return { score, label };
  })();

  return (
    <PublicShell>
      <section className="subpage section-wrap">
        <span className="eyebrow">AUTHENTICATION</span>
        <h1>
          {mode === 'signin'
            ? 'Sign in to VOXRELAY'
            : mode === 'signup'
              ? 'Create a workspace account'
              : 'Reset your password'}
        </h1>
        <p className="subpage-lead">
          {inviteToken
            ? 'Your one-time invite token is attached. Choose a password (12+ characters) to activate your account.'
            : 'Sign in with your email and password, or create a workspace account. Need an invite? '}
          {!inviteToken && (
            <Link className="inline-link" to="/contact">
              Request access
            </Link>
          )}
          .
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
            Create account
          </button>
          <button type="button" className={mode === 'forgot' ? 'is-active' : ''} onClick={() => setMode('forgot')}>
            Forgot password
          </button>
        </div>

        <form className="panel-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <Field label="Full name" htmlFor="auth-name">
              <Input
                id="auth-name"
                type="text"
                dir="auto"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </Field>
          )}
          <Field label="Work email" htmlFor="auth-email">
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />
          </Field>
          {mode !== 'forgot' && (
            <div>
              <Field
                label="Password"
                htmlFor="auth-password"
                hint={mode === 'signup' ? 'Minimum 12 characters, breached passwords blocked.' : undefined}
              >
                <Input
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === 'signup' ? 12 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {mode === 'signup' && password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="meter-track" aria-label="Password strength">
                    <div
                      className="meter-fill"
                      style={{
                        width: `${passwordStrength.score}%`,
                        background: passwordStrength.score >= 80 ? '#184d42' : passwordStrength.score >= 50 ? '#f2b632' : '#de4e26',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--vr-ink-2)' }}>{passwordStrength.label}</span>
                </div>
              )}
            </div>
          )}
          <Button type="submit" loading={busy}>
            {busy
              ? 'Working...'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>
          {feedback && (
            <div role="status">
              <p className={feedback.kind === 'error' ? 'form-error' : 'form-success'}>{feedback.text}</p>
              {needsConfirmation && supabase && email && (
                <Button type="button" size="sm" variant="secondary" onClick={handleResendConfirmation} disabled={busy}>
                  Resend confirmation email
                </Button>
              )}
            </div>
          )}
        </form>
      </section>
    </PublicShell>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setStatus('Supabase is not configured.');
      return;
    }
    if (password.length < 12) {
      setStatus('Use at least 12 characters.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setStatus(error.message);
    else navigate('/app', { replace: true });
  }

  return (
    <PublicShell>
      <section className="subpage section-wrap">
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h1>Choose a new password</h1>
        <form className="panel-form" onSubmit={onSubmit}>
          <Field label="New password (minimum 12 characters)" htmlFor="reset-pw">
            <Input
              id="reset-pw"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit">Update password</Button>
          {status && <p className="form-error">{status}</p>}
        </form>
      </section>
    </PublicShell>
  );
}
