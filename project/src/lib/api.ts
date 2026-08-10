import { supabase } from '@/lib/supabase';
import type {
  Candidate,
  CandidateInput,
  CandidateStatus,
  CandidateWithExpiry,
  ChangeHistoryEntry,
  ChaseAction,
  ChaseActionEntry,
  ChaseCandidateItem,
  ComplianceDateField,
  DocumentType,
  ExpiryStatus,
  ImportPreview,
  ParsedImportRow,
  Profile,
  ReminderSettings,
  ReminderSettingsInput,
  TeamSummaryRecord,
  AuthActivityLog,
  WarningTier,
} from '@/types';
import {
  COMPLIANCE_DATE_FIELDS,
  DOCUMENT_TYPE_TO_FIELD,
} from '@/types';

// ---------- Auth helpers ----------
async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return { id: data.user?.id ?? null, email: data.user?.email ?? 'Unknown' };
}

// ---------- Change History ----------
export async function logChange(
  candidateId: string,
  action: string,
  oldValue: string | null = null,
  newValue: string | null = null,
  entityType = 'candidate',
): Promise<void> {
  const { error } = await supabase.rpc('log_change_history', {
    p_candidate_id: candidateId,
    p_action: action,
    p_old_value: oldValue,
    p_new_value: newValue,
    p_entity_type: entityType,
  });
  if (error) console.error('Failed to log change:', error);
}

