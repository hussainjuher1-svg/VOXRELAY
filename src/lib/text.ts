// Text normalization, CSV encoding handling, and timing-only ICS parsing.

// NFKC, lowercase, strip Latin combining marks, Hebrew niqqud, Arabic diacritics,
// unify alef/yeh/kaf/ta-marbuta forms while preserving Indic vowel signs.
export function normalizeSearchKey(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .toLowerCase()
    // Strip Latin combining diacritical marks (0300-036F)
    .replace(/[\u0300-\u036f]/g, '')
    // Strip Hebrew niqqud & cantillation (0591-05C7)
    .replace(/[\u0591-\u05c7]/g, '')
    // Strip Arabic diacritics & tatweel (0640, 064B-065F, 0670, 06D6-06ED)
    .replace(/(?:\u0640|[\u064b-\u065f]|\u0670|[\u06d6-\u06ed])/g, '')
    // Unify Arabic forms
    .replace(/[\u0622\u0623\u0625]/g, '\u0627') // alef variants -> alef
    .replace(/\u0649/g, '\u064a') // alef maksura -> yeh
    .replace(/\u06a9/g, '\u0643') // keheh -> kaf
    .replace(/\u0629/g, '\u0647') // ta marbuta -> heh
    .normalize('NFC')
    .trim();
}

export function matchesSearch(haystack: string, needle: string): boolean {
  const n = normalizeSearchKey(needle);
  if (!n) return true;
  return normalizeSearchKey(haystack).includes(n);
}

// Accepts UTF-8 (with or without BOM) or UTF-16 LE/BE with BOM. Refuses invalid
// UTF-8 byte sequences or unsupported encodings rather than producing mojibake.
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be', { fatal: true }).decode(bytes.slice(2));
  }
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const slice = hasUtf8Bom ? bytes.slice(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(slice);
  } catch {
    throw new Error('Unsupported CSV encoding. Save your file as UTF-8 or UTF-16.');
  }
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const s = String(value ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function exportCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export interface IcsTimingSlot {
  startAt: string;
  endAt: string | null;
  durationMinutes: number;
}

function parseIcsDate(raw: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : 'Z'}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Timing only: SUMMARY, DESCRIPTION, LOCATION, and ATTENDEE are never parsed.
export function parseIcsTimingOnly(icsText: string): IcsTimingSlot[] {
  const lines = String(icsText ?? '').replace(/\r\n/g, '\n').split('\n');
  const slots: IcsTimingSlot[] = [];
  let inEvent = false;
  let dtStart: Date | null = null;
  let dtEnd: Date | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      dtStart = null;
      dtEnd = null;
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (inEvent && dtStart) {
        const mins = dtEnd
          ? Math.max(15, Math.round((dtEnd.getTime() - dtStart.getTime()) / 60_000))
          : 60;
        slots.push({
          startAt: dtStart.toISOString(),
          endAt: dtEnd ? dtEnd.toISOString() : null,
          durationMinutes: mins,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (trimmed.startsWith('DTSTART')) {
      const val = trimmed.split(':').slice(1).join(':');
      dtStart = parseIcsDate(val);
    } else if (trimmed.startsWith('DTEND')) {
      const val = trimmed.split(':').slice(1).join(':');
      dtEnd = parseIcsDate(val);
    }
  }
  return slots;
}
