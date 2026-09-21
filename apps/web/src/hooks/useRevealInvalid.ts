'use client';

import { useEffect, type RefObject } from 'react';

/**
 * After a failed submit, bring the first invalid field into view and focus it,
 * so users who pressed a button at the bottom of a long form see what's wrong.
 * `trigger` should change on every new result (e.g. the action state object).
 */
export function useRevealInvalid(
  formRef: RefObject<HTMLFormElement | null>,
  trigger: unknown,
  hasFieldErrors: boolean,
) {
  useEffect(() => {
    if (!hasFieldErrors) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!first) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    const target = first.matches('input, button, select, textarea')
      ? first
      : first.querySelector<HTMLElement>('input:not([disabled])');
    target?.focus({ preventScroll: true });
  }, [formRef, trigger, hasFieldErrors]);
}
