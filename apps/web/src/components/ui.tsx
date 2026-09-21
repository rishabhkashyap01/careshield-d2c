import type { ReactNode } from 'react';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  children,
  pending = false,
  pendingLabel,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary';
}) {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'bg-indigo-700 text-white hover:bg-indigo-800 focus-visible:ring-indigo-300 disabled:bg-slate-300 disabled:text-slate-600'
      : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-200 disabled:text-slate-400';
  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      className={`${base} ${styles} ${className}`}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-red-700">
      <span aria-hidden="true">⚠ </span>
      {children}
    </p>
  );
}

export function YesNo({
  name,
  legend,
  hint,
  error,
  defaultValue,
  disabled,
}: {
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  const errId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <fieldset
      aria-describedby={[hint && hintId, error && errId].filter(Boolean).join(' ') || undefined}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className="text-base font-medium text-slate-900">{legend}</legend>
      {hint && (
        <p id={hintId} className="mt-0.5 text-sm text-slate-600">
          {hint}
        </p>
      )}
      <div className="mt-2 flex gap-3">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-indigo-200"
          >
            <input
              type="radio"
              name={name}
              value={v}
              defaultChecked={defaultValue === v}
              required
              className="h-4 w-4 accent-indigo-700"
            />
            <span className="text-slate-900">{v === 'yes' ? 'Yes' : 'No'}</span>
          </label>
        ))}
      </div>
      <FieldError id={errId}>{error}</FieldError>
    </fieldset>
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
    error: 'border-red-300 bg-red-50 text-red-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
  } as const;
  return (
    <div role={role} className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}
