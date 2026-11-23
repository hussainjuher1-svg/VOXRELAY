import { matchesSearch } from './text';

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  href: string;
  keywords: string;
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'assignments',
    title: 'Assignments & schedule lifecycle',
    summary: 'Track offered, scheduled, preparation, active session, and close-out stages in one place.',
    href: '/how-it-works',
    keywords: 'assignments schedule calendar offer close-out',
  },
  {
    id: 'privacy',
    title: 'Privacy & human-led boundaries',
    summary: 'No recordings, no transcripts, no patient identity columns, and sealed human-only decisions.',
    href: '/privacy',
    keywords: 'privacy recording transcript patient security policy tier',
  },
  {
    id: 'billing',
    title: 'Interpreter billing log & CSV export',
    summary: 'Log timed minutes with rounding rules, track invoiced vs paid records, and export CSV.',
    href: '/interpreters',
    keywords: 'billing invoice rate minutes csv',
  },
  {
    id: 'organizations',
    title: 'Organizations & role permissions',
    summary: 'Owner, admin, coordinator, and interpreter roles with private personal notes.',
    href: '/organizations',
    keywords: 'organization role owner admin coordinator audit',
  },
  {
    id: 'status',
    title: 'System & database lockdown status',
    summary: 'Verify API readiness and whether direct public database access is locked down.',
    href: '/status',
    keywords: 'status database lock rls health supabase',
  },
];

export function searchHelpContent(query: string): HelpArticle[] {
  const q = query.trim();
  if (!q) return HELP_ARTICLES.slice(0, 3);
  return HELP_ARTICLES.filter(
    (item) => matchesSearch(item.title, q) || matchesSearch(item.summary, q) || matchesSearch(item.keywords, q)
  ).slice(0, 3);
}
