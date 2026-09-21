import type { ReactNode } from 'react';
import { AlertIcon } from './icons';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>;
  pending?: boolean;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'light' | 'danger';
  size?: 'md' | 'lg';
};

export function Button({
  children,
  pending = false,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  const sizes = {
    md: 'min-h-11 px-5 text-[15px]',
    lg: 'min-h-13 px-6 text-base',
  } as const;
  const variants = {
    primary:
      'bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-glow hover:from-brand-500 hover:to-brand-800 hover:-translate-y-px active:translate-y-0 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-600 disabled:shadow-none',
    secondary:
      'border border-slate-200 bg-white text-ink shadow-soft hover:border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-slate-400',
    light:
      'bg-white text-brand-900 shadow-lift hover:-translate-y-px hover:bg-brand-50 active:translate-y-0',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300 disabled:text-slate-600',
  } as const;
  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300/60 disabled:cursor-not-allowed disabled:translate-y-0 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-rose-600">
      <AlertIcon className="h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}

export function Alert({
  tone,
  title,
  children,
  role = 'alert',
}: {
  tone: 'error' | 'warning' | 'success' | 'info';
  title: string;
  children?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-brand-200 bg-brand-50 text-brand-900',
  } as const;
  return (
    <div role={role} className={`flex gap-3 rounded-2xl border p-4 ${tones[tone]}`}>
      <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 opacity-80" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      </div>
    </div>
  );
}

/** A compact Yes / No segmented control built from real radio buttons. */
export function YesNo({
  name,
  legend,
  error,
  defaultValue,
  disabled,
  icon,
}: {
  name: string;
  legend: string;
  error?: string;
  defaultValue?: string;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const errId = `${name}-error`;
  return (
    <fieldset
      aria-describedby={error ? errId : undefined}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
      className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white px-4 py-3 transition ${
        error ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Floated so it lays out as a normal flex item while staying the fieldset's first child. */}
      <legend className="float-left flex min-w-0 flex-1 items-center gap-3 text-sm font-medium leading-snug text-ink sm:text-[15px]">
        {icon && (
          <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 sm:grid">
            {icon}
          </span>
        )}
        <span>{legend}</span>
      </legend>
      <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className="relative cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-semibold text-slate-600 transition has-[:checked]:bg-white has-[:checked]:text-brand-700 has-[:checked]:shadow-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 has-[:disabled]:cursor-not-allowed"
          >
            <input
              type="radio"
              name={name}
              value={v}
              defaultChecked={defaultValue === v}
              required
              className="sr-only"
            />
            {v === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
      <div className="basis-full empty:hidden">
        <FieldError id={errId}>{error}</FieldError>
      </div>
    </fieldset>
  );
}
