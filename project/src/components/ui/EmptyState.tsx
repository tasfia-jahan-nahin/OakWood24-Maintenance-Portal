import { type ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-pink-100 flex items-center justify-center text-pink-400 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-pink-800">{title}</h3>
      {description && <p className="mt-1 text-sm text-pink-400 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block w-5 h-5 border-2 border-pink-300 border-t-pink-500 rounded-full animate-spin ${className}`}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-900 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-pink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
