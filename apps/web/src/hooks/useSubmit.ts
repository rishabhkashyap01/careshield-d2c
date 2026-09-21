'use client';

import { startTransition, type FormEvent } from 'react';

/**
 * Submit a form to a useActionState action WITHOUT React 19's automatic form
 * reset, so the user's answers stay on screen when the server returns an error.
 * `beforeSubmit` can veto a submit (return false), e.g. a double-click guard.
 */
export function useSubmit(
  dispatch: (fd: FormData) => void,
  beforeSubmit?: () => boolean,
) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (beforeSubmit && !beforeSubmit()) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}
