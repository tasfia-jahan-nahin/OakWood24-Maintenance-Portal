import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';

const statuses = { todo: 'To do', working: 'Working', done: 'Done', cancelled: 'Cancelled' };
type QueueStatus = keyof typeof statuses;
type QueueItem = {
  id: string;
  kind: 'task' | 'note';
  title: string;
  remark: string;
  status: QueueStatus;
  closed_at: string | null;
};
type Draft = Pick<QueueItem, 'kind' | 'title' | 'remark' | 'status'> & { id?: string };
const fields = 'id,kind,title,remark,status,closed_at';

export function DailyQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('daily_queue').select(fields).order('created_at', { ascending: true });
    if (error) {
      setError('Could not load the Daily Queue. Try refreshing.');
    } else {
      setItems(data);
      setError('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void supabase.rpc('purge_closed_daily_queue').then(({ error }) => {
      if (error) console.error('Daily Queue cleanup failed:', error);
    });
    const timer = window.setInterval(() => void load(), 60_000);
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  const openDraft = (kind: Draft['kind'], existing?: QueueItem) => {
    setDialogError('');
    setDraft(existing ?? { kind, title: '', remark: '', status: 'todo' });
  };

  async function updateItem(id: string, changes: Partial<Draft>) {
    const { data, error } = await supabase.from('daily_queue').update(changes).eq('id', id).select(fields).single();
    if (error) throw error;
    setItems((current) => current.map((item) => item.id === id ? data : item));
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || !draft.title.trim()) return;
    setSaving(true);
    setDialogError('');
    const changes = { kind: draft.kind, title: draft.title.trim(), remark: draft.remark.trim(), status: draft.status };
    try {
      if (draft.id) {
        await updateItem(draft.id, changes);
      } else {
        const { data, error } = await supabase.from('daily_queue').insert(changes).select(fields).single();
        if (error) throw error;
        setItems((current) => [...current, data]);
      }
      setDraft(null);
    } catch {
      setDialogError('Could not save this entry. Refresh the queue and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: QueueItem, status: QueueStatus) {
    if (saving || item.status === status) return;
    setSaving(true);
    setError('');
    try {
      await updateItem(item.id, { status });
    } catch {
      setError('Could not change the task status. Refresh the queue and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function removeNote() {
    if (!deleting || saving) return;
    setSaving(true);
    setDialogError('');
    try {
      const { error } = await supabase.from('daily_queue').delete().eq('id', deleting.id).eq('kind', 'note');
      if (error) throw error;
      setItems((current) => current.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch {
      setDialogError('Could not delete the note. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const tasks = items.filter(({ kind }) => kind === 'task');
  const notes = items.filter(({ kind }) => kind === 'note');
  const open = tasks.filter(({ status }) => status === 'working' || status === 'todo')
    .sort((a, b) => Number(b.status === 'working') - Number(a.status === 'working'));
  const closed = tasks.filter(({ closed_at }) => closed_at);

  const renderItem = (item: QueueItem) => (
    <li key={item.id} className="space-y-2 rounded-xl border border-pink-100 p-3">
      <h3 className="break-words font-semibold text-pink-900">{item.title}</h3>
      {item.remark && <p className="whitespace-pre-wrap break-words text-sm text-pink-800">{item.remark}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {item.kind === 'task' && <Select aria-label={`Status for ${item.title}`} value={item.status} disabled={saving}
          onChange={(event) => void changeStatus(item, event.target.value as QueueStatus)}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>}
        <Button size="sm" variant="outline" disabled={saving} onClick={() => openDraft(item.kind, item)}>Edit</Button>
        {item.kind === 'note' && <>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => {
            setDialogError('');
            setDraft({ kind: 'task', title: item.title, remark: item.remark, status: 'todo' });
          }}>Copy to queue</Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => {
            setDialogError('');
            setDeleting(item);
          }}>Delete note</Button>
        </>}
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Daily Queue" subtitle="Shared with portal staff. Done and cancelled tasks clear 24 hours after closing." />
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger-600">
        {error}<Button variant="outline" size="sm" onClick={() => void load()}>Refresh queue</Button>
      </div>}
      {loading ? <Spinner /> : <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Button onClick={() => openDraft('task')}>Add task</Button>
            {open.length ? <ul className="space-y-2">{open.map(renderItem)}</ul>
              : <p className="text-sm text-pink-700">No open tasks.</p>}
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-pink-800">Done and cancelled ({closed.length})</summary>
              {closed.length > 0 && <ul className="mt-2 space-y-2">{closed.map(renderItem)}</ul>}
            </details>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notes for Tomorrow</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <p className="text-sm text-pink-700">Notes stay here until someone deletes them.</p>
            <Button onClick={() => openDraft('note')}>Add note</Button>
            {notes.length ? <ul className="space-y-2">{notes.map(renderItem)}</ul>
              : <p className="text-sm text-pink-700">No notes yet.</p>}
          </CardBody>
        </Card>
      </div>}
      <Modal open={!!draft} onClose={() => setDraft(null)} dismissible={!saving}
        title={`${draft?.id ? 'Edit' : 'Add'} ${draft?.kind ?? 'task'}`}>
        {draft && <form className="space-y-4" onSubmit={saveDraft}>
          <Input label={draft.kind === 'task' ? 'Task' : 'Note'} required value={draft.title} maxLength={200}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <Textarea label="Remark" value={draft.remark} maxLength={4000} rows={4}
            onChange={(event) => setDraft({ ...draft, remark: event.target.value })} />
          {dialogError && <p role="alert" className="text-sm text-danger-600">{dialogError}</p>}
          <Button type="submit" loading={saving}>Save {draft.kind}</Button>
        </form>}
      </Modal>
      <Modal open={!!deleting} title="Delete note?" dismissible={!saving} onClose={() => setDeleting(null)}>
        <p className="mb-4 break-words text-pink-800">{deleting?.title}</p>
        {dialogError && <p role="alert" className="mb-4 text-sm text-danger-600">{dialogError}</p>}
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" loading={saving} onClick={() => void removeNote()}>Delete note</Button>
        </div>
      </Modal>
    </div>
  );
}
