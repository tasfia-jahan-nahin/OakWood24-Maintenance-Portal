import type { Candidate } from '@/types';

const POSTCODE = /\b(GIR|[A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;
const POSTCODE_LABEL = /^(?:(?:home|postal|address|candidate) )?(?:post ?code|zip ?code|zip)$/;
const ADDRESS_LABEL = /^(?:(?:candidate|home|current|residential|postal|mailing|contact) )?address(?: (?:line )?\d+)?$/;

export function getCandidatePostcode(candidate: Pick<Candidate, 'extra_data'>): string | null {
  const fields = Object.entries(candidate.extra_data ?? {}).map(([key, value]) => ({
    label: key.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' '),
    value,
  }));
  for (const pattern of [POSTCODE_LABEL, ADDRESS_LABEL]) {
    for (const { label, value } of fields) {
      if (!pattern.test(label) || typeof value !== 'string') continue;
      const match = [...value.matchAll(POSTCODE)].at(-1);
      if (match) return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
    }
  }
  return null;
}
