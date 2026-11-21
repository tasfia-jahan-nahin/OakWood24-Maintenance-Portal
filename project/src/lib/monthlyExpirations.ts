import { DOCUMENT_TYPE_TO_FIELD, type Candidate, type DocumentType } from '@/types';

const documents = Object.entries(DOCUMENT_TYPE_TO_FIELD) as [DocumentType, (typeof DOCUMENT_TYPE_TO_FIELD)[DocumentType]][];

export function candidateExpirations(candidates: Candidate[]) {
  return candidates.flatMap((candidate) => {
    if (candidate.status === 'archived' || candidate.goodbye_email_sent) return [];
    return documents.flatMap(([document, field]) => {
      const date = candidate[field];
      return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? [{ candidate, document, date }] : [];
    });
  }).sort((a, b) => a.date.localeCompare(b.date) || a.candidate.full_name.localeCompare(b.candidate.full_name));
}

export function portalToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
