export type CandidateStatus = 'active' | 'inactive' | 'no_zoho_remark' | 'pending' | 'archived';

export type UserRole = 'admin' | 'coordinator';

export type DocumentType = 'dbs' | 'passport' | 'rtw' | 'evisa' | 'pmva' | 'training' | 'proof_of_address_1' | 'proof_of_address_2';

export type ChaseAction = 'email_sent' | 'called' | 'waiting' | 'completed';

export const CANDIDATE_STATUSES: CandidateStatus[] = ['active', 'inactive', 'no_zoho_remark', 'pending', 'archived'];

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  no_zoho_remark: 'No Zoho',
  pending: 'Pending',
  archived: 'Archived',
};

export const COMPLIANCE_DATE_FIELDS = [
  'dbs_expiry_date',
  'passport_expiry_date',
  'rtw_expiry_date',
  'evisa_expiry_date',
  'pmva_expiry_date',
  'training_expiry_date',
] as const;

export type ComplianceDateField = (typeof COMPLIANCE_DATE_FIELDS)[number];

export const COMPLIANCE_DATE_LABELS: Record<ComplianceDateField, string> = {
  dbs_expiry_date: 'DBS',
  passport_expiry_date: 'Passport',
  rtw_expiry_date: 'RTW',
  evisa_expiry_date: 'eVisa',
  pmva_expiry_date: 'PMVA',
  training_expiry_date: 'Training',
};

export const COMPLIANCE_DATE_SHORT: Record<ComplianceDateField, string> = {
  dbs_expiry_date: 'DBS',
  passport_expiry_date: 'PP',
  rtw_expiry_date: 'RTW',
  evisa_expiry_date: 'eVisa',
  pmva_expiry_date: 'PMVA',
  training_expiry_date: 'TRN',
};

export const DOCUMENT_TYPE_TO_FIELD: Record<DocumentType, ComplianceDateField | 'proof_of_address_1_expiry' | 'proof_of_address_2_expiry'> = {
  dbs: 'dbs_expiry_date',
  passport: 'passport_expiry_date',
  rtw: 'rtw_expiry_date',
  evisa: 'evisa_expiry_date',
  pmva: 'pmva_expiry_date',
  training: 'training_expiry_date',
  proof_of_address_1: 'proof_of_address_1_expiry',
  proof_of_address_2: 'proof_of_address_2_expiry',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  dbs: 'DBS',
  passport: 'Passport',
  rtw: 'RTW',
  evisa: 'eVisa',
  pmva: 'PMVA',
  training: 'Training',
  proof_of_address_1: 'Proof of Address 1',
  proof_of_address_2: 'Proof of Address 2',
};

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface TeamSummaryRecord {
  user_id: string;
  display_name: string;
  total_candidates: number;
  active_candidates: number;
  inactive_candidates: number;
  no_zoho_candidates: number;
}

export interface AuthActivityLog {
  id: string;
  user_id: string;
  user_email: string | null;
  display_name: string | null;
  event_type: 'login' | 'logout';
  details: string | null;
  created_at: string;
}

export interface Candidate {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  status: CandidateStatus;
  remark: string | null;
  goodbye_email_sent: boolean;
  notes: string | null;
  dbs_expiry_date: string | null;
  passport_expiry_date: string | null;
  rtw_expiry_date: string | null;
  evisa_expiry_date: string | null;
  pmva_expiry_date: string | null;
  training_expiry_date: string | null;
  proof_of_address_1_expiry: string | null;
  proof_of_address_2_expiry: string | null;
  pmva_verification_completed: boolean;
  training_verification_completed: boolean;
  extra_data: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeHistoryEntry {
  id: string;
  candidate_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  entity_type: string;
  created_at: string;
}

export interface ChaseActionEntry {
  id: string;
  candidate_id: string;
  user_id: string | null;
  user_email: string | null;
  document_type: DocumentType;
  action: ChaseAction;
  note: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface ChaseCandidateItem {
  candidate: CandidateWithExpiry;
  documentType: DocumentType;
  expiryField: ComplianceDateField;
  expiryDate: string;
  expiryStatus: ExpiryStatus;
  warningTier: WarningTier;
  latestAction: ChaseActionEntry | null;
}

export interface ReminderSettings {
  id: string;
  dbs_reminder_days: number;
  passport_reminder_days: number;
  rtw_reminder_days: number;
  pmva_reminder_days: number;
  training_reminder_days: number;
  do_not_book_days: number;
  first_warning_days: number;
  second_warning_days: number;
  updated_at: string;
  updated_by: string | null;
}

export interface ReminderSettingsInput {
  dbs_reminder_days: number;
  passport_reminder_days: number;
  rtw_reminder_days: number;
  pmva_reminder_days: number;
  training_reminder_days: number;
  do_not_book_days: number;
  first_warning_days: number;
  second_warning_days: number;
}

export interface CandidateInput {
  full_name: string;
  role: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: CandidateStatus;
  remark?: string | null;
  goodbye_email_sent?: boolean;
  notes?: string | null;
  dbs_expiry_date?: string | null;
  passport_expiry_date?: string | null;
  rtw_expiry_date?: string | null;
  evisa_expiry_date?: string | null;
  pmva_expiry_date?: string | null;
  training_expiry_date?: string | null;
  pmva_verification_completed?: boolean;
  training_verification_completed?: boolean;
  extra_data?: Record<string, string> | null;
}

export interface ParsedImportRow {
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  remark: string | null;
  dbs_expiry_date: string | null;
  passport_expiry_date: string | null;
  rtw_expiry_date: string | null;
  evisa_expiry_date: string | null;
  pmva_expiry_date: string | null;
  training_expiry_date: string | null;
  proof_of_address_1_expiry: string | null;
  proof_of_address_2_expiry: string | null;
  extra_data: Record<string, string>;
}

export interface SkippedImportRow {
  rowNumber: number;
  reason: string;
  rawValues: string[];
}

export interface ImportPreview {
  row: ParsedImportRow;
  existing: Candidate | null;
  isDuplicate: boolean;
  resolution: 'create' | 'update' | 'skip' | 'pending';
}

export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'missing';

export type WarningTier = 'none' | 'first' | 'second';

export interface CandidateWithExpiry extends Candidate {
  expiryStatuses: Record<ComplianceDateField, ExpiryStatus>;
  warningTiers: Record<ComplianceDateField, WarningTier>;
  isDoNotBook: boolean;
  isExpiringSoon: boolean;
  isFirstWarning: boolean;
  isSecondWarning: boolean;
}