export async function fetchChangeHistory(limit = 200): Promise<ChangeHistoryEntry[]> {
  const { data, error } = await supabase
    .from('change_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------- Legacy audit logs ----------
export async function createAuditLog(
  action: string,
  entityType: string,
  entityId: string | null,
  details: string,
): Promise<void> {
  const { id, email } = await getCurrentUser();
  if (!id) return;
  await supabase.from('audit_logs').insert({
    user_id: id,
    user_email: email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

export async function fetchAuditLogs(limit = 100) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function logAuthActivity(eventType: 'login' | 'logout', details?: string): Promise<void> {
  const { error } = await supabase.rpc('log_auth_activity', {
    p_event_type: eventType,
    p_details: details ?? null,
  });
  if (error) throw error;
}

export async function fetchAuthActivityLogs(limit = 100): Promise<AuthActivityLog[]> {
  const { data, error } = await supabase.rpc('fetch_auth_activity_logs', {
    limit_rows: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTeamSummary(): Promise<TeamSummaryRecord[]> {
  const { data, error } = await supabase.rpc('fetch_team_summary');
  if (error) throw error;
  return data ?? [];
}

// ---------- Candidates ----------
export async function fetchCandidates(): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCandidate(id: string): Promise<Candidate | null> {
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCandidate(input: CandidateInput): Promise<Candidate> {
  const goodbyeEmailSent = (input.remark ?? '').toLowerCase().includes('goodbye email sent');
  const payload = { ...input, goodbye_email_sent: goodbyeEmailSent };
  const { data, error } = await supabase.from('candidates').insert(payload).select().single();
  if (error) throw error;
  await logChange(data.id, 'candidate.create', null, `Created candidate: ${data.full_name}`);
  return data;
}

export async function updateCandidate(
  id: string,
  input: Partial<CandidateInput>,
  candidateName?: string,
): Promise<Candidate> {
  const updateData: Record<string, unknown> = { ...input };
  if (input.remark !== undefined) {
    updateData.goodbye_email_sent = (input.remark ?? '').toLowerCase().includes('goodbye email sent');
  }
  const { data: existing } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('candidates')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  if (existing) {
    for (const key of Object.keys(input)) {
      const oldVal = String((existing as Record<string, unknown>)[key] ?? '');
      const newVal = String((input as Record<string, unknown>)[key] ?? '');
      if (oldVal !== newVal) {
        await logChange(id, `field.${key}`, oldVal || null, newVal || null);
        // Special-case: when a candidate is moved to archived, write an explicit audit entry
        if (key === 'status' && newVal.toLowerCase().includes('archiv')) {
          const details = `Candidate ${candidateName ?? id} moved to Archived`;
          try {
            await logChange(id, 'CANDIDATE_ARCHIVED', null, details);
          } catch (err) {
            console.error('Failed to log candidate archived change_history:', err);
          }
          try {
            await createAuditLog('CANDIDATE_ARCHIVED', 'candidate', id, details);
          } catch (err) {
            console.error('Failed to create audit log for candidate archived:', err);
          }
        }
      }
    }
  } else {
    await logChange(id, 'candidate.update', null, `Updated: ${candidateName ?? id}`);
  }

  // If remark indicates goodbye/archive, write an explicit archived audit entry
  if (input.remark !== undefined && (input.remark ?? '').toLowerCase().includes('goodbye email sent')) {
    const details = `Candidate ${candidateName ?? id} moved to Archived`;
    try {
      await logChange(id, 'CANDIDATE_ARCHIVED', null, details);
    } catch (err) {
      console.error('Failed to log candidate archived change_history (remark path):', err);
    }
    try {
      await createAuditLog('CANDIDATE_ARCHIVED', 'candidate', id, details);
    } catch (err) {
      console.error('Failed to create audit log for candidate archived (remark path):', err);
    }
  }
  return data;
}

export async function deleteCandidate(id: string): Promise<void> {
  const { data: existing } = await supabase
    .from('candidates')
    .select('full_name')
    .eq('id', id)
    .maybeSingle();
  await logChange(id, 'candidate.delete', existing?.full_name ?? id, 'Deleted');
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw error;
}

export async function clearAllCandidates(): Promise<void> {
  const { error } = await supabase.rpc('clear_all_candidates');
  if (error) {
    const detail = error.message || error.hint || error.code || 'Unknown database error';
    throw new Error(`Failed to clear database: ${detail}`);
  }
}

// ---------- Chase Actions ----------
export async function fetchChaseActions(candidateId?: string): Promise<ChaseActionEntry[]> {
  let query = supabase
    .from('chase_actions')
    .select('*')
    .order('created_at', { ascending: false });
  if (candidateId) query = query.eq('candidate_id', candidateId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function addChaseAction(
  candidateId: string,
  documentType: DocumentType,
  action: ChaseAction,
  note?: string,
  expiryDate?: string | null,
): Promise<void> {
  const { id, email } = await getCurrentUser();
  const { error } = await supabase.from('chase_actions').insert({
    candidate_id: candidateId,
    user_id: id,
    user_email: email,
    document_type: documentType,
    action,
    note: note ?? null,
    expiry_date: expiryDate ?? null,
  });
  if (error) throw error;
  await logChange(candidateId, `chase.${documentType}.${action}`, null, action);
}

// ---------- Reminder Settings ----------
export async function fetchReminderSettings(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase
    .from('reminder_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateReminderSettings(
  input: ReminderSettingsInput,
): Promise<ReminderSettings> {
  const { id: userId } = await getCurrentUser();
  const { data: existing } = await supabase
    .from('reminder_settings')
    .select('id')
    .limit(1)
    .maybeSingle();

  const payload = { ...input, updated_by: userId, updated_at: new Date().toISOString() };

  if (existing) {
    const { data, error } = await supabase
      .from('reminder_settings')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('reminder_settings')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Dashboard Stats ----------
export interface DashboardStats {
  totalCandidates: number;
  activeCandidates: number;
  inactiveCandidates: number;
  noZohoCandidates: number;
  todayChase: number;
  doNotBook: number;
  goodbyeEmailSent: number;
}

export async function fetchDashboardStats(
  settings?: ReminderSettings | null,
): Promise<DashboardStats> {
  const candidates = await fetchCandidates();
  const reminderDays = settings ?? (await fetchReminderSettings());
  const reminderMap: Record<ComplianceDateField, number> = {
    dbs_expiry_date: reminderDays?.dbs_reminder_days ?? 30,
    passport_expiry_date: reminderDays?.passport_reminder_days ?? 30,
    rtw_expiry_date: reminderDays?.rtw_reminder_days ?? 30,
    evisa_expiry_date: reminderDays?.rtw_reminder_days ?? 30,
    pmva_expiry_date: reminderDays?.pmva_reminder_days ?? 30,
    training_expiry_date: reminderDays?.training_reminder_days ?? 20,
  };
  const doNotBookDays = reminderDays?.do_not_book_days ?? 7;
  let todayChase = 0;
  let doNotBook = 0;
  for (const c of candidates) {
    if (c.goodbye_email_sent) continue;
    const exp = computeExpiryStatuses(c, reminderMap, doNotBookDays, reminderDays?.first_warning_days ?? 15, reminderDays?.second_warning_days ?? 7);
    if (exp.isExpiringSoon) todayChase++;
    if (exp.isDoNotBook) doNotBook++;
  }
  return {
    totalCandidates: candidates.length,
    activeCandidates: candidates.filter((c) => c.status === 'active').length,
    inactiveCandidates: candidates.filter((c) => c.status === 'inactive').length,
    noZohoCandidates: candidates.filter((c) => c.status === 'no_zoho_remark').length,
    todayChase,
    doNotBook,
    goodbyeEmailSent: candidates.filter((c) => c.goodbye_email_sent).length,
  };
}

// ---------- Expiry helpers ----------
export function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getExpiryStatus(
  expiryDate: string | null,
  reminderDays: number,
): ExpiryStatus {
  if (!expiryDate) return 'missing';
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  if (days <= reminderDays) return 'expiring';
  return 'valid';
}

export function getExpiryBadgeText(expiryDate: string | null, reminderDays: number): string {
  if (!expiryDate) return 'Missing';
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return 'Missing';
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expiring today';
  if (days === 1) return 'Expiring in 1 day';
  if (days <= reminderDays) return `Expiring in ${days} days`;
  return 'Valid';
}

export function getWarningTier(
  expiryDate: string | null,
  firstWarningDays: number,
  secondWarningDays: number,
): WarningTier {
  if (!expiryDate) return 'none';
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return 'none';
  if (days < 0) return 'none';
  if (days <= secondWarningDays) return 'second';
  if (days <= firstWarningDays) return 'first';
  return 'none';
}

export function isCandidateDoNotBook(
  candidate: Candidate,
  expiryStatuses: Record<ComplianceDateField, ExpiryStatus>,
  warningTiers: Record<ComplianceDateField, WarningTier>,
): boolean {
  if (candidate.status !== 'active' || candidate.goodbye_email_sent) return false;
  if (COMPLIANCE_DATE_FIELDS.some((field) => expiryStatuses[field] === 'expired')) return false;
  return COMPLIANCE_DATE_FIELDS.some((field) => warningTiers[field] === 'first' || warningTiers[field] === 'second');
}

export function computeExpiryStatuses(
  candidate: Candidate,
  reminderMap: Record<ComplianceDateField, number>,
  doNotBookDays: number,
  firstWarningDays = 15,
  secondWarningDays = 7,
): {
  expiryStatuses: Record<ComplianceDateField, ExpiryStatus>;
  warningTiers: Record<ComplianceDateField, WarningTier>;
  isDoNotBook: boolean;
  isExpiringSoon: boolean;
  isFirstWarning: boolean;
  isSecondWarning: boolean;
} {
  const expiryStatuses = {} as Record<ComplianceDateField, ExpiryStatus>;
  const warningTiers = {} as Record<ComplianceDateField, WarningTier>;
  let isExpiringSoon = false;
  let isFirstWarning = false;
  let isSecondWarning = false;

  for (const field of COMPLIANCE_DATE_FIELDS) {
    const status = getExpiryStatus(candidate[field], reminderMap[field]);
    expiryStatuses[field] = status;
    const tier = getWarningTier(candidate[field], firstWarningDays, secondWarningDays);
    warningTiers[field] = tier;

    if (status === 'expiring') isExpiringSoon = true;
    if (tier === 'first') isFirstWarning = true;
    if (tier === 'second') isSecondWarning = true;
  }

  const isDoNotBook = isCandidateDoNotBook(candidate, expiryStatuses, warningTiers);
  return { expiryStatuses, warningTiers, isDoNotBook, isExpiringSoon, isFirstWarning, isSecondWarning };
}

export function enrichCandidates(
  candidates: Candidate[],
  settings: ReminderSettings | null,
): CandidateWithExpiry[] {
  const reminderMap: Record<ComplianceDateField, number> = {
    dbs_expiry_date: settings?.dbs_reminder_days ?? 30,
    passport_expiry_date: settings?.passport_reminder_days ?? 30,
    rtw_expiry_date: settings?.rtw_reminder_days ?? 30,
    evisa_expiry_date: settings?.rtw_reminder_days ?? 30,
    pmva_expiry_date: settings?.pmva_reminder_days ?? 30,
    training_expiry_date: settings?.training_reminder_days ?? 20,
  };
  const doNotBookDays = settings?.do_not_book_days ?? 7;
  const firstWarningDays = settings?.first_warning_days ?? 15;
  const secondWarningDays = settings?.second_warning_days ?? 7;

  return candidates.map((c) => {
    if (c.goodbye_email_sent) {
      const empty = {} as Record<ComplianceDateField, ExpiryStatus>;
      const emptyTiers = {} as Record<ComplianceDateField, WarningTier>;
      for (const f of COMPLIANCE_DATE_FIELDS) {
        empty[f] = 'missing';
        emptyTiers[f] = 'none';
      }
      return { ...c, expiryStatuses: empty, warningTiers: emptyTiers, isDoNotBook: false, isExpiringSoon: false, isFirstWarning: false, isSecondWarning: false };
    }
    const { expiryStatuses, warningTiers, isDoNotBook, isExpiringSoon, isFirstWarning, isSecondWarning } = computeExpiryStatuses(
      c,
      reminderMap,
      doNotBookDays,
      firstWarningDays,
      secondWarningDays,
    );
    return { ...c, expiryStatuses, warningTiers, isDoNotBook, isExpiringSoon, isFirstWarning, isSecondWarning };
  });
}

// ---------- Smart Excel Import ----------
const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['name', 'full name', 'fullname', 'candidate name', 'candidate', 'employee name', 'worker name'],
  job_title: ['job role', 'role', 'position', 'title', 'designation', 'job title', 'job'],
  email: ['email', 'email address', 'e-mail', 'email id', 'mail'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'telephone', 'tel', 'contact', 'contact number'],
  status: ['status', 'current status', 'employment status'],
  remark: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'zoho remark', 'no zoho remark'],
  dbs_expiry_date: ['dbs expiry', 'dbs expiry date', 'dbs', 'dbs check expiry', 'dbs expiration', 'dbs exp', 'dbs check'],
  passport_expiry_date: ['passport expiry', 'passport expiry date', 'passport', 'passport expiration', 'passport exp'],
  rtw_expiry_date: ['rtw expiry', 'rtw expiry date', 'rtw', 'right to work expiry', 'right to work', 'rtw expiration', 'rtw exp'],
  pmva_expiry_date: ['pmva expiry', 'pmva expiry date', 'pmva', 'pmva expiration', 'pmva exp'],
  training_expiry_date: [
    'training expiry',
    'training expiry date',
    'training',
    'training expiration',
    'training exp',
    'mandatory training',
    'mandatory training date',
    'mandatory training expiry',
    'mandatory training expiry date',
    'mandatory trainings date',
    'mandatory trainings expiry',
  ],
  evisa_expiry_date: [
    'evisa',
    'evisa expiry',
    'evisa expiry date',
    'e-visa',
    'e-visa expiry',
    'e-visa expiry date',
    'visa expiry',
    'visa expiry date',
  ],
};

const KNOWN_FIELDS = new Set(Object.keys(HEADER_ALIASES));

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, ' ').replace(/[^a-z0-9 /]/g, '').trim();
}

function detectColumnMapping(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(normalized) || normalized === field) {
        mapping[i] = field;
        break;
      }
    }
  }
  return mapping;
}

function parseDateValue(val: string): string | null {
  if (!val || !val.trim()) return null;
  const trimmed = val.trim();
  const ukMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (ukMatch) {
    const [, d, m, y] = ukMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) return trimmed;
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

function normalizeStatus(raw: string): CandidateStatus {
  const status = raw.trim().toLowerCase();

  // Check specific statuses before "active"
  if (
    status.includes('no zoho') ||
    status.includes('no_zoho') ||
    status.includes('no-zoho')
  ) {
    return 'no_zoho_remark';
  }

  if (status.includes('inactive')) {
    return 'inactive';
  }

  if (status.includes('active')) {
    return 'active';
  }

  if (status.includes('pending')) {
    return 'pending';
  }

  if (status.includes('archive')) {
    return 'archived';
  }

  return 'active';
}

export function parseImportData(rawText: string): { rows: ParsedImportRow[]; mapping: Record<number, string>; headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = rawText.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], mapping: {}, headers: [], warnings: ['Need at least a header row and one data row.'] };
  }

  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delim = tabCount > commaCount ? '\t' : ',';

  const headers = firstLine.split(delim).map((h) => h.trim());
  const mapping = detectColumnMapping(headers);

  if (!Object.values(mapping).includes('full_name')) {
    warnings.push('No "Name" column detected — this is a mandatory field.');
  }

  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((c) => c.trim());
    const row: Partial<ParsedImportRow> = { extra_data: {} };

    for (let j = 0; j < headers.length; j++) {
      const field = mapping[j];
      const value = cells[j] ?? '';
      if (!field) {
        // Extra column - store in extra_data
        if (value && headers[j]) {
          (row.extra_data!)[headers[j]] = value;
        }
        continue;
      }
      switch (field) {
        case 'full_name': row.full_name = value; break;
        case 'job_title': row.job_title = value || null; break;
        case 'email': row.email = value || null; break;
        case 'phone': row.phone = value || null; break;
        case 'status': row.status = value ? normalizeStatus(value) : 'active'; break;
        case 'remark': row.remark = value || null; break;
        case 'dbs_expiry_date': row.dbs_expiry_date = parseDateValue(value); break;
        case 'passport_expiry_date': row.passport_expiry_date = parseDateValue(value); break;
        case 'rtw_expiry_date': row.rtw_expiry_date = parseDateValue(value); break;
        case 'pmva_expiry_date': row.pmva_expiry_date = parseDateValue(value); break;
        case 'training_expiry_date': row.training_expiry_date = parseDateValue(value); break;
        case 'evisa_expiry_date': row.evisa_expiry_date = parseDateValue(value); break;
      }
    }

    if (row.full_name) {
      const hasExpiredRequiredDocument = [
        row.dbs_expiry_date,
        row.passport_expiry_date,
        row.rtw_expiry_date,
        row.evisa_expiry_date,
        row.pmva_expiry_date,
        row.training_expiry_date,
      ].some((date) => {
        if (!date) return false;
        const days = daysUntilExpiry(date);
        return days !== null && days < 0;
      });
      rows.push({
        full_name: row.full_name,
        job_title: row.job_title ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        status: hasExpiredRequiredDocument ? 'inactive' : ((row.status as CandidateStatus) ?? 'active'),
        remark: row.remark ?? null,
        dbs_expiry_date: row.dbs_expiry_date ?? null,
        passport_expiry_date: row.passport_expiry_date ?? null,
        rtw_expiry_date: row.rtw_expiry_date ?? null,
        evisa_expiry_date: row.evisa_expiry_date ?? null,
        pmva_expiry_date: row.pmva_expiry_date ?? null,
        training_expiry_date: row.training_expiry_date ?? null,
        extra_data: row.extra_data ?? {},
      });
    }
  }

  return { rows, mapping, headers, warnings };
}

export async function detectDuplicates(
  rows: ParsedImportRow[],
  existing: Candidate[],
): Promise<ImportPreview[]> {
  return rows.map((row) => {
    const match = existing.find(
      (c) =>
        (row.email && c.email?.toLowerCase() === row.email.toLowerCase()) ||
        (row.phone && c.phone === row.phone),
    );
    return {
      row,
      existing: match ?? null,
      isDuplicate: !!match,
      resolution: match ? 'pending' : 'create',
    };
  });
}

export async function commitImport(
  previews: ImportPreview[],
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of previews) {
    if (p.resolution === 'skip') {
      skipped++;
      continue;
    }
    if (p.resolution === 'update' && p.existing) {
      // IMMUTABLE: only update expiry dates, NOT email/phone
      await updateCandidate(p.existing.id, {
        full_name: p.row.full_name,
        job_title: p.row.job_title,
        status: p.row.status as CandidateStatus,
        remark: p.row.remark,
        dbs_expiry_date: p.row.dbs_expiry_date,
        passport_expiry_date: p.row.passport_expiry_date,
        rtw_expiry_date: p.row.rtw_expiry_date,
        evisa_expiry_date: p.row.evisa_expiry_date,
        pmva_expiry_date: p.row.pmva_expiry_date,
        training_expiry_date: p.row.training_expiry_date,
        extra_data: p.row.extra_data,
      });
      updated++;
    } else if (p.resolution === 'create') {
      await createCandidate({
        full_name: p.row.full_name,
        role: 'Healthcare Professional',
        job_title: p.row.job_title,
        email: p.row.email,
        phone: p.row.phone,
        status: p.row.status as CandidateStatus,
        remark: p.row.remark,
        dbs_expiry_date: p.row.dbs_expiry_date,
        passport_expiry_date: p.row.passport_expiry_date,
        rtw_expiry_date: p.row.rtw_expiry_date,
        evisa_expiry_date: p.row.evisa_expiry_date,
        pmva_expiry_date: p.row.pmva_expiry_date,
        training_expiry_date: p.row.training_expiry_date,
        extra_data: p.row.extra_data,
      });
      created++;
    }
  }

  await createAuditLog('batch.import', 'system', null, `Imported: ${created} created, ${updated} updated, ${skipped} skipped`);
  return { created, updated, skipped };
}

// ---------- File parsing (xlsx/csv) ----------
import { readSheet } from 'read-excel-file/browser';

function normalizeSpreadsheetRows(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          String(cell ?? '')
            .replace(/\r\n|\r|\n/g, ' ')
            .replace(/\t/g, ' ')
            .trim(),
        )
        .join('\t'),
    )
    .join('\n');
}

export async function parseExcelFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv' || ext === 'txt') {
    return await file.text();
  }

  if (ext === 'xls') {
    const data = await file.arrayBuffer();
    const XLSX = await import('sheetjs-style');
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    return normalizeSpreadsheetRows(rows);
  }

  const rows = await readSheet(file);
  return normalizeSpreadsheetRows(rows as unknown[][]);
}

