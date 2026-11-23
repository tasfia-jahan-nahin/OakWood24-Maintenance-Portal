import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { fetchCandidatesStrict, updateCandidate } from '@/lib/api';
import { inactiveFields, inactiveFollowUpRows, previewInactiveImport } from '@/lib/inactiveCandidates';
import { portalToday } from '@/lib/monthlyExpirations';
import type { Candidate } from '@/types';

type FollowUpRow = ReturnType<typeof inactiveFollowUpRows>[number];

function message(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export function InactiveCandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<FollowUpRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [raw, setRaw] = useState('');
  const [review, setReview] = useState<ReturnType<typeof previewInactiveImport> | null>(null);
  const [dialogError, setDialogError] = useState('');
  const today = portalToday();
  const rows = useMemo(() => inactiveFollowUpRows(candidates, today), [candidates, today]);
  const ready = review?.filter((row) => row.candidate && !row.issue) ?? [];

  async function load() {
    setLoading(true);
    setError('');
    try {
      setCandidates(await fetchCandidatesStrict());
    } catch (err) {
      setError(message(err, 'Could not load inactive candidates.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function replaceCandidate(updated: Candidate) {
    setCandidates((current) => current.map((row) => row.id === updated.id ? updated : row));
  }

  async function saveDetails(row: FollowUpRow, toggleChased = false) {
    setSaving(true);
    setError('');
    setDialogError('');
    const extra = toggleChased ? { [inactiveFields.chased]: String(!row.chased) } : {
      [inactiveFields.date]: row.date,
      [inactiveFields.reason]: row.reason.trim(),
    };
    try {
      replaceCandidate(await updateCandidate(row.candidate.id, { extra_data: extra },
        row.candidate.full_name, undefined, row.candidate.updated_at));
      if (!toggleChased) setEditing(null);
    } catch (err) {
      const failure = message(err, 'Could not save this follow-up.');
      if (toggleChased) setError(failure);
      else setDialogError(failure);
    } finally {
      setSaving(false);
    }
  }

  async function saveImport() {
    setSaving(true);
    setDialogError('');
    setNotice('');
    const saved = new Set<number>();
    const failures = new Map<number, string>();
    for (const row of ready) {
      const candidate = row.candidate!;
      const extra = { [inactiveFields.date]: row.date };
      if (row.reason !== undefined) extra[inactiveFields.reason] = row.reason;
      if (row.chased !== undefined) extra[inactiveFields.chased] = String(row.chased);
      try {
        replaceCandidate(await updateCandidate(candidate.id, { status: 'inactive', extra_data: extra },
          candidate.full_name, undefined, candidate.updated_at));
        saved.add(row.rowNumber);
      } catch (err) {
        failures.set(row.rowNumber, message(err, 'Could not save this row.'));
      }
    }
    setSaving(false);
    if (saved.size) setNotice(`Saved ${saved.size} inactive candidate${saved.size === 1 ? '' : 's'}.`);
    const remaining = review?.filter((row) => !saved.has(row.rowNumber)) ?? [];
    if (remaining.length) {
      setReview(remaining.map((row) => ({ ...row, issue: failures.get(row.rowNumber) ?? row.issue })));
      if (failures.size) setDialogError('Some rows could not be saved. Review the messages below.');
    } else {
      setImportOpen(false);
    }
  }

  const sections = [
    { title: 'Priority follow-up', empty: 'No candidates in their first 30 days of follow-up.', rows: rows.filter((row) => row.priority) },
    { title: 'Still inactive', empty: 'No other inactive candidates.', rows: rows.filter((row) => !row.priority) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Inactive Candidates" subtitle="Follow up during the first 30 days after inactivation and keep a record while candidates remain inactive." />
      <Button disabled={loading || saving} onClick={() => {
        setRaw(''); setReview(null); setDialogError(''); setImportOpen(true);
      }}><Upload size={16} /> Import inactive list</Button>
      {error && <div role="alert" className="flex items-center gap-3 text-danger-600">
        {error} <Button variant="outline" size="sm" onClick={() => void load()}>Refresh list</Button>
      </div>}
      {notice && <p role="status" className="text-pink-700">{notice}</p>}
      {loading ? <Spinner /> : sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-semibold text-pink-900">{section.title} ({section.rows.length})</h2>
          {!section.rows.length && <p className="text-sm text-pink-700">{section.empty}</p>}
          {section.rows.map((row) => {
            const { candidate } = row;
            const phone = candidate.phone?.replace(/[^+\d]/g, '');
            return (
              <Card key={candidate.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-pink-800">
                      {phone && <a aria-label={`Call ${candidate.full_name}`} href={`tel:${phone}`} className="rounded p-1 hover:bg-pink-100"><Phone size={16} /></a>}
                      {candidate.email && <a aria-label={`Email ${candidate.full_name}`} href={`mailto:${encodeURIComponent(candidate.email.trim()).replace(/%40/g, '@')}`} className="rounded p-1 hover:bg-pink-100"><Mail size={16} /></a>}
                      <h3 className="font-semibold">{candidate.full_name}</h3>
                      <Badge tone={row.chased ? 'valid' : 'expiring'}>{row.chased ? 'Chased' : 'Not chased'}</Badge>
                    </div>
                    <p className="text-sm text-pink-700">
                      {row.date ? `Inactivated ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(row.date))}`
                        : 'Inactivation date not recorded'}
                    </p>
                    <p className="break-words whitespace-pre-wrap text-sm text-pink-900">{row.reason || 'No reason recorded.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => {
                      setDialogError(''); setEditing(row);
                    }}>Edit reason</Button>
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => void saveDetails(row, true)}>
                      {row.chased ? 'Mark not chased' : 'Mark chased'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      ))}
      <Modal open={!!editing} onClose={() => setEditing(null)} dismissible={!saving} title="Edit inactivation details">
        {editing && <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault(); void saveDetails(editing);
        }}>
          <p className="font-semibold text-pink-900">{editing.candidate.full_name}</p>
          <Input label="Inactivation date" type="date" max={today} value={editing.date}
            onChange={(event) => setEditing({ ...editing, date: event.target.value })} />
          <Textarea label="Reason" rows={3} value={editing.reason}
            onChange={(event) => setEditing({ ...editing, reason: event.target.value })} />
          {dialogError && <p role="alert" className="text-danger-600">{dialogError}</p>}
          <Button type="submit" loading={saving}>Save details</Button>
        </form>}
      </Modal>
      <Modal open={importOpen} onClose={() => setImportOpen(false)} dismissible={!saving && !reading} title="Import inactive list" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-pink-800">Use the names already in Candidates. Put one candidate per row with name, inactivation date, optional reason and optional chase status. Use DD/MM/YYYY or YYYY-MM-DD.</p>
          <Input label="Upload a text-based PDF, Word document (.docx), or text file" type="file"
            accept=".pdf,.docx,.txt" disabled={saving || reading} onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setReading(true); setDialogError(''); setReview(null); setRaw('');
              try {
                const { readTrainingDocument } = await import('@/lib/readTrainingDocument');
                const extracted = await readTrainingDocument(file, true);
                setRaw(extracted);
                if (!extracted.trim()) setDialogError('This file has no readable text. Paste the list below.');
              } catch (err) {
                setDialogError(message(err, 'Could not read this file.'));
              } finally {
                setReading(false);
              }
            }} />
          <Textarea label="Paste the list or review text from your file" rows={5} value={raw}
            placeholder="Name | Inactivation date | Reason | Chased&#10;Jane Smith | 20/11/2026 | No longer available | Not chased"
            disabled={saving || reading} onChange={(event) => {
              setRaw(event.target.value); setReview(null); setDialogError('');
            }} />
          <Button variant="outline" disabled={!raw.trim() || saving || reading} onClick={() => {
            setDialogError('');
            try { setReview(previewInactiveImport(raw, candidates, today)); }
            catch (err) { setReview(null); setDialogError(message(err, 'Could not read the list.')); }
          }}>{reading ? 'Reading file…' : 'Preview list'}</Button>
          {dialogError && <p role="alert" className="text-danger-600">{dialogError}</p>}
          {review && <div className="space-y-3">
            <p className="text-sm font-semibold text-pink-900">{ready.length} ready · {review.length - ready.length} skipped</p>
            {!review.length && <p className="text-sm text-pink-700">No candidate rows found.</p>}
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {review.map((row) => <li key={row.rowNumber} className="rounded-lg bg-pink-50 p-2 text-sm text-pink-900">
                <strong>Row {row.rowNumber} · {row.name || 'Missing name'}</strong>
                <p>{row.issue ?? `${row.date} · ${row.candidate?.status === 'inactive' ? 'Update inactive record' : 'Set candidate to inactive'}`}</p>
                {!row.issue && row.reason && <p className="break-words">{row.reason}</p>}
                {!row.issue && row.chased !== undefined && <p>{row.chased ? 'Chased' : 'Not chased'}</p>}
              </li>)}
            </ul>
            <Button disabled={!ready.length || reading} loading={saving} onClick={() => void saveImport()}>
              Save {ready.length} matching {ready.length === 1 ? 'candidate' : 'candidates'}
            </Button>
          </div>}
        </div>
      </Modal>
    </div>
  );
}
