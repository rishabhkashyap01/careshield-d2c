# @careshield/web

Next.js 16 (App Router) + Tailwind CSS 4 frontend for the CareShield Max purchase journey.
Phases 3 & 4: the whole journey from quote to issued policy.

## Run it

```bash
# from the repo root, with the API running (npm run api:dev)
cp apps/web/.env.example apps/web/.env.local
npm run web:dev            # http://localhost:3000
```

`API_URL` is a **server-only** variable (no `NEXT_PUBLIC_` prefix). The browser never calls the NestJS API directly.

## The experience

A marketing landing page (hero, how it works, transparent pricing, FAQ). Every "Get my price" button opens the purchase journey as a **pop-up**: a centred dialog on desktop and a bottom sheet on phones. Each step slides in:

1. **Your details:** age stepper and yes/no cards, with the pricing rules shown up front.
2. **Health:** six yes/no questions under a live price strip with a countdown ring.
3. **Payment:** order summary and payment-method cards.
4. **You're covered:** a confetti check and an animated policy card.

You can always go back or cancel:

- **Back** on the health step returns to your details, pre-filled. **Change details** on the payment step does the same.
- **Back to my quote** returns to where you were without changing anything.
- A completed **"Your details"** step in the progress bar can also be clicked.
- Submitting new details gives a fresh price and lock. The declaration has to be answered again, because it belongs to the old quote.
- **Cancel quote** asks "Discard this quote?", then clears the journey and closes the pop-up.

Nothing is sent to the API when you cancel. An abandoned quote simply expires after its 15-minute lock, and an expired quote can never be paid.

If you close the pop-up mid-journey, a floating **"Price locked · 12:31 left — Resume"** pill brings you back to the same step. The page's buttons change to "Resume my quote", and to "View my policy" after purchase.

**Accessibility.** The pop-up is a native `<dialog>` opened with `showModal()`. That traps focus inside, makes the page behind inert, and closes on Esc. Focus moves to each step's heading. Radio groups use real `<fieldset>`/`<legend>`. The countdown speaks only at 5 min, 2 min, 1 min, 30 s and 10 s. `prefers-reduced-motion` turns animations off.

| File | Role |
| ---- | ---- |
| `components/landing/Landing.tsx` | Landing page sections (server components) |
| `components/flow/FlowProvider.tsx` | Journey state shared by the page, pop-up and pill: quote, countdown, policy, recalculate |
| `components/flow/FlowDialog.tsx` | The pop-up: header, progress, price strip, animated step switcher |
| `components/flow/{Details,Health,Payment,Done}Step.tsx` | The four screens |
| `components/flow/{PriceBar,CountdownRing,StepHeader,ExpiredPanel,ResumePill,StartButton,PolicyCard,CancelQuote}.tsx` | Pieces of the pop-up and page |
| `components/ui.tsx`, `components/icons.tsx` | Buttons, alerts, yes/no control, inline SVG icons |

Fonts are Geist, bundled from the `geist` package, so the build downloads nothing.

## How it works

```
Browser ──form submit──► Server Action (src/app/actions.ts) ──fetch──► NestJS API
         ◄── state ─────                                    ◄── JSON ──
```

| Step | UI | Server Action | API |
| ---- | -- | ------------- | --- |
| 1. Quote | `DetailsStep` | `requestQuote` | `POST /insurance/quote` |
| 2. Declare | `HealthStep` | `submitDeclaration` | `POST /insurance/quote/:id/medical-declaration` |
| 3. Pay | `PaymentStep` | `payPremium` | `POST /insurance/checkout` |

### Task 3.1: accessible UI that posts securely

- **Server Actions only.** `src/lib/api.ts` imports `server-only`, so it can't be bundled into client code.
- **Validated twice.** Every action checks its input before calling the API, and the API validates again. Its per-field errors are shown next to the right input.
- **Accessibility:**
  - real `<label>`s, `<fieldset>`/`<legend>` radio groups, and `aria-invalid` + `aria-describedby` on errors;
  - a skip link and focus moved to each new step's heading;
  - `aria-current="step"` on the progress bar;
  - 44px touch targets;
  - visible focus rings;
  - `prefers-reduced-motion` respected.

### Task 3.2: countdown from the server's `expires_at`

- **Skew correction.** `useCountdown` measures `serverTime − Date.now()` when the quote arrives and counts down against the corrected clock, so a wrong device clock doesn't matter.
- **At zero,** the declaration and payment controls are disabled and an alert offers **Recalculate premium**. That re-submits the same inputs in a `useTransition`.
- **Server says expired.** If the API returns `410` first (for example, a laptop that was asleep), the UI switches to the same expired state.
- **Screen readers** hear announcements only at 5 min, 2 min, 1 min, 30 s, 10 s and expiry, not every second.

### Task 3.3: payment pending state and double-click prevention

`PaymentStep` uses `useActionState` and protects against double charges in three layers:

1. `pending` disables the button and payment options and shows "Processing payment…", with `aria-busy` and a live status message.
2. A synchronous `useRef` guard in `onSubmit` drops a second submit fired before React re-renders.
3. Each quote + payment method gets one `Idempotency-Key` (a UUID), reused on every retry of that request. The API stores the key, so a duplicate that reaches the server is still charged only once. Switching to another method is a new request with a new key, and the API's row lock on the quote still allows only one successful payment.

Tested in a headless browser against the real API: a double-click, three more rapid clicks and Enter produced **one** policy and **one** completed idempotency key in the database.

The forms submit through `useSubmit` (`src/hooks/useSubmit.ts`) instead of the `action` prop. That stops React 19's automatic form reset, so the user's answers stay on screen when the server returns an error.

## Try the payment outcomes

| Payment method | Result |
| -------------- | ------ |
| Visa 4242 / Mastercard 4444 / UPI | Policy issued |
| "Test card that is always declined" | 402. Nothing changes; pick another method and pay |

The full checkout API is documented in [apps/api/README.md](../api/README.md#checkout-phase-4).
