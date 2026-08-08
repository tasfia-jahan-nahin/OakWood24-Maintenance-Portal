import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-pink-500 text-white hover:bg-pink-600 active:bg-pink-700 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-glow)]',
  secondary: 'bg-pink-100 text-pink-800 hover:bg-pink-200 active:bg-pink-300',
  ghost: 'text-pink-700 hover:bg-pink-100 active:bg-pink-200',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-600 shadow-[var(--shadow-soft)]',
  outline: 'border border-pink-200 text-pink-700 hover:bg-pink-50 hover:border-pink-300 bg-white/60',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-all-soft disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-pink-300/50 focus:ring-offset-1 focus:ring-offset-pink-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
