const STEPS = ['Your quote', 'Medical declaration', 'Pay & get covered'] as const;

export function Stepper({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <nav aria-label="Purchase progress">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className={`border-t-4 pt-2 text-sm ${
                done
                  ? 'border-emerald-600 text-slate-700'
                  : active
                    ? 'border-indigo-700 font-semibold text-slate-900'
                    : 'border-slate-200 text-slate-500'
              }`}
            >
              <span className="block text-xs uppercase tracking-wide">
                Step {i + 1}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
