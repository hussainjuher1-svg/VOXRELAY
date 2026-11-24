import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isRtl, t as translate, type Locale } from '../lib/i18n';
import { LocaleContext, type LocaleContextValue } from './hooks';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem('voxrelay_locale');
      return saved === 'ar' || saved === 'bn' ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const rtl = isRtl(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('voxrelay_locale', locale);
    } catch {
      // Storage may be unavailable in restricted contexts.
    }
  }, [locale, rtl]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      rtl,
      setLocale,
      toggleLocale: () => setLocale((prev) => (prev === 'en' ? 'bn' : prev === 'bn' ? 'ar' : 'en')),
      tr: (key, vars) => translate(locale, key, vars),
    }),
    [locale, rtl]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
