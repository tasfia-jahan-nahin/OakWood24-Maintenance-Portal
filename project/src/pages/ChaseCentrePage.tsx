import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Zap,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { NmcPinReminder } from '@/components/NmcPinReminder';
import { Input, Textarea } from '@/components/ui/Input';
import { documentRemarkField, getDocumentRemark } from '@/lib/candidateFollowUp';
import { getMedComp, MEDCOMP_EXPIRY_FIELD } from '@/lib/medcomp';
import { portalToday } from '@/lib/monthlyExpirations';
import { SkeletonCard } from '@/components/PinkPixel';
import {
  addChaseAction,
  daysUntilExpiry,
  enrichCandidates,
  fetchCandidates,
  fetchChaseActions,
  fetchReminderSettings,
  getRegularChasingCandidates,
  updateCandidate,
} from '@/lib/api';
import {
  type ChaseAction,
  type CandidateWithExpiry,
  type ChaseActionEntry,
  type ChaseCandidateItem,
  type ChaseDocumentType,
  type ReminderSettings,
} from '@/types';
import { CHASE_DOCUMENT_LABELS, DOCUMENT_TYPE_TO_FIELD, STATUS_LABELS } from '@/types';

type Tab = ChaseDocumentType | 'all';
type Tier = 'all' | 'first' | 'second';

interface Props {
  onEdit: (id: string) => void;
}

