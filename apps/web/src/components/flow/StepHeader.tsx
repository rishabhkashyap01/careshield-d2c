import { CheckIcon } from '../icons';
import type { FlowView } from './FlowProvider';

const STEPS = [
  { view: 'details', label: 'Your details' },
  { view: 'health', label: 'Health' },
  { view: 'payment', label: 'Payment' },
] as const;

export function StepHeader({ view }: { view: FlowView }) {
  const current = view === 'done' ? 3 : STEPS.findIndex((s) => s.view === view);
  return (
    <nav aria-label="Purchase progress">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.view} aria-current={active ? 'step' : undefined} className="min-w-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-[width] duration-500 ease-out ${
                    done ? 'w-full' : active ? 'w-1/2' : 'w-0'
                  }`}
                />
              </div>
              <p
                className={`mt-2 flex items-center gap-1 truncate text-xs font-semibold ${
                  active ? 'text-brand-700' : done ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {done && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-mint-500" />}
                <span className="truncate">{s.label}</span>
                {done && <span className="sr-only"> (completed)</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
