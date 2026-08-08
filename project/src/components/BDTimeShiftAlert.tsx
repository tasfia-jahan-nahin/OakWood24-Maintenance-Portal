import { useEffect, useState } from 'react';
import { Shield, Moon, X } from 'lucide-react';
import { getShiftAlert, type ShiftAlertType } from '@/lib/api';

export function BDTimeShiftAlert() {
  const [alert, setAlert] = useState<ShiftAlertType>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setAlert(getShiftAlert());
  }, []);

  if (!alert || dismissed) return null;

  const config = {
    before: {
      icon: <Shield size={24} />,
      bg: 'bg-pink-100 text-pink-600',
      border: 'border-pink-300/40',
      message: 'Who starts before shift? What are you, Captain America? Get a life! \u{1F6E1}\uFE0F',
      badge: 'Before Shift',
    },
    after: {
      icon: <Moon size={24} />,
      bg: 'bg-pink-200 text-pink-700',
      border: 'border-pink-400/40',
      message: 'Overtime? You\u2019re not saving the universe, go to sleep! \u{1F634}',
      badge: 'After Shift',
    },
  };

  const c = config[alert];

  return (
    <div className="mb-4 animate-fade-in-down">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border-2 ${c.border} shadow-[var(--shadow-soft)]`}>
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
          {c.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.bg}`}>{c.badge}</span>
            <span className="text-xs text-pink-400">BD Time (UTC+6)</span>
          </div>
          <p className="text-sm font-medium text-pink-800 mt-1">{c.message}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-2 rounded-lg text-pink-400 hover:bg-pink-100 transition-all-soft shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
