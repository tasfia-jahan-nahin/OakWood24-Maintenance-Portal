import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Pencil,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
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
  type ReminderSettings,
} from '@/types';
import { COMPLIANCE_DATE_FIELDS, COMPLIANCE_DATE_LABELS } from '@/types';

interface Props {
  onEdit: (id: string) => void;
}

export function DoNotBookPage({ onEdit }: Props) {
  const [candidates, setCandidates] = useState<CandidateWithExpiry[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cands, s] = await Promise.all([fetchCandidates(), fetchReminderSettings()]);
      setCandidates(enrichCandidates(cands, s));
      setSettings(s);
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

  const handleResolve = async (candidate: CandidateWithExpiry) => {
    setResolving(candidate.id);
    try {
      // Clear all expired dates by setting them to null — effectively resolving the DNB flag
      const update: Record<string, unknown> = {};
      for (const field of COMPLIANCE_DATE_FIELDS) {
        if (candidate.expiryStatuses[field] === 'expired') {
          update[field] = null;
        }
      }
      await updateCandidate(candidate.id, update, candidate.full_name);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setResolving(null);
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

      {dnbCandidates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 size={28} />}
            title="No Do Not Book flags"
            description="All candidates are compliant. Expired documents past the threshold will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {dnbCandidates.map((c, i) => {
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
                      <Button size="sm" variant="primary" loading={resolving === c.id} onClick={() => handleResolve(c)}>
                        <CheckCircle2 size={14} /> Resolve
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
