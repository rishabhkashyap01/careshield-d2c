'use client';

import type { ReactNode } from 'react';
import { ArrowRightIcon } from '../icons';
import { Button } from '../ui';
import { useFlow } from './FlowProvider';

/** Any "get a price" button on the page. Adapts once a quote or policy exists. */
export function StartButton({
  children = 'Get my price',
  variant = 'primary',
  size = 'lg',
  className = '',
}: {
  children?: ReactNode;
  variant?: 'primary' | 'light' | 'secondary';
  size?: 'md' | 'lg';
  className?: string;
}) {
  const { open, quote, policy, expired } = useFlow();
  const label = policy ? 'View my policy' : quote && !expired ? 'Resume my quote' : children;
  return (
    <Button type="button" variant={variant} size={size} onClick={open} className={className}>
      {label} <ArrowRightIcon className="h-4 w-4" />
    </Button>
  );
}
