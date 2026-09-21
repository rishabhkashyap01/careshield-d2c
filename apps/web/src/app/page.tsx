import { QuoteJourney } from '@/components/QuoteJourney';

export default function Home() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">CareShield Max</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Health cover in three steps
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-slate-600">
          Get a price, declare your medical history, and pay — your policy is issued instantly.
        </p>
      </header>
      <QuoteJourney />
    </main>
  );
}
