import type { Candidate } from '@/types';

export const MEDCOMP_ROLES = ['Senior HCA', 'Senior RMN', 'Senior RGN', 'Senior RN', 'RMN', 'RGN', 'RN'] as const;
export type MedCompRole = (typeof MEDCOMP_ROLES)[number];
export type MedCompAnswer = 'yes' | 'no' | 'na';
export type MedCompDetails = { role: MedCompRole | ''; answer: MedCompAnswer | ''; expiry: string };

export const MEDCOMP_ROLE_FIELD = '__oakwood_medcomp_role';
export const MEDCOMP_ANSWER_FIELD = '__oakwood_medcomp_answer';
export const MEDCOMP_EXPIRY_FIELD = '__oakwood_medcomp_expiry';

export function getMedComp(candidate: Candidate): MedCompDetails {
  const data = candidate.extra_data;
  const role = MEDCOMP_ROLES.find((option) => option === data?.[MEDCOMP_ROLE_FIELD]);
  const value = data?.[MEDCOMP_ANSWER_FIELD];
  const answer = role && (value === 'yes' || value === 'no' || value === 'na') ? value : '';
  return { role: role ?? '', answer, expiry: answer === 'yes' ? data?.[MEDCOMP_EXPIRY_FIELD] ?? '' : '' };
}

export function medCompFields(role: MedCompRole | '', answer: MedCompAnswer | '', expiry: string) {
  return {
    [MEDCOMP_ROLE_FIELD]: role,
    [MEDCOMP_ANSWER_FIELD]: role ? answer : '',
    [MEDCOMP_EXPIRY_FIELD]: role && answer === 'yes' ? expiry : '',
  };
}
