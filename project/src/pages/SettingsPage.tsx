import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  Check,
  Database,
  LogIn,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  UserCircle,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader, Spinner } from '@/components/ui/EmptyState';
import {
  clearAllCandidates,
  createAuditLog,
  fetchProfile,
  updateProfile,
  fetchReminderSettings,
  updateReminderSettings,
  fetchAuthActivityLogs,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  type ReminderSettings,
  type ReminderSettingsInput,
} from '@/types';

const DEFAULT_SETTINGS: ReminderSettingsInput = {
  dbs_reminder_days: 30,
  passport_reminder_days: 30,
  rtw_reminder_days: 30,
  pmva_reminder_days: 30,
  training_reminder_days: 20,
  do_not_book_days: 7,
  first_warning_days: 15,
  second_warning_days: 7,
};

const FIELD_CONFIG: { key: keyof ReminderSettingsInput; label: string; description: string }[] = [
  { key: 'dbs_reminder_days', label: 'DBS', description: 'Days before DBS expiry to trigger a reminder' },
  { key: 'passport_reminder_days', label: 'Passport', description: 'Days before Passport expiry to trigger a reminder' },
  { key: 'rtw_reminder_days', label: 'RTW', description: 'Days before Right to Work expiry to trigger a reminder' },
  { key: 'pmva_reminder_days', label: 'PMVA', description: 'Days before PMVA expiry to trigger a reminder' },
  { key: 'training_reminder_days', label: 'Training', description: 'Days before Training expiry to trigger a reminder' },
  { key: 'do_not_book_days', label: 'Do Not Book', description: 'Days past expiry before flagging as Do Not Book' },
  { key: 'first_warning_days', label: '1st Warning', description: 'Days before expiry to trigger first warning email' },
  { key: 'second_warning_days', label: '2nd Warning / DNB', description: 'Days before expiry to trigger second warning and Do Not Book flag' },
];

