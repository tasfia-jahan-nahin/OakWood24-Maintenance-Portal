import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, description, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-pink-900/20 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizeClasses[size]} bg-white rounded-2xl shadow-[var(--shadow-soft-lg)] border border-pink-100 animate-scale-in max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div>
            {title && <h2 className="text-lg font-bold text-pink-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-pink-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg text-pink-400 hover:bg-pink-100 hover:text-pink-600 transition-all-soft"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}
