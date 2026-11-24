import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import en from '../src/locales/en/common.json';
import ar from '../src/locales/ar/common.json';
import bn from '../src/locales/bn/common.json';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenKeys(v as Record<string, unknown>, next));
    } else if (typeof v === 'string') {
      out[next] = v;
    }
  }
  return out;
}

function placeholders(str: string): string[] {
  return [...str.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe('i18n & RTL guards', () => {
  it('en, bn, and ar locale files have identical keys and placeholders', () => {
    const enFlat = flattenKeys(en);
    const arFlat = flattenKeys(ar);
    const bnFlat = flattenKeys(bn);
    expect(Object.keys(arFlat).sort()).toEqual(Object.keys(enFlat).sort());
    expect(Object.keys(bnFlat).sort()).toEqual(Object.keys(enFlat).sort());
    for (const key of Object.keys(enFlat)) {
      expect(placeholders(arFlat[key])).toEqual(placeholders(enFlat[key]));
      expect(placeholders(bnFlat[key])).toEqual(placeholders(enFlat[key]));
    }
  });

  it('CSS uses logical properties rather than physical left/right offsets or blocked external Google Fonts', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/\b(margin|padding|border)-(left|right)\s*:/);
    expect(css).not.toMatch(/(?:^|[;{]\s*)(left|right)\s*:/m);
  });

  it('TSX components avoid physical Tailwind left/right utilities (ml-, mr-, pl-, pr-, text-left, text-right)', () => {
    const srcFiles = ['src/components/PublicShell.tsx', 'src/components/AppShell.tsx', 'src/pages/Public.tsx'];
    for (const rel of srcFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
      expect(content).not.toMatch(/\b(ml|mr|pl|pr|left|right)-\d/);
      expect(content).not.toMatch(/\btext-(left|right)\b/);
    }
  });
});
