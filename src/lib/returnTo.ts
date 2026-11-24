// Ensures post-sign-in redirects stay inside allowed in-app routes.

const ALLOWED_PREFIXES = ['/app', '/onboarding', '/status'];

export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/app';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/app';
  }
  try {
    const parsed = new URL(trimmed, 'https://voxrelay.local');
    if (parsed.origin !== 'https://voxrelay.local') return '/app';
    const path = parsed.pathname + parsed.search + parsed.hash;
    if (ALLOWED_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
      return path;
    }
    return '/app';
  } catch {
    return '/app';
  }
}
