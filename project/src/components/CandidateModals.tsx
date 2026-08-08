import { type FormEvent, useEffect, useState } from 'react';
import { Mail, Phone, Trash2, UserCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { CANDIDATE_STATUSES, type Candidate, type CandidateInput, type CandidateStatus } from '@/types';
import { createCandidate, deleteCandidate, updateCandidate } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  candidate?: Candidate | null;
}

export function CandidateFormModal({ open, onClose, onSaved, candidate }: Props) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<CandidateStatus>('active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!candidate;

  useEffect(() => {
    if (open) {
      setFullName(candidate?.full_name ?? '');
      setRole(candidate?.role ?? '');
      setEmail(candidate?.email ?? '');
      setPhone(candidate?.phone ?? '');
      setStatus(candidate?.status ?? 'active');
      setNotes(candidate?.notes ?? '');
      setError(null);
    }
  }, [open, candidate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: CandidateInput = {
        full_name: fullName,
        role,
        email: email || null,
        phone: phone || null,
        status,
        notes: notes || null,
      };
      if (isEdit && candidate) {
        await updateCandidate(candidate.id, input);
      } else {
        await createCandidate(input);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save candidate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Candidate' : 'Add New Candidate'}
      description={isEdit ? 'Update team member information.' : 'Add a new maintenance team member to track.'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="full_name"
          label="Full name"
          placeholder="Jane Smith"
          icon={<UserCircle size={16} />}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          id="role"
          label="Role / Profession"
          placeholder="Registered Nurse"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="jane@example.com"
            icon={<Mail size={16} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            id="phone"
            label="Phone"
            placeholder="+44 7700 900000"
            icon={<Phone size={16} />}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <Select
          id="status"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CandidateStatus)}
        >
          {CANDIDATE_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
        <Textarea
          id="notes"
          label="Notes"
          placeholder="Any additional information..."
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Add candidate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteCandidateModal({
  open,
  onClose,
  candidate,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  onConfirm: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!candidate) return;
    setDeleting(true);
    try {
      await deleteCandidate(candidate.id);
      onConfirm();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Delete Candidate" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center shrink-0">
            <Trash2 size={20} />
          </div>
          <p className="text-sm text-pink-700">
            Are you sure you want to delete <span className="font-semibold">{candidate?.full_name}</span>? This will also
            remove all their compliance items. This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
