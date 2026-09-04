import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Send,
  Zap,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { SkeletonCard } from '@/components/PinkPixel';
import {
  addChaseAction,
  daysUntilExpiry,
  enrichCandidates,
  fetchCandidates,
  fetchChaseActions,
  fetchReminderSettings,
  getRegularChasingCandidates,
} from '@/lib/api';
import {
  type ChaseAction,
  type CandidateWithExpiry,
  type ChaseActionEntry,
  type ChaseCandidateItem,
  type DocumentType,
  type ReminderSettings,
} from '@/types';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_TO_FIELD, STATUS_LABELS } from '@/types';

type Tab = DocumentType | 'all';
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
  const [receivedTarget, setReceivedTarget] = useState<ChaseCandidateItem | null>(null);
  const [receivedSaving, setReceivedSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [chaseActions, setChaseActions] = useState<ChaseActionEntry[]>([]);
  const [optimisticallyReceived, setOptimisticallyReceived] = useState<Set<string>>(new Set());

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
    () => getRegularChasingCandidates(candidates, chaseActions, tab, tier).filter(
      (item) => !optimisticallyReceived.has(`${item.candidate.id}:${item.documentType}:${item.expiryDate}`),
    ),
    [candidates, chaseActions, optimisticallyReceived, tab, tier],
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
    ...(['dbs', 'passport', 'rtw', 'evisa', 'cos', 'pmva', 'training'] as DocumentType[]).map((t) => ({
      key: t,
      label: DOCUMENT_TYPE_LABELS[t],
      count: getRegularChasingCandidates(candidates, chaseActions, t, tier).length,
    })),
  ];

  const tierTabs: { key: Tier; label: string; count: number; tone: string }[] = [
    { key: 'all', label: 'All Warnings', count: getRegularChasingCandidates(candidates, chaseActions, tab, 'all').length, tone: 'pink' },
    { key: 'first', label: '1st Warning (15d)', count: getRegularChasingCandidates(candidates, chaseActions, tab, 'first').length, tone: 'warning' },
    { key: 'second', label: '2nd Warning / DNB (7d)', count: getRegularChasingCandidates(candidates, chaseActions, tab, 'second').length, tone: 'danger' },
  ];

  const handleAction = async (candidateId: string, docType: DocumentType, action: ChaseAction) => {
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

  const handleReceivedClick = (item: ChaseCandidateItem) => {
    setReceivedTarget(item);
    setSuccessMessage(null);
  };

  const handleConfirmReceived = async () => {
    if (!receivedTarget) return;
    const receivedKey = `${receivedTarget.candidate.id}:${receivedTarget.documentType}:${receivedTarget.expiryDate}`;
    setOptimisticallyReceived((current) => new Set(current).add(receivedKey));
    setReceivedSaving(true);
    try {
      await addChaseAction(
        receivedTarget.candidate.id,
        receivedTarget.documentType,
        'completed',
        'Received',
        receivedTarget.expiryDate,
      );
      setCandidates((current) => current.filter((candidate) => candidate.id !== receivedTarget.candidate.id));
      await load();
      setSuccessMessage(`${receivedTarget.candidate.full_name}'s ${DOCUMENT_TYPE_LABELS[receivedTarget.documentType]} was marked Received.`);
      setReceivedTarget(null);
    } catch (err) {
      setOptimisticallyReceived((current) => {
        const next = new Set(current);
        next.delete(receivedKey);
        return next;
      });
      console.error(err);
    } finally {
      setReceivedSaving(false);
    }
  };

  const closeReceivedModal = () => {
    setReceivedTarget(null);
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
              <p className="text-xs text-warning-600">1st Warning (15 days)</p>
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
            const { candidate, documentType, expiryDate, expiryField, warningTier, latestAction } = item;
            const days = daysUntilExpiry(expiryDate);
            const docLabel = DOCUMENT_TYPE_LABELS[documentType];
            const statusLabel = STATUS_LABELS[candidate.status];
            const statusTone = candidate.status === 'active' ? 'active' : 'pending';
            const latestActionLabel = latestAction
              ? `${latestAction.action.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}${latestAction.expiry_date ? ` (${new Date(latestAction.expiry_date).toLocaleDateString('en-GB')})` : ''}`
              : 'No chase history yet';
            const actionKey = `${candidate.id}:${documentType}:received`;

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
                          <button onClick={() => onEdit(candidate.id)} className="text-sm font-semibold text-pink-900 hover:text-pink-700 truncate block text-left">
                            {candidate.full_name}
                          </button>
                          <Badge tone={statusTone}>{statusLabel}</Badge>
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
                        {days === 0 ? 'Expiring today' : `Expiring in ${days} day${days === 1 ? '' : 's'}`}
                      </span>
                    ) : (
                      <Badge tone="neutral">No expiry date</Badge>
                    )}
                    {warningTier !== 'none' && (
                      <Badge tone={warningTier === 'second' ? 'expired' : 'expiring'}>
                        {warningTier === 'second' ? '2nd Warning / DNB' : '1st Warning'}
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
                    <Button size="sm" variant="primary" loading={receivedSaving && receivedTarget?.candidate.id === candidate.id && receivedTarget.documentType === documentType} onClick={() => handleReceivedClick(item)}>
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
        open={!!receivedTarget}
        onClose={closeReceivedModal}
        title="Confirm Received"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-pink-600">
            Mark <span className="font-semibold">{receivedTarget?.candidate.full_name}</span>'s <span className="font-semibold">{receivedTarget ? DOCUMENT_TYPE_LABELS[receivedTarget.documentType] : ''}</span> as Received?
          </p>
          <p className="text-sm text-pink-500">
            This will persist a Received action for <strong>{receivedTarget?.expiryDate}</strong> and remove this item from Regular Chasing.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeReceivedModal}>Cancel</Button>
            <Button variant="primary" onClick={handleConfirmReceived} loading={receivedSaving}>
              Confirm Received
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
