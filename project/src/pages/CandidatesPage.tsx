import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Search,
  Users,
  Zap,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { SkeletonCard } from '@/components/PinkPixel';
import { showStatusPopup } from '@/components/StatusPopup';
import {
  commitImport,
  deleteCandidate,
  detectDuplicates,
  enrichCandidates,
  fetchCandidates,
  fetchReminderSettings,
  getDoNotBookCandidates,
  getExpiryBadgeText,
  parseImportData,
  updateCandidate,
} from '@/lib/api';
import {
  type Candidate,
  type CandidateStatus,
  type CandidateWithExpiry,
  type ImportPreview,
  type ReminderSettings,
} from '@/types';
import { COMPLIANCE_DATE_FIELDS, COMPLIANCE_DATE_SHORT, STATUS_LABELS } from '@/types';

type FilterTab = 'all' | 'active' | 'inactive' | 'no_zoho' | 'goodbye' | 'expiring' | 'do_not_book' | 'archived';

interface Props {
  onSelectCandidate: (id: string) => void;
  onEdit: (id: string) => void;
}

export function CandidatesPage({ onSelectCandidate, onEdit }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [deleteTarget, setDeleteTarget] = useState<CandidateWithExpiry | null>(null);
  const [deleteStep, setDeleteStep] = useState<number>(1);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteWarnings, setPasteWarnings] = useState<string[]>([]);
  const [pastePreview, setPastePreview] = useState<ImportPreview | null>(null);
  const [pasteSaving, setPasteSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cands, settingsData] = await Promise.all([
        fetchCandidates(),
        fetchReminderSettings(),
      ]);
      setCandidates(cands);
      setSettings(settingsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enriched = useMemo(() => enrichCandidates(candidates, settings), [candidates, settings]);

  const filtered = useMemo(() => {
    return enriched.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.job_title ?? '').toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q) ||
        (c.remark ?? '').toLowerCase().includes(q);

      let matchesTab = true;
      switch (tab) {
        case 'active': matchesTab = c.status === 'active' && !c.goodbye_email_sent && c.status !== 'archived'; break;
        case 'inactive': matchesTab = c.status === 'inactive' && !c.goodbye_email_sent && c.status !== 'archived'; break;
        case 'no_zoho': matchesTab = c.status === 'no_zoho_remark' && c.status !== 'archived'; break;
        case 'goodbye': matchesTab = c.goodbye_email_sent; break;
        case 'expiring': matchesTab = c.isExpiringSoon && !c.goodbye_email_sent && c.status !== 'archived'; break;
        case 'do_not_book': matchesTab = c.isDoNotBook && !c.goodbye_email_sent && c.status !== 'archived'; break;
        case 'archived': matchesTab = c.status === 'archived' || c.goodbye_email_sent; break;
        default: matchesTab = true;
      }
      return matchesSearch && matchesTab;
    });
  }, [enriched, search, tab]);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: enriched.length },
    { key: 'active', label: 'Active', count: enriched.filter((c) => c.status === 'active' && !c.goodbye_email_sent && c.status !== 'archived').length },
    { key: 'inactive', label: 'Inactive', count: enriched.filter((c) => c.status === 'inactive' && !c.goodbye_email_sent && c.status !== 'archived').length },
    { key: 'no_zoho', label: 'No Zoho', count: enriched.filter((c) => c.status === 'no_zoho_remark' && c.status !== 'archived').length },
    { key: 'goodbye', label: 'Goodbye Email', count: enriched.filter((c) => c.goodbye_email_sent).length },
    { key: 'expiring', label: 'Expiring Soon', count: enriched.filter((c) => c.isExpiringSoon && !c.goodbye_email_sent && c.status !== 'archived').length },
    { key: 'do_not_book', label: 'Do Not Book', count: getDoNotBookCandidates(enriched).length },
    { key: 'archived', label: 'Archived', count: enriched.filter((c) => c.status === 'archived' || c.goodbye_email_sent).length },
  ];

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCandidate(deleteTarget.id);
      await load();
      setDeleteTarget(null);
      setDeleteStep(1);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickStatus = async (candidate: CandidateWithExpiry, status: CandidateStatus) => {
    setActionLoading(candidate.id);
    try {
      const remark = status === 'inactive' ? 'Goodbye Email Sent' : null;
      await updateCandidate(candidate.id, {
        status,
        remark: remark ?? candidate.remark,
      }, candidate.full_name);
      if (status === 'active') showStatusPopup('active', candidate.full_name);
      else if (status === 'inactive') showStatusPopup('inactive', candidate.full_name);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePastePreview = async () => {
    const { rows, warnings } = parseImportData(pasteText);
    const resultWarnings = [...warnings];
    if (rows.length === 0) {
      resultWarnings.push('Paste one header row and one candidate data row.');
    }
    if (rows.length > 1) {
      resultWarnings.push('Only the first candidate row will be previewed.');
    }
    setPasteWarnings(resultWarnings);

    if (rows.length > 0) {
      const [preview] = await detectDuplicates([rows[0]], candidates);
      setPastePreview(preview);
    } else {
      setPastePreview(null);
    }
  };

  const handlePasteSave = async (resolution: 'create' | 'update') => {
    if (!pastePreview) return;
    setPasteSaving(true);
    try {
      await commitImport([{ ...pastePreview, resolution }]);
      await load();
      setPasteModalOpen(false);
      setPasteText('');
      setPasteWarnings([]);
      setPastePreview(null);
    } catch (err) {
      console.error(err);
    } finally {
      setPasteSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Candidates" subtitle="Manage your maintenance team and their compliance." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Candidates"
        subtitle="Manage your maintenance team and their compliance."
      />

      {pasteSaving && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-pink-950/20 backdrop-blur-sm">
          <div className="flex min-w-72 flex-col items-center rounded-3xl bg-white px-10 py-8 shadow-2xl">
            <img
              src="/excel-upload-loader.gif"
              alt="Saving records"
              className="h-44 w-44 object-contain"
            />
            <h3 className="mt-4 text-lg font-bold text-pink-900">Saving records...</h3>
            <p className="mt-2 text-center text-sm text-pink-500">
              Please wait while your candidates are imported.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search by name, email, phone, job role, status, or remark..."
            icon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center">
          <Button variant="outline" onClick={() => setPasteModalOpen(true)}>
            Paste New Candidate
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
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

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={28} />}
            title={candidates.length === 0 ? 'No candidates yet' : 'No matches found'}
            description={
              candidates.length === 0
                ? 'Import your first batch of candidates to get started.'
                : 'Try adjusting your search or filter tab.'
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, i) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              index={i}
              onClick={() => onSelectCandidate(c.id)}
              onEdit={() => onEdit(c.id)}
              onDelete={() => { setDeleteTarget(c); setDeleteStep(1); }}
              onQuickStatus={(status) => handleQuickStatus(c, status)}
              actionLoading={actionLoading === c.id}
            />
          ))}
        </div>
      )}

      {/* Paste new candidate modal */}
      <Modal
        open={pasteModalOpen}
        onClose={() => { setPasteModalOpen(false); setPasteText(''); setPasteWarnings([]); setPastePreview(null); }}
        title="Paste New Candidate"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-pink-500">
              Paste one Excel header row and one candidate row below. Field headers will be auto-detected.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="mt-3 w-full min-h-[180px] rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm text-pink-900 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 font-mono"
              placeholder="Name\tEmail\tPhone\tStatus\tDBS Expiry\tPassport Expiry\tRTW Expiry\teVisa Expiry\tPMVA Expiry\tTraining Expiry\nJohn Doe\tjohn@example.com\t07000000000\tActive\t01/01/2026\t01/02/2026\t01/03/2026\t01/04/2026\t01/05/2026\t01/06/2026"
            />
          </div>

          {pasteWarnings.length > 0 && (
            <div className="space-y-2">
              {pasteWarnings.map((warning, index) => (
                <div key={index} className="rounded-xl bg-warning-50 border border-warning-500/20 px-4 py-3 text-sm text-warning-600">
                  {warning}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" onClick={handlePastePreview}>
              Preview Candidate
            </Button>
            <Button variant="primary" onClick={handlePastePreview}>
              Detect Fields
            </Button>
          </div>

          {pastePreview && (
            <div className="rounded-3xl border border-pink-100 bg-pink-50 p-4">
              <div className="mb-3 text-sm font-semibold text-pink-900">Preview</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryField label="Name" value={pastePreview.row.full_name} />
                <SummaryField label="Status" value={pastePreview.row.status} />
                <SummaryField label="Email" value={pastePreview.row.email ?? '-'} />
                <SummaryField label="Phone" value={pastePreview.row.phone ?? '-'} />
                <SummaryField label="DBS" value={pastePreview.row.dbs_expiry_date ?? '-'} />
                <SummaryField label="Passport" value={pastePreview.row.passport_expiry_date ?? '-'} />
                <SummaryField label="RTW" value={pastePreview.row.rtw_expiry_date ?? '-'} />
                <SummaryField label="eVisa" value={pastePreview.row.evisa_expiry_date ?? '-'} />
                <SummaryField label="PMVA" value={pastePreview.row.pmva_expiry_date ?? '-'} />
                <SummaryField label="Training" value={pastePreview.row.training_expiry_date ?? '-'} />
              </div>
              {pastePreview.isDuplicate && pastePreview.existing && (
                <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700">
                  Duplicate candidate found: <span className="font-semibold">{pastePreview.existing.full_name}</span> ({pastePreview.existing.email ?? pastePreview.existing.phone}).
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => { setPasteModalOpen(false); setPasteText(''); setPasteWarnings([]); setPastePreview(null); }}>
              Cancel
            </Button>
            {pastePreview && pastePreview.isDuplicate ? (
              <Button variant="danger" onClick={() => handlePasteSave('update')}>
                Update Expiry Dates
              </Button>
            ) : (
              <Button variant="primary" onClick={() => handlePasteSave('create')} disabled={!pastePreview}>
                Save Candidate
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Two-step delete modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteStep(1); }}
        title={deleteStep === 1 ? 'Delete Candidate' : 'Final Confirmation'}
        size="sm"
      >
        <div className="space-y-4">
          {deleteStep === 1 ? (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <p className="text-sm text-pink-700">
                  Are you sure you want to delete <span className="font-semibold">{deleteTarget?.full_name}</span>?
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="danger" onClick={() => setDeleteStep(2)}>Delete</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger-500 text-white flex items-center justify-center shrink-0">
                  <Ban size={20} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-pink-900">This action cannot be undone.</p>
                  <p className="text-sm text-pink-600">
                    Are you absolutely sure you want to permanently delete{' '}
                    <span className="font-semibold">{deleteTarget?.full_name}</span>?
                    All their compliance data and reminders will be removed.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => { setDeleteTarget(null); setDeleteStep(1); }}>Cancel</Button>
                <Button variant="danger" loading={deleting} onClick={handleDelete}>
                  Yes, delete permanently
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-2xl border border-pink-100 bg-white p-3 text-sm text-pink-700">
      <div className="text-[11px] uppercase tracking-[0.16em] text-pink-500">
        {label}
      </div>
      <div className="mt-1 font-semibold">{value ?? '-'}</div>
    </div>
  );
}

function CandidateCard({
  candidate: c,
  index,
  onClick,
  onEdit,
  onDelete,
  onQuickStatus,
  actionLoading,
}: {
  candidate: CandidateWithExpiry;
  index: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickStatus: (status: CandidateStatus) => void;
  actionLoading: boolean;
}) {
  const isArchived = c.goodbye_email_sent || c.status === 'archived';
  const reminderDays = 30;

  return (
    <Card
      hover
      className={`animate-fade-in-up stagger-${Math.min(index + 1, 6)} ${isGoodbye ? 'opacity-60' : ''}`}
    >
      <CardBody className="pt-5">
        <div className="flex items-start gap-3">
          <button onClick={onClick} className="w-12 h-12 rounded-2xl bg-pink-200 flex items-center justify-center text-pink-700 font-bold text-lg shrink-0">
            {c.full_name[0]?.toUpperCase()}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <button onClick={onClick} className="text-sm font-bold text-pink-900 truncate text-left">
                {c.full_name}
              </button>
              {isArchived ? (
                  <Badge tone="archived">Archived</Badge>
              ) : c.isDoNotBook ? (
                <Badge tone="expired" dot>Do Not Book</Badge>
              ) : c.status === 'active' ? (
                <Badge tone="active">Active</Badge>
              ) : c.status === 'inactive' ? (
                <Badge tone="inactive">Inactive</Badge>
              ) : c.status === 'no_zoho_remark' ? (
                <Badge tone="pending">No Zoho</Badge>
              ) : (
                <Badge tone="neutral">{STATUS_LABELS[c.status]}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {c.job_title && (
                <span className="text-xs font-medium text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                  {c.job_title}
                </span>
              )}
              <p className="text-xs text-pink-400 truncate">{c.role}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          {c.email && (
            <p className="text-xs text-pink-500 flex items-center gap-1.5 truncate">
              <Mail size={12} /> {c.email}
            </p>
          )}
          {c.phone && (
            <p className="text-xs text-pink-500 flex items-center gap-1.5 truncate">
              <Phone size={12} /> {c.phone}
            </p>
          )}
          {c.remark && (
            <p className="text-xs text-pink-400 italic truncate">"{c.remark}"</p>
          )}
        </div>

        {/* Compliance chips */}
        {!isArchived && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {COMPLIANCE_DATE_FIELDS.map((field) => {
              const status = c.expiryStatuses[field];
              if (status === 'missing') return null;
              const badgeText = getExpiryBadgeText(c[field], reminderDays);
              const colorClass = status === 'expired'
                ? 'bg-rose-100 text-rose-700'
                : status === 'expiring'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700';
              return (
                <span key={field} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${colorClass}`}>
                  {COMPLIANCE_DATE_SHORT[field]}
                  <span className="opacity-70">{badgeText}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Quick status actions */}
        {!isArchived && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => onQuickStatus('active')}
              disabled={actionLoading}
              className="text-xs px-2.5 py-1 rounded-lg bg-success-50 text-success-600 hover:bg-success-100 transition-all-soft disabled:opacity-50"
            >
              Active
            </button>
            <button
              onClick={() => onQuickStatus('inactive')}
              disabled={actionLoading}
              className="text-xs px-2.5 py-1 rounded-lg bg-cream-100 text-pink-600 hover:bg-cream-200 transition-all-soft disabled:opacity-50"
            >
              Inactive
            </button>
            <button
              onClick={() => onQuickStatus('no_zoho_remark')}
              disabled={actionLoading}
              className="text-xs px-2.5 py-1 rounded-lg bg-warning-50 text-warning-600 hover:bg-warning-100 transition-all-soft disabled:opacity-50"
            >
              No Zoho
            </button>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-pink-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onEdit} className="text-xs text-pink-500 hover:text-pink-700 font-medium transition-colors">
              Edit
            </button>
            {isArchived && (
              <button onClick={() => onQuickStatus('active')} className="text-xs text-success-600 hover:text-success-700 font-medium transition-colors">
                Restore
              </button>
            )}
          </div>
          <button onClick={onDelete} className="text-xs text-danger-500 hover:text-danger-600 font-medium transition-colors">
            Delete
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
