import { useEffect, useState } from 'react';
import { CheckCircle2, Heart, XCircle } from 'lucide-react';

export type StatusPopupType = 'active' | 'inactive' | 'goodbye' | null;

interface StatusPopupState {
  type: StatusPopupType;
  name: string;
}

let popupCallback: ((state: StatusPopupState | null) => void) | null = null;

export function showStatusPopup(type: StatusPopupType, name: string) {
  if (popupCallback) popupCallback({ type, name });
}

export function StatusPopup() {
  const [popup, setPopup] = useState<StatusPopupState | null>(null);

  useEffect(() => {
    popupCallback = (state) => {
      if (state) {
        setPopup(state);
        const timer = setTimeout(() => setPopup(null), 2500);
        return () => clearTimeout(timer);
      }
    };
    return () => { popupCallback = null; };
  }, []);

  useEffect(() => {
    if (!popup) return;
    const timer = setTimeout(() => setPopup(null), 2500);
    return () => clearTimeout(timer);
  }, [popup]);

  if (!popup) return null;

  const config = {
    active: {
      icon: <CheckCircle2 size={32} />,
      bg: 'bg-success-100 text-success-600',
      border: 'border-success-500/30',
      title: 'Candidate Activated!',
      emoji: '\u{1F33C} \u{1F389}',
      message: `${popup.name} is now Active.`,
    },
    inactive: {
      icon: <XCircle size={32} />,
      bg: 'bg-cream-200 text-pink-600',
      border: 'border-pink-200',
      title: 'Candidate Moved to Inactive...',
      emoji: '\u{1F494}',
      message: `${popup.name} is now Inactive.`,
    },
    goodbye: {
      icon: <Heart size={32} />,
      bg: 'bg-pink-100 text-pink-600',
      border: 'border-pink-300/40',
      title: 'Goodbye Email Sent',
      emoji: '\u{1F44B}',
      message: `${popup.name} has been archived.`,
    },
  };

  const c = config[popup.type as 'active' | 'inactive' | 'goodbye'];

  return (
    <div className="fixed top-20 right-6 z-[60] animate-fade-in-down">
      <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border-2 ${c.border} shadow-[var(--shadow-soft-lg)] max-w-sm`}>
        <div className={`w-14 h-14 rounded-2xl ${c.bg} flex items-center justify-center shrink-0`}>
          {c.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-pink-900">{c.title} {c.emoji}</p>
          <p className="text-xs text-pink-500 mt-0.5 truncate">{c.message}</p>
        </div>
        <button
          onClick={() => setPopup(null)}
          className="p-1.5 rounded-lg text-pink-400 hover:bg-pink-100 transition-all-soft shrink-0"
        >
          <XCircle size={16} />
        </button>
      </div>
    </div>
  );
}
