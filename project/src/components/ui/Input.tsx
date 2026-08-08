import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export function Input({ label, error, icon, className = '', id, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block mb-1.5 text-sm font-medium text-pink-800">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400">{icon}</span>}
        <input
          id={id}
          className={`w-full h-11 rounded-xl border border-pink-200 bg-white/70 px-3.5 text-sm text-pink-900 placeholder:text-pink-300 transition-all-soft focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 ${
            icon ? 'pl-10' : ''
          } ${error ? 'border-danger-500/40 bg-danger-50' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export function Select({ label, error, className = '', id, children, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block mb-1.5 text-sm font-medium text-pink-800">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`w-full h-11 rounded-xl border border-pink-200 bg-white/70 px-3.5 text-sm text-pink-900 transition-all-soft focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', id, ...props }: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block mb-1.5 text-sm font-medium text-pink-800">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={`w-full rounded-xl border border-pink-200 bg-white/70 px-3.5 py-2.5 text-sm text-pink-900 placeholder:text-pink-300 transition-all-soft focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
