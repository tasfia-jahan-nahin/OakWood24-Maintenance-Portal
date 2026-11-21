import { COMPLIANCE_DATE_FIELDS, type Candidate, type CandidateWithExpiry, type ChaseDocumentType } from '@/types';
import { MEDCOMP_ANSWER_FIELD, MEDCOMP_EXPIRY_FIELD, MEDCOMP_ROLE_FIELD } from './medcomp';

const DOCUMENT_REMARK_PREFIX = '__oakwood_document_remark_';
export const DNB_EMAIL_FIELD = '__oakwood_dnb_email_followup';

export function documentRemarkField(document: ChaseDocumentType): string {
  return DOCUMENT_REMARK_PREFIX + document;
}

export function getDocumentRemark(candidate: Candidate, document: ChaseDocumentType): string {
  return candidate.extra_data?.[documentRemarkField(document)] ?? '';
}

export function isFollowUpField(field: string): boolean {
  return [DNB_EMAIL_FIELD, MEDCOMP_ROLE_FIELD, MEDCOMP_ANSWER_FIELD, MEDCOMP_EXPIRY_FIELD].includes(field)
    || field.startsWith(DOCUMENT_REMARK_PREFIX);
}

export function doNotBookFollowUpKey(candidate: CandidateWithExpiry): string {
  return JSON.stringify([
    ...COMPLIANCE_DATE_FIELDS
      .filter((field) => candidate.warningTiers[field] !== 'none')
      .map((field) => [field, candidate[field], candidate.warningTiers[field]]),
    candidate.pmva_verification_completed ? null : candidate.pmva_expiry_date,
    candidate.training_verification_completed ? null : candidate.training_expiry_date,
  ]);
}