export function ChaseCentrePage({ onEdit }: Props) {
  const [candidates, setCandidates] = useState<CandidateWithExpiry[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [tier, setTier] = useState<Tier>('all');
  const [actioning, setActioning] = useState<string | null>(null);
  const [documentEdit, setDocumentEdit] = useState<{ item: ChaseCandidateItem; kind: 'received' | 'remark' } | null>(null);
  const [documentValue, setDocumentValue] = useState('');
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [chaseActions, setChaseActions] = useState<ChaseActionEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const [cands, s, actions] = await Promise.all([
        fetchCandidates(),
        fetchReminderSettings(),
        fetchChaseActions(),
      ]);
      setCandidates(enrichCandidates(cands, s));
      setSettings(s);
      setChaseActions(actions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(
    () => getRegularChasingCandidates(candidates, chaseActions, tab, tier),
    [candidates, chaseActions, tab, tier],
  );

  const firstWarningCount = useMemo(
    () => getRegularChasingCandidates(candidates, chaseActions, 'all', 'first').length,
    [candidates, chaseActions],
  );
  const secondWarningCount = useMemo(
    () => getRegularChasingCandidates(candidates, chaseActions, 'all', 'second').length,
    [candidates, chaseActions],
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: getRegularChasingCandidates(candidates, chaseActions, 'all', tier).length },
    ...(['dbs', 'passport', 'rtw', 'evisa', 'cos', 'pmva', 'training', 'medcomp'] as const).map((t) => ({
      key: t,
      label: CHASE_DOCUMENT_LABELS[t],
      count: getRegularChasingCandidates(candidates, chaseActions, t, tier).length,
    })),
  ];

  const tierTabs: { key: Tier; label: string; count: number; tone: string }[] = [
    { key: 'all', label: 'All Warnings', count: getRegularChasingCandidates(candidates, chaseActions, tab, 'all').length, tone: 'pink' },
    { key: 'first', label: '1st Warning', count: getRegularChasingCandidates(candidates, chaseActions, tab, 'first').length, tone: 'warning' },
    { key: 'second', label: '2nd Warning / DNB (7d)', count: getRegularChasingCandidates(candidates, chaseActions, tab, 'second').length, tone: 'danger' },
  ];

  const handleAction = async (candidateId: string, docType: ChaseDocumentType, action: ChaseAction) => {
    const actionKey = `${candidateId}:${docType}:${action}`;
    setActioning(actionKey);
    try {
      await addChaseAction(candidateId, docType, action);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setActioning(null);
    }
  };

  const openDocumentEdit = (item: ChaseCandidateItem, kind: 'received' | 'remark') => {
    setDocumentEdit({ item, kind });
    setDocumentValue(kind === 'remark' ? getDocumentRemark(item.candidate, item.documentType) : '');
    setDocumentError('');
    setSuccessMessage(null);
  };

  const saveDocumentEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!documentEdit || documentSaving) return;
    const { item, kind } = documentEdit;
    const { candidate, documentType, expiryDate } = item;
    const value = documentValue.trim();
    if (kind === 'received' && (!value || value === expiryDate)) {
      setDocumentError('Enter a new expiry date different from the current date.');
      return;
    }
    setDocumentError('');
    setDocumentSaving(true);
    try {
      const field = documentType === 'medcomp' ? MEDCOMP_EXPIRY_FIELD : DOCUMENT_TYPE_TO_FIELD[documentType];
      const patch = kind === 'remark' ? { extra_data: { [documentRemarkField(documentType)]: value } }
        : field === MEDCOMP_EXPIRY_FIELD ? { extra_data: { [MEDCOMP_EXPIRY_FIELD]: value } } : { [field]: value };
      const updated = await updateCandidate(candidate.id, patch, candidate.full_name,
        kind === 'received' ? { field, value: expiryDate } : undefined);
      setCandidates((current) => enrichCandidates(
        current.map((existing) => existing.id === updated.id ? updated : existing), settings,
      ));
      if (kind === 'received') {
        try {
          await addChaseAction(candidate.id, documentType, 'completed', 'Received', expiryDate);
          setSuccessMessage(`${CHASE_DOCUMENT_LABELS[documentType]} was marked Received and its expiry date was updated.`);
        } catch (error) {
          console.error(error);
          setSuccessMessage('The expiry date was saved, but the Received entry could not be recorded in chase history.');
        }
      } else {
        setSuccessMessage(value ? 'Document remark saved.' : 'Document remark cleared.');
      }
      setDocumentEdit(null);
    } catch (error) {
      console.error(error);
      setDocumentError(error instanceof Error ? error.message : 'Could not save this change. Refresh the page and try again.');
    } finally {
      setDocumentSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Chase Centre" subtitle="Candidates with expiring or expired documents that need attention." />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Regular Chasing"
        subtitle="Track eligible candidates and documents until each item is marked Received."
      />

      {/* Warning tier summary */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="px-4 py-3 rounded-xl bg-white border border-pink-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center">
              <Zap size={16} />
            </div>
            <div>
              <p className="text-xs text-pink-400">Total to Chase</p>
              <p className="text-lg font-bold text-pink-900 tabular-nums">{getRegularChasingCandidates(candidates, chaseActions, 'all', 'all').length}</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 rounded-xl bg-warning-50 border border-warning-500/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-warning-100 text-warning-600 flex items-center justify-center">
              <Mail size={16} />
            </div>
            <div>
              <p className="text-xs text-warning-600">1st Warning</p>
              <p className="text-lg font-bold text-warning-600 tabular-nums">{firstWarningCount}</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 rounded-xl bg-danger-50 border border-danger-500/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-danger-100 text-danger-600 flex items-center justify-center">
              <AlertCircle size={16} />
            </div>
            <div>
              <p className="text-xs text-danger-600">2nd Warning / DNB (7 days)</p>
              <p className="text-lg font-bold text-danger-600 tabular-nums">{secondWarningCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tier tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {tierTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTier(t.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all-soft ${
              tier === t.key
                ? t.tone === 'warning'
                  ? 'bg-warning-500 text-white shadow-[var(--shadow-soft)]'
                  : t.tone === 'danger'
                    ? 'bg-danger-500 text-white shadow-[var(--shadow-soft)]'
                    : 'bg-pink-500 text-white shadow-[var(--shadow-soft)]'
                : 'bg-white text-pink-600 border border-pink-100 hover:bg-pink-50'
            }`}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Document type tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all-soft ${
              tab === t.key
                ? 'bg-pink-500 text-white shadow-[var(--shadow-soft)]'
                : 'bg-white text-pink-600 border border-pink-100 hover:bg-pink-50'
            }`}
          >
            {t.label} <span className="opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 size={28} />}
            title="Nothing to chase!"
            description="All compliance documents are up to date for this category."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const { candidate, documentType, expiryDate, warningTier, latestAction } = item;
            const days = documentType === 'medcomp'
              ? (Date.parse(expiryDate) - Date.parse(portalToday())) / 86_400_000 : daysUntilExpiry(expiryDate);
            const docLabel = CHASE_DOCUMENT_LABELS[documentType];
            const medComp = getMedComp(candidate);
            const statusLabel = STATUS_LABELS[candidate.status];
            const statusTone = candidate.status === 'active' ? 'active' : 'pending';
            const latestActionLabel = latestAction
              ? `${latestAction.action.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}${latestAction.expiry_date ? ` (${new Date(latestAction.expiry_date).toLocaleDateString('en-GB')})` : ''}`
              : 'No chase history yet';

            return (
              <Card key={`${candidate.id}-${documentType}-${expiryDate}`} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)} ${
                warningTier === 'second' ? 'border-danger-500/20' : warningTier === 'first' ? 'border-warning-500/20' : ''
              }`}>
                <CardBody className="pt-4 pb-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                        warningTier === 'second' ? 'bg-danger-100 text-danger-600' : 'bg-pink-200 text-pink-700'
                      }`}>
                        {candidate.full_name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => onEdit(candidate.id)} className={`text-sm font-semibold hover:underline truncate block text-left ${medComp.answer === 'no' ? 'text-danger-600' : 'text-pink-900'}`}>
                            {candidate.full_name}
                          </button>
                          <Badge tone={statusTone}>{statusLabel}</Badge>
                          {medComp.role && <Badge tone="pink">{medComp.role}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {candidate.job_title && (
                            <span className="text-xs font-medium text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                              {candidate.job_title}
                            </span>
                          )}
                          <p className="text-xs text-pink-400 truncate">{candidate.role}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 items-center text-sm text-pink-600">
                      <div className="rounded-3xl border border-pink-100 bg-pink-50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-pink-500">Document</div>
                        <div className="mt-2 font-semibold text-pink-900">{docLabel}</div>
                      </div>
                      <div className="rounded-3xl border border-pink-100 bg-pink-50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-pink-500">Expiry</div>
                        <div className="mt-2 text-pink-900">
                          {new Date(expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-pink-100 bg-pink-50 p-3">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-pink-500">Warning tier</div>
                        <div className="mt-2 font-semibold text-pink-900 capitalize">
                          {warningTier === 'second' ? '2nd Warning' : warningTier === 'first' ? '1st Warning' : 'None'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {days !== null ? (
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        days <= 7 ? 'bg-rose-100 text-rose-700 border border-rose-500/20' : 'bg-amber-100 text-amber-700 border border-amber-500/20'
                      }`}>
                        {days < 0 ? 'Expired' : days === 0 ? 'Expiring today' : `Expiring in ${days} day${days === 1 ? '' : 's'}`}
                      </span>
                    ) : (
                      <Badge tone="neutral">No expiry date</Badge>
                    )}
                    {warningTier !== 'none' && (
                      <Badge tone={warningTier === 'second' ? 'expired' : 'expiring'}>
                        {warningTier === 'second' ? (documentType === 'medcomp' ? '2nd Warning' : '2nd Warning / DNB') : '1st Warning'}
                      </Badge>
                    )}
                    <span className="text-xs text-pink-500">Latest: {latestActionLabel}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" loading={actioning === `${candidate.id}:${documentType}:email_sent`} onClick={() => handleAction(candidate.id, documentType, 'email_sent')}>
                      <Send size={14} /> Chase Email
                    </Button>
                    <Button size="sm" variant="outline" loading={actioning === `${candidate.id}:${documentType}:called`} onClick={() => handleAction(candidate.id, documentType, 'called')}>
                      <Phone size={14} /> Called
                    </Button>
                    <Button size="sm" variant="outline" loading={actioning === `${candidate.id}:${documentType}:waiting`} onClick={() => handleAction(candidate.id, documentType, 'waiting')}>
                      <Clock size={14} /> Waiting
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openDocumentEdit(item, 'remark')}>
                      <MessageSquare size={14} /> Remark
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => openDocumentEdit(item, 'received')}>
                      <CheckCircle2 size={14} /> Received
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!documentEdit}
        onClose={() => { if (!documentSaving) setDocumentEdit(null); }}
        title={documentEdit?.kind === 'received' ? 'Enter new expiry date' : 'Document remark'}
        size="sm"
      >
        <form className="space-y-4" onSubmit={saveDocumentEdit}>
          {documentEdit && <p className="text-sm text-pink-600">
            {documentEdit.item.candidate.full_name} · {CHASE_DOCUMENT_LABELS[documentEdit.item.documentType]}
          </p>}
          {documentEdit?.kind === 'received' ? (
            <Input id="new-expiry" label="New expiry date" type="date" required
              value={documentValue} disabled={documentSaving} onChange={(event) => setDocumentValue(event.target.value)} />
          ) : (
            <Textarea id="document-remark" label="Remark" rows={3}
              value={documentValue} disabled={documentSaving} onChange={(event) => setDocumentValue(event.target.value)} />
          )}
          {documentError && <p role="alert" className="text-sm text-danger-600">{documentError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={documentSaving} onClick={() => setDocumentEdit(null)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={documentSaving}>
              {documentEdit?.kind === 'received' ? 'Save and mark Received' : 'Save remark'}
            </Button>
          </div>
        </form>
      </Modal>
      <NmcPinReminder />
    </div>
  );
}