// ---------- OCR Document Scanner ----------
export interface OCRResult {
  dates: string[];
  documentType: string | null;
  verified: boolean;
  rawText: string;
}

export async function scanDocument(file: File): Promise<OCRResult> {
  const Tesseract = (await import('tesseract.js')).default ?? (await import('tesseract.js'));
  const result = await Tesseract.recognize(file, 'eng');
  const rawText = result.data.text || '';

  // Extract dates (DD/MM/YYYY, YYYY-MM-DD, etc.)
  const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g;
  const dates = [...rawText.matchAll(dateRegex)].map((m) => m[0]);

  // Detect document type
  const lower = rawText.toLowerCase();
  let documentType: string | null = null;
  if (lower.includes('dbs')) documentType = 'DBS';
  else if (lower.includes('passport')) documentType = 'Passport';
  else if (lower.includes('right to work') || lower.includes('rtw')) documentType = 'RTW';
  else if (lower.includes('pmva')) documentType = 'PMVA';
  else if (lower.includes('training')) documentType = 'Training';

  // Check verification
  const verified = /passed|completed|verified|approved/i.test(rawText);

  return { dates, documentType, verified, rawText };
}

// ---------- Reports ----------
export function exportToCSV(candidates: CandidateWithExpiry[]): string {
  const headers = [
    'Full Name', 'Job Role', 'Role', 'Email', 'Phone', 'Status', 'Remark',
    'DBS Expiry', 'Passport Expiry', 'RTW Expiry', 'eVisa Expiry', 'PMVA Expiry', 'Training Expiry',
    'PMVA Verified', 'Training Verified', 'Do Not Book',
  ];
  const rows = candidates.map((c) => [
    c.full_name,
    c.job_title ?? '',
    c.role,
    c.email ?? '',
    c.phone ?? '',
    c.status,
    c.remark ?? '',
    c.dbs_expiry_date ?? '',
    c.passport_expiry_date ?? '',
    c.rtw_expiry_date ?? '',
    c.evisa_expiry_date ?? '',
    c.pmva_expiry_date ?? '',
    c.training_expiry_date ?? '',
    c.pmva_verification_completed ? 'Yes' : 'No',
    c.training_verification_completed ? 'Yes' : 'No',
    c.isDoNotBook ? 'Yes' : 'No',
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return csv;
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- Profile helpers ----------
export async function fetchProfile(): Promise<Profile | null> {
  const { id } = await getCurrentUser();
  if (!id) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(displayName: string, avatarUrl: string): Promise<void> {
  const trimmedName = displayName.trim();
  const trimmedAvatar = avatarUrl?.trim() || null;
  const { error } = await supabase.rpc('upsert_profile', {
    p_display_name: trimmedName,
    p_avatar_url: trimmedAvatar,
  });
  if (error) throw error;
}

// ---------- Trust / Client helpers ----------
export function getTrustOptions(candidates: Candidate[]): string[] {
  const trusts = new Set<string>();
  for (const c of candidates) {
    const extra = c.extra_data as Record<string, string> | null;
    if (!extra) continue;
    for (const key of Object.keys(extra)) {
      const lower = key.toLowerCase();
      if (lower.includes('trust') || lower.includes('client') || lower.includes('hospital') || lower.includes('trust/client') || lower.includes('trust / client')) {
        const val = extra[key];
        if (val && val.trim()) trusts.add(val.trim());
      }
    }
  }
  return Array.from(trusts).sort();
}

export function getTrustValue(candidate: Candidate): string | null {
  const extra = candidate.extra_data as Record<string, string> | null;
  if (!extra) return null;
  for (const key of Object.keys(extra)) {
    const lower = key.toLowerCase();
    if (lower.includes('trust') || lower.includes('client') || lower.includes('hospital')) {
      const val = extra[key];
      if (val && val.trim()) return val.trim();
    }
  }
  return null;
}

// ---------- Chase Centre helpers ----------
export function getRegularChasingCandidates(
  candidates: CandidateWithExpiry[],
  chaseActions: ChaseActionEntry[],
  docType: DocumentType | 'all',
  tier: 'first' | 'second' | 'all' = 'all',
): ChaseCandidateItem[] {
  const eligibleStatuses: CandidateStatus[] = ['active', 'no_zoho_remark'];
  const fields: DocumentType[] = ['dbs', 'passport', 'rtw', 'evisa', 'pmva', 'training'];

  const latestActions = chaseActions.reduce<Record<string, ChaseActionEntry>>((acc, action) => {
    const key = `${action.candidate_id}:${action.document_type}`;
    const existing = acc[key];
    if (!existing || new Date(action.created_at) > new Date(existing.created_at)) {
      acc[key] = action;
    }
    return acc;
  }, {});

  return candidates.flatMap((c) => {
    if (c.goodbye_email_sent) return [];
    if (!eligibleStatuses.includes(c.status)) return [];

    const visibleFields = docType === 'all' ? fields : [docType];

    return visibleFields.flatMap((field) => {
      const complianceField = DOCUMENT_TYPE_TO_FIELD[field];
      const expiryDate = c[complianceField] as string | null;
      if (!expiryDate) return [];
      if (c.expiryStatuses[complianceField] !== 'expiring') return [];

      const warningTier = c.warningTiers[complianceField];
      if (tier === 'first' && warningTier !== 'first') return [];
      if (tier === 'second' && warningTier !== 'second') return [];

      const completedMatch = chaseActions.some(
        (action) =>
          action.action === 'completed' &&
          action.candidate_id === c.id &&
          action.document_type === field &&
          action.expiry_date === expiryDate,
      );
      if (completedMatch) return [];

      const latestAction = latestActions[`${c.id}:${field}`] ?? null;

      return [{
        candidate: c,
        documentType: field,
        expiryField: complianceField,
        expiryDate,
        expiryStatus: c.expiryStatuses[complianceField],
        warningTier,
        latestAction,
      }];
    });
  });
}

export function getBookingWarningCandidates(
  candidates: CandidateWithExpiry[],
  docType: DocumentType | 'all',
  tier: 'first' | 'second' | 'all' = 'all',
): ChaseCandidateItem[] {
  const eligibleStatuses: CandidateStatus[] = ['active', 'no_zoho_remark'];
  const fields: DocumentType[] = ['dbs', 'passport', 'rtw', 'evisa', 'pmva', 'training'];

  return candidates.flatMap((c) => {
    if (c.goodbye_email_sent) return [];
    if (!eligibleStatuses.includes(c.status)) return [];

    const visibleFields = docType === 'all' ? fields : [docType];

    return visibleFields.flatMap((field) => {
      const complianceField = DOCUMENT_TYPE_TO_FIELD[field];
      const expiryDate = c[complianceField] as string | null;
      if (!expiryDate) return [];
      if (c.expiryStatuses[complianceField] === 'expired') return [];

      const warningTier = c.warningTiers[complianceField];
      if (warningTier === 'none') return [];
      if (tier === 'first' && warningTier !== 'first') return [];
      if (tier === 'second' && warningTier !== 'second') return [];

      return [{
        candidate: c,
        documentType: field,
        expiryField: complianceField,
        expiryDate,
        expiryStatus: c.expiryStatuses[complianceField],
        warningTier,
        latestAction: null,
      }];
    });
  });
}

export function verifyChaseExampleLogic(): void {
  const getDateString = (daysAhead: number) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() + daysAhead);
    return now.toISOString().split('T')[0];
  };

  const baseCandidate: Candidate = {
    id: 'test',
    user_id: 'test-user',
    full_name: 'Test Candidate',
    role: 'Nurse',
    job_title: null,
    email: null,
    phone: null,
    status: 'active',
    remark: null,
    goodbye_email_sent: false,
    notes: null,
    dbs_expiry_date: null,
    passport_expiry_date: null,
    rtw_expiry_date: null,
    evisa_expiry_date: null,
    pmva_expiry_date: null,
    training_expiry_date: null,
    pmva_verification_completed: false,
    training_verification_completed: false,
    extra_data: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const noZohoDbs: Candidate = {
    ...baseCandidate,
    id: 'nozoho-dbs',
    status: 'no_zoho_remark',
    dbs_expiry_date: getDateString(25),
  };

  const activeTraining: Candidate = {
    ...baseCandidate,
    id: 'active-training',
    training_expiry_date: getDateString(25),
  };

  const enriched = enrichCandidates([noZohoDbs, activeTraining], null);

  const regularDbs = getRegularChasingCandidates(enriched, [], 'dbs', 'all');
  const regularTraining = getRegularChasingCandidates(enriched, [], 'training', 'all');

  if (!regularDbs.some((item) => item.candidate.id === 'nozoho-dbs')) {
    throw new Error('Diagnostic failure: No Zoho DBS candidate with 25 days remaining should be included in regular chasing.');
  }

  if (regularTraining.some((item) => item.candidate.id === 'active-training')) {
    throw new Error('Diagnostic failure: Training candidate with 25 days remaining should not be included in regular chasing until 20 days remain.');
  }
}

export function getDoNotBookCandidates(
  candidates: CandidateWithExpiry[],
): CandidateWithExpiry[] {
  return candidates.filter((candidate) => {
    return (
      candidate.status === 'active' &&
      !candidate.goodbye_email_sent &&
      !COMPLIANCE_DATE_FIELDS.some((field) => candidate.expiryStatuses[field] === 'expired') &&
      candidate.isDoNotBook
    );
  });
}

// ---------- BD Time / Shift helpers ----------
export function getBDTime(): Date {
  const now = new Date();
  // UTC+6
  const bdMs = now.getTime() + (6 * 60 * 60 * 1000);
  return new Date(bdMs);
}

export function getBDHour(): number {
  return getBDTime().getUTCHours();
}

export function getShiftSubHeader(): string {
  const hour = getBDHour();
  const subHeaders: Record<number, string> = {
    13: '1:00 PM — Shift started. Avengers... assemble.',
    14: '2:00 PM — Open 14 tabs. Activate stealth mode.',
    15: '3:00 PM — Afternoon slump. Losing battery fast, need the Arc Reactor.',
    16: '4:00 PM — Halfway point! I can do this all day.',
    17: '5:00 PM — 9-to-5ers leaving. Blipped out of existence.',
    18: '6:00 PM — Running on coffee and pure Vibranium.',
    19: '7:00 PM — Unscrunch your shoulders! Hulk smash stress.',
    20: '8:00 PM — Brain entering sleep mode... Multiverse collapsing.',
    21: '9:00 PM — Final hour! Do NOT start a new task—it\u2019s a Nexus event.',
    22: '10:00 PM — End of the line. Drop the hammer and leave!',
  };
  return subHeaders[hour] ?? '';
}

export type ShiftAlertType = 'before' | 'after' | null;

export function getShiftAlert(): ShiftAlertType {
  const hour = getBDHour();
  if (hour < 13) return 'before';
  if (hour >= 22) return 'after';
  return null;
}

export function getGreeting(): string {
  return 'Rise and Shine, Maintenance Team! \u2728';
}
