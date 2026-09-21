import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareShield Max — Health cover in minutes',
  description:
    'Get a price in seconds, lock it for 15 minutes, declare your health and get covered instantly.',
};

export const viewport: Viewport = { themeColor: '#150838' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body className="min-h-dvh bg-white font-sans text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift focus:ring-4 focus:ring-brand-300"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