export function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [authLogs, setAuthLogs] = useState<any[] | null>(null);
  const [form, setForm] = useState<ReminderSettingsInput>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Clear-all modal state
  const [clearStep, setClearStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, profile] = await Promise.all([fetchReminderSettings(), fetchProfile()]);
      setSettings(s);
      if (s) {
        setForm({
          dbs_reminder_days: s.dbs_reminder_days,
          passport_reminder_days: s.passport_reminder_days,
          rtw_reminder_days: s.rtw_reminder_days,
          pmva_reminder_days: s.pmva_reminder_days,
          training_reminder_days: s.training_reminder_days,
          do_not_book_days: s.do_not_book_days,
          first_warning_days: s.first_warning_days,
          second_warning_days: s.second_warning_days,
        });
      }
      if (profile) {
        setProfileName(profile.display_name ?? '');
        setProfileAvatar(profile.avatar_url ?? '');
      }
      // Load admin-only auth logs if this user is the designated admin
      if (user?.email === 'ptasfia789@gmail.com') {
        try {
          const logs = await fetchAuthActivityLogs(200);
          setAuthLogs(logs);
        } catch (err) {
          console.error('Failed to fetch auth activity logs:', err);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateReminderSettings(form);
      setSettings(updated);
      setSavedAt(Date.now());
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      await updateProfile(profileName, profileAvatar);
      setSavedAt(Date.now());
    } catch (err) {
      console.error(err);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await clearAllCandidates();
      await createAuditLog(
        'database.clear_all',
        'system',
        null,
        `Database cleared by ${user?.email ?? 'admin'} on ${new Date().toLocaleString('en-GB')}`,
      );
      setClearStep(0);
      setConfirmText('');
      await load();
    } catch (err) {
      setClearError(err instanceof Error ? err.message : 'Failed to clear database');
    } finally {
      setClearing(false);
    }
  };

  const closeClearModal = () => {
    setClearStep(0);
    setConfirmText('');
    setClearError(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="Configure reminder thresholds and manage system data."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="animate-fade-in-up stagger-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                <UserCircle size={18} />
              </div>
              <CardTitle>Profile</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-pink-500 mb-4">
              Update the name and avatar shown in the portal. Your role is assigned by an administrator.
            </p>
            <div className="space-y-4">
              <Input
                label="Display name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Your name"
              />
              <Input
                label="Avatar URL"
                value={profileAvatar}
                onChange={(e) => setProfileAvatar(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs text-pink-400">
                This profile is visible in admin ownership reports.
              </span>
              <Button onClick={handleProfileSave} loading={profileSaving}>
                <Save size={16} /> Save Profile
              </Button>
            </div>
          </CardBody>
        </Card>

        {user?.email === 'ptasfia789@gmail.com' && (
          <Card className="animate-fade-in-up stagger-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                  <LogIn size={18} />
                </div>
                <CardTitle>Admin User Login History</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              {authLogs == null ? (
                <p className="text-sm text-pink-500">No login activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {authLogs.map((l: any) => (
                    <div key={l.id} className="text-sm text-pink-700">
                      <div className="font-medium">{l.user_email ?? 'Unknown'}</div>
                      <div className="text-xs text-pink-400">{new Date(l.created_at).toLocaleString('en-GB')}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* Reminder thresholds */}
        <Card className="animate-fade-in-up stagger-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                <SlidersHorizontal size={18} />
              </div>
              <CardTitle>Reminder Thresholds</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-pink-500 mb-4">
              Set how many days before expiry a reminder should trigger. These values drive the Chase Centre and Do Not Book flags.
            </p>
            <div className="space-y-4">
              {FIELD_CONFIG.map((f) => (
                <div key={f.key}>
                  <Input
                    type="number"
                    label={f.label}
                    min={1}
                    max={365}
                    value={form[f.key]}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(365, Number(e.target.value) || 1));
                      setForm((prev) => ({ ...prev, [f.key]: v }));
                    }}
                  />
                  <p className="mt-1 text-xs text-pink-400">{f.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              {savedAt && Date.now() - savedAt < 5000 ? (
                <span className="text-sm text-success-600 flex items-center gap-1.5 font-medium animate-fade-in">
                  <Check size={16} /> Saved
                </span>
              ) : (
                <span className="text-xs text-pink-400">
                  Updated: {settings?.updated_at ? new Date(settings.updated_at).toLocaleString('en-GB') : 'Never'}
                </span>
              )}
              <Button onClick={handleSave} loading={saving}>
                <Save size={16} /> Save Settings
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Danger zone */}
        <Card className="animate-fade-in-up stagger-2 border-danger-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center">
                <ShieldAlert size={18} />
              </div>
              <CardTitle>Danger Zone</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <div className="rounded-xl bg-danger-50 border border-danger-500/20 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger-500 text-white flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-danger-700">Clear All Candidates</h3>
                  <p className="text-xs text-danger-600 mt-1">
                    Permanently deletes every candidate record, resets all dashboard statistics to zero, and writes an entry to the audit history. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button variant="danger" onClick={() => setClearStep(1)}>
                  <Trash2 size={16} /> Clear All Candidates
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-pink-50 border border-pink-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                  <Bell size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-pink-800">System Info</h3>
                  <p className="text-xs text-pink-500 mt-1">
                    Reminder rules apply automatically. DBS, Passport, RTW, and PMVA use a 30-day window by default; Training uses 20 days. Do Not Book flags trigger after 7 days past expiry.
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Step 1: Initial confirmation */}
      <Modal
        open={clearStep === 1}
        onClose={closeClearModal}
        title="Clear All Candidates?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning-100 text-warning-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-pink-900">Are you sure?</p>
              <p className="text-sm text-pink-600">
                This will permanently delete <span className="font-semibold">all</span> candidate records and reset every dashboard counter to zero. The audit history will be preserved with a record of this action.
              </p>
            </div>
          </div>
          {clearError && (
            <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {clearError}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={closeClearModal}>Cancel</Button>
            <Button variant="danger" onClick={() => setClearStep(2)}>Continue</Button>
          </div>
        </div>
      </Modal>

      {/* Step 2: Type DELETE to confirm */}
      <Modal
        open={clearStep === 2}
        onClose={closeClearModal}
        title="Final Confirmation"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger-500 text-white flex items-center justify-center shrink-0">
              <Ban size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-pink-900">This action cannot be undone.</p>
              <p className="text-sm text-pink-600">
                To confirm, type <span className="font-mono font-bold text-danger-600 bg-danger-50 px-1.5 py-0.5 rounded">DELETE</span> in the box below.
              </p>
            </div>
          </div>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            autoFocus
          />
          {clearError && (
            <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600">
              {clearError}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={closeClearModal}>Cancel</Button>
            <Button
              variant="danger"
              loading={clearing}
              disabled={confirmText !== 'DELETE'}
              onClick={handleClearAll}
            >
              <Database size={16} /> Clear Everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
