import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  viewBox: '0 0 24 24',
} as const;

export const ShieldIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 4.5 6v5.6c0 4.6 3.1 8.2 7.5 9.4 4.4-1.2 7.5-4.8 7.5-9.4V6L12 3Z" />
    <path d="m8.8 12.2 2.2 2.2 4.4-4.6" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const BoltIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />
  </svg>
);
export const LockIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const XIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ArrowRightIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ArrowLeftIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const HeartPulseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20.5 9.2c0 5-8.5 10.3-8.5 10.3S3.5 14.2 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2Z" />
    <path d="M3.8 12h4.2l1.7-2.6 2.6 5 1.7-2.4h6.2" />
  </svg>
);
export const CardIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M2.5 10h19M6 15h3.5" />
  </svg>
);
export const PhoneIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </svg>
);
export const SparkleIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);
export const UserIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c.9-3.8 3.9-5.8 7.5-5.8s6.6 2 7.5 5.8" />
  </svg>
);
export const DocIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 2.5H7A2.5 2.5 0 0 0 4.5 5v14A2.5 2.5 0 0 0 7 21.5h10a2.5 2.5 0 0 0 2.5-2.5V8L14 2.5Z" />
    <path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5" />
  </svg>
);
export const AlertIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </svg>
);

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-glow">
        <ShieldIcon className="h-5 w-5" />
      </span>
      <span>
        CareShield<span className="text-brand-400"> Max</span>
      </span>
    </span>
  );
}
