import type { Candidate } from '@/types';
import { readImportRows } from './importRows';
import { portalToday } from './monthlyExpirations';

const prefix = '__oakwood_inactive_';
export const inactiveFields = {
  date: prefix + 'since',
  reason: prefix + 'reason',
  chased: prefix + 'chased',
};

export function isInactiveField(field: string): boolean {
  return field.startsWith(prefix);
}

export function isArchived(candidate: Pick<Candidate, 'status' | 'remark' | 'goodbye_email_sent'>): boolean {
  return candidate.status === 'archived' || candidate.goodbye_email_sent
    || (candidate.remark ?? '').toLowerCase().includes('goodbye email sent');
}

export function newInactivation(extra: Record<string, string> | null | undefined) {
  return {
    [inactiveFields.date]: extra?.[inactiveFields.date] || portalToday(),
    [inactiveFields.reason]: extra?.[inactiveFields.reason] ?? '',
    [inactiveFields.chased]: extra?.[inactiveFields.chased] ?? 'false',
  };
}

export function getInactivation(candidate: Candidate) {
  const extra = candidate.extra_data;
  return {
    date: parseInactivationDate(extra?.[inactiveFields.date] ?? ''),
    reason: extra?.[inactiveFields.reason] ?? '',
    chased: extra?.[inactiveFields.chased] === 'true',
  };
}

const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/;
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseInactivationDate(value: string): string {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(input);
  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(input);
  const match = local ?? named;
  let date = iso ? input : '';
  if (match) {
    const month = local ? Number(match[2]) : months.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    date = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  const time = Date.parse(date);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? date : '';
}

export function inactiveFollowUpRows(candidates: Candidate[], today = portalToday()) {
  return candidates
    .filter((candidate) => candidate.status === 'inactive' && !isArchived(candidate))
    .map((candidate) => {
      const details = getInactivation(candidate);
      const days = (Date.parse(today) - Date.parse(details.date)) / 86_400_000;
      return { candidate, ...details, priority: days >= 0 && days < 30 };
    })
    .sort((a, b) => Number(a.chased) - Number(b.chased)
      || b.date.localeCompare(a.date) || a.candidate.full_name.localeCompare(b.candidate.full_name));
}

export type InactiveImportRow = {
  rowNumber: number;
  name: string;
  date: string;
  reason?: string;
  chased?: boolean;
  candidate?: Candidate;
  issue?: string;
};

const nameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export function previewInactiveImport(raw: string, candidates: Candidate[], today = portalToday()): InactiveImportRow[] {
  const firstLine = raw.split('\n').find((line) => line.trim()) ?? '';
  const separator = firstLine.includes('|') ? '|' : undefined;
  const explicitColumns = !!separator || firstLine.includes('\t')
    || /^(?:candidate(?: name)?|(?:full )?name)\s*,/i.test(firstLine.trim());
  const { records, warning } = readImportRows(raw, separator);
  if (warning) throw new Error(warning);
  const candidatesByName = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = nameKey(candidate.full_name);
    const matches = candidatesByName.get(key) ?? [];
    matches.push(candidate);
    candidatesByName.set(key, matches);
  }

  const rows: InactiveImportRow[] = [];
  for (const { cells, rowNumber } of records) {
    const line = cells.join(', ');
    const embeddedDate = datePattern.exec(line);
    const fields = explicitColumns || (cells.length >= 2 && parseInactivationDate(cells[1])) ? cells
      : embeddedDate
        ? [line.slice(0, embeddedDate.index).replace(/[\s,–—:-]+$/, ''), embeddedDate[0],
          line.slice(embeddedDate.index + embeddedDate[0].length).replace(/^[\s,–—:-]+/, '')]
        : cells;
    const [name, inputDate, reason, status] = fields;
    if (/^(?:candidate(?: name)?|(?:full )?name)$/i.test(name) && /date|inactive/i.test(inputDate ?? '')) continue;
    if (/^(?:candidate(?: name)?|(?:full )?name)\s+(?:inactivation date|date)/i.test(line)) continue;
    const date = parseInactivationDate(inputDate ?? '');
    const matches = candidatesByName.get(nameKey(name)) ?? [];
    const candidate = matches.length === 1 ? matches[0] : undefined;
    const chased = /^(chased|yes)$/i.test(status ?? '') ? true : /^(not chased|no)$/i.test(status ?? '') ? false : undefined;
    const issue = fields.length > 4 ? 'Use up to four columns. Quote reasons containing a separator.'
      : !date || date > today ? 'Enter a valid inactivation date on or before today.'
      : matches.length > 1 ? 'Multiple candidates have this name.'
      : !candidate ? 'No matching candidate.'
      : isArchived(candidate) ? 'Candidate is archived.'
      : status && chased === undefined ? 'Use Chased or Not chased.'
      : undefined;
    rows.push({ rowNumber, name, date, reason, chased, candidate, issue });
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = nameKey(row.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => (counts.get(nameKey(row.name)) ?? 0) > 1
    ? { ...row, issue: 'This name appears more than once in the import.' } : row);
}
