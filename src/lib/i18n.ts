import en from '../locales/en/common.json';
import ar from '../locales/ar/common.json';

export type Locale = 'en' | 'ar';
export const LOCALES: Record<Locale, typeof en> = { en, ar };

export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}

export function t(locale: Locale, path: string, vars?: Record<string, string | number>): string {
  const parts = path.split('.');
  let cur: unknown = LOCALES[locale] ?? LOCALES.en;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      cur = undefined;
      break;
    }
  }
  if (typeof cur !== 'string') return path;
  if (!vars) return cur;
  return cur.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`
  );
}
