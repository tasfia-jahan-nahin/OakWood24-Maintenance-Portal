import { type ReactNode } from 'react';

type Tone = 'valid' | 'expiring' | 'expired' | 'pending' | 'active' | 'inactive' | 'archived' | 'neutral' | 'pink';

const toneClasses: Record<Tone, string> = {
  valid: 'bg-success-100 text-success-700 border-success-500/20',
  expiring: 'bg-warning-100 text-warning-600 border-warning-500/20',
  expired: 'bg-danger-100 text-danger-600 border-danger-500/20',
  pending: 'bg-pink-100 text-pink-700 border-pink-300/30',
  active: 'bg-success-100 text-success-700 border-success-500/20',
  inactive: 'bg-cream-200 text-pink-700 border-pink-200',
  archived: 'bg-cream-100 text-pink-600/70 border-cream-300',
  neutral: 'bg-cream-100 text-pink-700 border-pink-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-300/30',
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ tone = 'neutral', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${toneClasses[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-soft" />}
      {children}
    </span>
  );
}
