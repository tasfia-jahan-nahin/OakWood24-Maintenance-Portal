import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Mail,
  Pencil,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { DNB_EMAIL_FIELD, doNotBookFollowUpKey } from '@/lib/candidateFollowUp';
import {
  daysUntilExpiry,
  enrichCandidates,
  fetchCandidates,
  fetchReminderSettings,
  getDoNotBookCandidates,
  updateCandidate,
} from '@/lib/api';
import {
  type CandidateWithExpiry,
  type ComplianceDateField,
} from '@/types';
import { COMPLIANCE_DATE_FIELDS, COMPLIANCE_DATE_LABELS } from '@/types';

interface Props {
  onEdit: (id: string) => void;
}

export function DoNotBookPage({ onEdit }: Props) {
  const [candidates, setCandidates] = useState<CandidateWithExpiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    try {
      const [cands, s] = await Promise.all([fetchCandidates(), fetchReminderSettings()]);
      setCandidates(enrichCandidates(cands, s));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dnbCandidates = useMemo(() => getDoNotBookCandidates(candidates), [candidates]);
  const pending = dnbCandidates.filter((candidate) =>
    candidate.extra_data?.[DNB_EMAIL_FIELD] !== doNotBookFollowUpKey(candidate),
  );

  const handleEmailFollowUp = async (candidate: CandidateWithExpiry) => {
    setSaving(candidate.id);
    setSaveError('');
    try {
      const updated = await updateCandidate(candidate.id, {
        extra_data: { [DNB_EMAIL_FIELD]: doNotBookFollowUpKey(candidate) },
      }, candidate.full_name);
      setCandidates((current) => current.map((entry) =>
        entry.id === candidate.id ? { ...entry, extra_data: updated.extra_data } : entry,
      ));
    } catch (err) {
      console.error(err);
      setSaveError('Could not record the email follow-up. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Do Not Book Register"
        subtitle="Candidates flagged because documents are expired past the threshold or unverified."
      />

      {saveError && <p role="alert" className="mb-4 text-sm text-danger-600">{saveError}</p>}
      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 size={28} />}
            title="No pending Do Not Book follow-ups"
            description="Candidates stay flagged until their underlying compliance issue is fixed."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((c, i) => {
            const expiredFields = COMPLIANCE_DATE_FIELDS.filter(
              (f) => c.expiryStatuses[f] === 'expired',
            );
            const unverifiedFields: ComplianceDateField[] = [];
            if (c.pmva_expiry_date && !c.pmva_verification_completed) unverifiedFields.push('pmva_expiry_date');
            if (c.training_expiry_date && !c.training_verification_completed) unverifiedFields.push('training_expiry_date');

            return (
              <Card key={c.id} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)} border-danger-500/20`}>
                <CardBody className="pt-4 pb-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Candidate */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center shrink-0">
                        <Ban size={20} />
                      </div>
                      <div className="min-w-0">
                        <button onClick={() => onEdit(c.id)} className="text-sm font-semibold text-pink-900 hover:text-pink-700 truncate block text-left">
                          {c.full_name}
                        </button>
                        <p className="text-xs text-pink-400 truncate">{c.role}</p>
                      </div>
                    </div>

                    {/* Reasons */}
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {expiredFields.map((f) => {
                        const days = daysUntilExpiry(c[f]);
                        return (
                          <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-danger-100 text-danger-600 text-xs font-medium">
                            <XCircle size={12} />
                            {COMPLIANCE_DATE_LABELS[f]} {days !== null && days < 0 ? `Expired ${Math.abs(days)}d ago` : 'Expired'}
                          </span>
                        );
                      })}
                      {unverifiedFields.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-warning-100 text-warning-600 text-xs font-medium">
                          <ShieldCheck size={12} />
                          {COMPLIANCE_DATE_LABELS[f]} unverified
                        </span>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => onEdit(c.id)}>
                        <Pencil size={14} /> Edit
                      </Button>
                      <Button size="sm" variant="primary" disabled={saving !== null} loading={saving === c.id} onClick={() => handleEmailFollowUp(c)}>
                        <Mail size={14} /> Send Email
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
