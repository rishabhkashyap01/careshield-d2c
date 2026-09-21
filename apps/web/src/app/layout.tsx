import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareShield Max — Buy health insurance online',
  description: 'Get a locked quote, declare your health, and get covered instantly.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:ring-4 focus:ring-indigo-300"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
