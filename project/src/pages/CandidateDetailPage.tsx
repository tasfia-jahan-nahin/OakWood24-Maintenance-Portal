import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  FileScan,
  Mail,
  Phone,
  Pencil,
  ScanLine,
  ShieldCheck,
  Trash2,
  UserCircle,
  XCircle,
  Lock,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { showStatusPopup } from '@/components/StatusPopup';
import {
  daysUntilExpiry,
  deleteCandidate,
  enrichCandidates,
  fetchCandidates,
  fetchReminderSettings,
  getExpiryBadgeText,
  scanDocument,
  updateCandidate,
  type OCRResult,
} from '@/lib/api';
import {
  type Candidate,
  type CandidateStatus,
  type CandidateWithExpiry,
  type ComplianceDateField,
  type ReminderSettings,
} from '@/types';
import {
  CANDIDATE_STATUSES,
  COMPLIANCE_DATE_FIELDS,
  COMPLIANCE_DATE_LABELS,
  STATUS_LABELS,
} from '@/types';

type EditField =
  | 'dbs_expiry_date' | 'passport_expiry_date' | 'rtw_expiry_date'
  | 'pmva_expiry_date' | 'training_expiry_date'
  | 'status' | 'remark' | 'job_title' | 'full_name';

interface Props {
  candidateId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  editMode?: boolean;
}

