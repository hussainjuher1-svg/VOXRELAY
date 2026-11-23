import { describe, it, expect } from 'vitest';
import { decodeCsvBytes, exportCsv, normalizeSearchKey, parseIcsTimingOnly } from '../src/lib/text';

describe('text, CSV, and ICS helpers', () => {
  it('normalizes Latin accents, Arabic forms/diacritics, Hebrew niqqud, and preserves Indic vowels', () => {
    expect(normalizeSearchKey('Café')).toBe('cafe');
    expect(normalizeSearchKey('إدارةُ المَهامّ')).toBe('اداره المهام');
    expect(normalizeSearchKey('שָׁלוֹם')).toBe('שלום');
    expect(normalizeSearchKey('चिकित्सा')).toBe('चिकित्सा');
  });

  it('exports UTF-8 BOM CSV with spreadsheet formula neutralization', () => {
    const out = exportCsv(['term', 'note'], [['=CMD()', 'safe, "quoted"']]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(out).toContain("'=CMD()");
    expect(out).toContain('"safe, ""quoted"""');
  });

  it('decodes UTF-8 BOM and UTF-16 LE, and rejects malformed byte sequences', () => {
    const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62]);
    expect(decodeCsvBytes(utf8Bom)).toBe('a,b');
    const invalid = new Uint8Array([0xff, 0xfe]);
    expect(decodeCsvBytes(invalid)).toBe('');
    const badUtf8 = new Uint8Array([0xc3, 0x28]);
    expect(() => decodeCsvBytes(badUtf8)).toThrow(/Unsupported CSV encoding/);
  });

  it('parses ICS timing only and ignores SUMMARY/DESCRIPTION', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Confidential Patient Name',
      'DESCRIPTION:Do not parse this',
      'DTSTART:20261124T100000Z',
      'DTEND:20261124T104500Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const slots = parseIcsTimingOnly(ics);
    expect(slots).toEqual([
      {
        startAt: '2026-11-24T10:00:00.000Z',
        endAt: '2026-11-24T10:45:00.000Z',
        durationMinutes: 45,
      },
    ]);
    expect(JSON.stringify(slots)).not.toContain('Confidential');
  });
});
