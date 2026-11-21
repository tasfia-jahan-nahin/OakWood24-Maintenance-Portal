import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { portalToday } from '@/lib/monthlyExpirations';
import { supabase } from '@/lib/supabase';

const MONTH_KEY = 'oakwood_nmc_pin_dismissed_month';
const currentMonth = () => portalToday().slice(0, 7);

export function NmcPinReminder() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [dismissed, setDismissed] = useState<{ userId: string; month: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setMonth(currentMonth()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!user || user.user_metadata[MONTH_KEY] === month ||
    (dismissed?.userId === user.id && dismissed.month === month)) return null;

  const dismiss = async () => {
    setSaving(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ data: { [MONTH_KEY]: month } });
      if (error) throw error;
      setDismissed({ userId: user.id, month });
    } catch (error) {
      console.error('Failed to dismiss NMC PIN reminder:', error);
      setError('Could not dismiss the reminder. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open dismissible={false} size="sm" title="Check the nurses’ NMC PIN today"
      description="Monthly reminder">
      {error && <p role="alert" className="mb-4 text-sm text-danger-600">{error}</p>}
      <div className="flex justify-end pt-3">
        <Button type="button" autoFocus onClick={dismiss} loading={saving}>Dismiss</Button>
      </div>
    </Modal>
  );
}
