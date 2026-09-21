'use client';

import { useEffect, useRef } from 'react';
import { Logo, XIcon } from '../icons';
import { DetailsStep } from './DetailsStep';
import { DoneStep } from './DoneStep';
import { ExpiredPanel } from './ExpiredPanel';
import { useFlow } from './FlowProvider';
import { HealthStep } from './HealthStep';
import { PaymentStep } from './PaymentStep';
import { PriceBar } from './PriceBar';
import { StepHeader } from './StepHeader';

const TITLES = {
  details: 'Get your price',
  health: 'Medical declaration',
  payment: 'Payment',
  done: 'Policy issued',
} as const;

/**
 * The purchase journey as a modal. Uses the native <dialog> element, which
 * gives us a real modal for free: focus is trapped inside, the page behind is
 * inert to screen readers, and Esc closes it. Bottom sheet on phones.
 */
export function FlowDialog() {
  const flow = useFlow();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (flow.isOpen && !d.open) d.showModal();
    if (!flow.isOpen && d.open) d.close();
  }, [flow.isOpen]);

  // Each step change moves focus to the new step's heading.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flow.isOpen) return;
    const id = requestAnimationFrame(() => body.current?.querySelector<HTMLElement>('h2')?.focus());
    return () => cancelAnimationFrame(id);
  }, [flow.view, flow.quote?.quoteId, flow.isOpen]);

  const showPriceBar = flow.view === 'health' || flow.view === 'payment';

  return (
    <dialog
      ref={ref}
      aria-labelledby="flow-title"
      onClose={flow.close}
      onClick={(e) => {
        if (e.target === e.currentTarget) flow.close(); // click on the backdrop
      }}
      className="flow-dialog fixed inset-x-0 bottom-0 top-auto m-0 w-full overflow-hidden rounded-t-[28px] bg-white p-0 text-ink shadow-lift open:animate-sheet-in sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(600px,calc(100vw-2rem))] sm:rounded-[28px] sm:open:animate-dialog-in"
    >
      <div className="flex max-h-[94dvh] flex-col sm:max-h-[min(880px,calc(100dvh-3rem))]">
        <div
          className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden"
          aria-hidden="true"
        />
        <header className="shrink-0 space-y-5 px-6 pb-5 pt-4 sm:pt-6">
          <div className="flex items-center justify-between gap-4">
            <Logo className="text-[15px]" />
            <h1 id="flow-title" className="sr-only">
              CareShield Max — {TITLES[flow.view]}
            </h1>
            <button
              type="button"
              onClick={flow.close}
              aria-label="Close"
              className="grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <StepHeader
            view={flow.view}
            onEditDetails={
              flow.view === 'health' || flow.view === 'payment' ? flow.editDetails : undefined
            }
          />
        </header>

        {showPriceBar && <PriceBar />}
        {showPriceBar && flow.expired && <ExpiredPanel />}

        <div
          ref={body}
          key={`${flow.view}-${flow.quote?.quoteId ?? 'new'}`}
          className="flex min-h-0 flex-1 animate-step-in flex-col pt-4 [&_h2]:scroll-mt-4"
        >
          {flow.view === 'details' && <DetailsStep />}
          {flow.view === 'health' && <HealthStep />}
          {flow.view === 'payment' && <PaymentStep />}
          {flow.view === 'done' && <DoneStep />}
        </div>
      </div>
    </dialog>
  );
}
