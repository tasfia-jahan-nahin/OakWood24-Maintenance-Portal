import { COMPLIANCE_DATE_FIELDS, type Candidate, type CandidateWithExpiry, type DocumentType } from '@/types';

const DOCUMENT_REMARK_PREFIX = '__oakwood_document_remark_';
export const DNB_EMAIL_FIELD = '__oakwood_dnb_email_followup';

export function documentRemarkField(document: DocumentType): string {
  return DOCUMENT_REMARK_PREFIX + document;
}

export function getDocumentRemark(candidate: Candidate, document: DocumentType): string {
  return candidate.extra_data?.[documentRemarkField(document)] ?? '';
}

export function isFollowUpField(field: string): boolean {
  return field === DNB_EMAIL_FIELD || field.startsWith(DOCUMENT_REMARK_PREFIX);
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