export function CandidateDetailPage({ candidateId, onBack, editMode }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<number>(0);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cands, s] = await Promise.all([fetchCandidates(), fetchReminderSettings()]);
      setCandidates(cands);
      setSettings(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (editMode) setEditOpen(true);
  }, [load, editMode]);

  const enriched = useMemo(() => enrichCandidates(candidates, settings), [candidates, settings]);
  const candidate = enriched.find((c) => c.id === candidateId) ?? null;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  if (!candidate) {
    return (
      <EmptyState
        icon={<UserCircle size={28} />}
        title="Candidate not found"
        action={<Button onClick={onBack} size="sm">Go back</Button>}
      />
    );
  }

  const handleDelete = async () => {
    await deleteCandidate(candidate.id);
    onBack();
  };

  const handleQuickStatus = async (status: CandidateStatus) => {
    setActionLoading(true);
    try {
      const remark = status === 'inactive' ? 'Goodbye Email Sent' : candidate.remark;
      await updateCandidate(candidate.id, { status, remark }, candidate.full_name);
      if (status === 'active') showStatusPopup('active', candidate.full_name);
      else if (status === 'inactive') showStatusPopup('inactive', candidate.full_name);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGoodbye = async () => {
    setActionLoading(true);
    try {
      await updateCandidate(candidate.id, {
        status: 'inactive',
        remark: 'Goodbye Email Sent',
      }, candidate.full_name);
      showStatusPopup('goodbye', candidate.full_name);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOcrScan = async (file: File) => {
    setOcrLoading(true);
    try {
      const result = await scanDocument(file);
      setOcrResult(result);
      setOcrOpen(true);
    } catch (err) {
      console.error('OCR error:', err);
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-pink-500 hover:text-pink-700 font-medium mb-4 transition-colors">
        <ArrowLeft size={16} /> Back to Candidates
      </button>

      {/* Header card */}
      <Card className={`mb-6 ${candidate.goodbye_email_sent ? 'opacity-70' : ''}`}>
        <CardBody className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-pink-200 flex items-center justify-center text-pink-700 font-bold text-2xl shrink-0">
              {candidate.full_name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-pink-900">{candidate.full_name}</h1>
                {candidate.goodbye_email_sent ? (
                  <Badge tone="archived">Archived</Badge>
                ) : candidate.isDoNotBook ? (
                  <Badge tone="expired" dot>Do Not Book</Badge>
                ) : candidate.status === 'active' ? (
                  <Badge tone="active">Active</Badge>
                ) : candidate.status === 'inactive' ? (
                  <Badge tone="inactive">Inactive</Badge>
                ) : candidate.status === 'no_zoho_remark' ? (
                  <Badge tone="pending">No Zoho</Badge>
                ) : (
                  <Badge tone="neutral">{STATUS_LABELS[candidate.status]}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {candidate.job_title && (
                  <span className="text-sm font-medium text-pink-600 bg-pink-100 px-2.5 py-0.5 rounded-full">
                    {candidate.job_title}
                  </span>
                )}
                <p className="text-pink-500 text-sm">{candidate.role}</p>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-pink-600">
                {candidate.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail size={14} /> {candidate.email}
                    <Lock size={10} className="text-pink-300" />
                  </span>
                )}
                {candidate.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={14} /> {candidate.phone}
                    <Lock size={10} className="text-pink-300" />
                  </span>
                )}
              </div>
              {candidate.remark && (
                <p className="mt-3 text-sm text-pink-600 bg-pink-50 rounded-xl p-3 border border-pink-100">
                  <span className="font-semibold">Remark:</span> {candidate.remark}
                </p>
              )}
              {/* Extra data from Excel */}
              {candidate.extra_data && Object.keys(candidate.extra_data).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(candidate.extra_data).map(([key, val]) => (
                    <span key={key} className="text-xs text-pink-500 bg-cream-100 px-2 py-1 rounded-lg">
                      <span className="font-medium">{key}:</span> {val}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={16} /> Edit
              </Button>
              <Button variant="outline" size="sm" loading={ocrLoading} onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/png,image/jpeg,.txt';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleOcrScan(file);
                };
                input.click();
              }}>
                <ScanLine size={16} /> Scan Doc
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteStep(1)} className="text-danger-600 hover:bg-danger-50">
                <Trash2 size={16} />
              </Button>
            </div>
          </div>

          {/* Quick status actions */}
          {!candidate.goodbye_email_sent && (
            <div className="mt-4 pt-4 border-t border-pink-100 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={actionLoading} onClick={() => handleQuickStatus('active')}>
                <CheckCircle2 size={14} /> Active
              </Button>
              <Button size="sm" variant="outline" loading={actionLoading} onClick={() => handleQuickStatus('inactive')}>
                <XCircle size={14} /> Inactive
              </Button>
              <Button size="sm" variant="outline" loading={actionLoading} onClick={() => handleQuickStatus('no_zoho_remark')}>
                No Zoho
              </Button>
              <Button size="sm" variant="outline" loading={actionLoading} onClick={handleGoodbye}>
                Goodbye Email Sent
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Compliance items */}
      <Card>
        <CardHeader><CardTitle>Compliance Documents</CardTitle></CardHeader>
        <CardBody>
          <div className="space-y-2">
            {COMPLIANCE_DATE_FIELDS.map((field) => {
              const status = candidate.expiryStatuses[field];
              const days = daysUntilExpiry(candidate[field]);
              const verified = field === 'pmva_expiry_date' ? candidate.pmva_verification_completed : field === 'training_expiry_date' ? candidate.training_verification_completed : true;
              const reminderDays = field === 'training_expiry_date' ? 20 : 30;
              const badgeText = getExpiryBadgeText(candidate[field], reminderDays);
              return (
                <div key={field} className="flex items-center gap-3 p-3.5 rounded-xl border border-pink-100 hover:bg-pink-50 transition-all-soft">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    status === 'expired' ? 'bg-rose-100 text-rose-700'
                      : status === 'expiring' ? 'bg-amber-100 text-amber-700'
                      : status === 'valid' ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-pink-100 text-pink-400'
                  }`}>
                    <ShieldCheck size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-pink-900">{COMPLIANCE_DATE_LABELS[field]}</p>
                    <div className="flex items-center gap-3 text-xs text-pink-400 mt-0.5">
                      {candidate[field] ? (
                        <span>Expires: {new Date(candidate[field] as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      ) : (
                        <span>No date set</span>
                      )}
                      {!verified && (field === 'pmva_expiry_date' || field === 'training_expiry_date') && (
                        <span className="text-danger-500 font-medium">Not verified</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {status === 'missing' ? (
                      <Badge tone="neutral">Missing</Badge>
                    ) : status === 'expired' ? (
                      <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-700 border border-rose-500/20">
                        {badgeText}
                      </span>
                    ) : status === 'expiring' ? (
                      <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-500/20">
                        {badgeText}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-500/20">
                        {badgeText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Guided Editor Modal */}
      <GuidedEditorModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        candidate={candidate}
        onSaved={load}
      />

      {/* OCR Confirmation Modal */}
      <Modal
        open={ocrOpen}
        onClose={() => { setOcrOpen(false); setOcrResult(null); }}
        title="Extracted Document Data"
        description="Is this correct?"
        size="md"
      >
        {ocrResult && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                <FileScan size={20} />
              </div>
              <div className="flex-1 space-y-2">
                {ocrResult.documentType && (
                  <p className="text-sm text-pink-700">
                    <span className="font-semibold">Document Type:</span> {ocrResult.documentType}
                  </p>
                )}
                {ocrResult.dates.length > 0 && (
                  <p className="text-sm text-pink-700">
                    <span className="font-semibold">Dates Found:</span> {ocrResult.dates.join(', ')}
                  </p>
                )}
                <p className="text-sm text-pink-700">
                  <span className="font-semibold">Verification:</span>{' '}
                  {ocrResult.verified ? (
                    <span className="text-success-600">Passed/Completed</span>
                  ) : (
                    <span className="text-warning-600">Not detected</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setOcrOpen(false); setOcrResult(null); }}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => { setOcrOpen(false); setOcrResult(null); setEditOpen(true); }}>
                Edit Manually
              </Button>
              <Button onClick={() => { setOcrOpen(false); setOcrResult(null); setEditOpen(true); }}>
                Yes, Update Candidate
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Two-step delete */}
      <Modal
        open={deleteStep > 0}
        onClose={() => setDeleteStep(0)}
        title={deleteStep === 1 ? 'Delete Candidate' : 'Final Confirmation'}
        size="sm"
      >
        {deleteStep === 1 ? (
          <div className="space-y-4">
            <p className="text-sm text-pink-700">
              Are you sure you want to delete <span className="font-semibold">{candidate.full_name}</span>?
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteStep(0)}>Cancel</Button>
              <Button variant="danger" onClick={() => setDeleteStep(2)}>Delete</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger-500 text-white flex items-center justify-center shrink-0">
                <Ban size={20} />
              </div>
              <p className="text-sm text-pink-700">
                This action cannot be undone. Are you absolutely sure you want to permanently delete{' '}
                <span className="font-semibold">{candidate.full_name}</span>?
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteStep(0)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Yes, delete permanently</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Guided Editor ----------
function GuidedEditorModal({
  open,
  onClose,
  candidate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  candidate: CandidateWithExpiry;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [field, setField] = useState<EditField | null>(null);
  const [value, setValue] = useState('');
  const [verified, setVerified] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('select');
      setField(null);
      setValue('');
      setVerified(null);
      setError(null);
    }
  }, [open]);

  const fieldOptions: { key: EditField; label: string }[] = [
    { key: 'dbs_expiry_date', label: 'DBS Expiry' },
    { key: 'passport_expiry_date', label: 'Passport Expiry' },
    { key: 'rtw_expiry_date', label: 'RTW Expiry' },
    { key: 'pmva_expiry_date', label: 'PMVA Expiry' },
    { key: 'training_expiry_date', label: 'Training Expiry' },
    { key: 'status', label: 'Status' },
    { key: 'remark', label: 'Remark' },
    { key: 'job_title', label: 'Job Role' },
    { key: 'full_name', label: 'Full Name' },
  ];

  const isDateField = field && COMPLIANCE_DATE_FIELDS.includes(field as ComplianceDateField);
  const needsVerification = field === 'pmva_expiry_date' || field === 'training_expiry_date';

  const handleSelect = (f: EditField) => {
    setField(f);
    const currentVal = candidate[f as keyof Candidate] as unknown;
    setValue(typeof currentVal === 'string' ? currentVal : '');
    setVerified(null);
    setStep('edit');
  };

  const handleSave = async () => {
    if (!field) return;
    setSaving(true);
    setError(null);
    try {
      const update: Record<string, unknown> = { [field]: value || null };
      if (field === 'pmva_expiry_date') update.pmva_verification_completed = verified ?? false;
      if (field === 'training_expiry_date') update.training_verification_completed = verified ?? false;
      await updateCandidate(candidate.id, update, candidate.full_name);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Candidate" size="md">
      {step === 'select' ? (
        <div className="space-y-4">
          <p className="text-sm text-pink-600 text-center">What would you like to update?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fieldOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSelect(opt.key)}
                className="px-3 py-3 rounded-xl border border-pink-100 bg-white text-sm font-medium text-pink-700 hover:bg-pink-50 hover:border-pink-200 transition-all-soft text-center"
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Immutable notice */}
          <div className="flex items-center gap-2 rounded-xl bg-cream-100 border border-pink-100 px-4 py-3 text-xs text-pink-500">
            <Lock size={14} className="shrink-0" />
            Email and Phone are locked and cannot be edited. They are set during import only.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-pink-900">
              Updating: {fieldOptions.find((o) => o.key === field)?.label}
            </p>
            <button onClick={() => setStep('select')} className="text-xs text-pink-500 hover:text-pink-700 font-medium">
              Change field
            </button>
          </div>

          {field === 'status' ? (
            <Select label="New Status" value={value} onChange={(e) => setValue(e.target.value)}>
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          ) : isDateField ? (
            <Input
              type="date"
              label="New Expiry Date"
              value={value ? value.split('T')[0] : ''}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <Input
              label={`New ${fieldOptions.find((o) => o.key === field)?.label}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}

          {needsVerification && (
            <div>
              <label className="block mb-1.5 text-sm font-medium text-pink-800">
                Was verification obtained?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVerified(true)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all-soft ${
                    verified === true ? 'bg-success-100 text-success-700 border border-success-500/30' : 'bg-white text-pink-600 border border-pink-100'
                  }`}
                >
                  <CheckCircle2 size={16} className="inline mr-1.5" /> Yes
                </button>
                <button
                  onClick={() => setVerified(false)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all-soft ${
                    verified === false ? 'bg-danger-100 text-danger-600 border border-danger-500/30' : 'bg-white text-pink-600 border border-pink-100'
                  }`}
                >
                  <XCircle size={16} className="inline mr-1.5" /> No
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={needsVerification && verified === null}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
