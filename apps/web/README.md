# @careshield/web

Next.js 16 (App Router) + Tailwind CSS 4 frontend for the CareShield Max purchase journey.
**Phase 3:** optimistic flow & expiry gate.

## Run it

```bash
# from the repo root, with the API running (npm run api:dev)
cp apps/web/.env.example apps/web/.env.local
npm run web:dev            # http://localhost:3000
```

`API_URL` is a **server-only** variable (no `NEXT_PUBLIC_` prefix). The browser never calls the NestJS API directly.

## How it works

```
Browser ──form submit──► Server Action (src/app/actions.ts) ──fetch──► NestJS API
         ◄── state ─────                                    ◄── JSON ──
```

| Step | UI | Server Action | API |
| ---- | -- | ------------- | --- |
| 1. Quote | `QuoteForm` | `requestQuote` | `POST /insurance/quote` |
| 2. Declare | `DeclarationForm` | `submitDeclaration` | `POST /insurance/quote/:id/medical-declaration` |
| 3. Pay | `PaymentForm` | `payPremium` | `POST /insurance/checkout` *(Phase 4)* |

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

`PaymentForm` uses `useActionState` and protects against double charges in three layers:

1. `pending` disables the button and payment options and shows "Processing payment…", with `aria-busy` and a live status message.
2. A synchronous `useRef` guard in `onSubmit` drops a second submit fired before React re-renders.
3. One `Idempotency-Key` (a UUID) is created per quote and reused on retries. Phase 4 enforces it on the server.

Tested in a headless browser: a double-click, three more rapid clicks and Enter produced **one** checkout request.

## Checkout contract (implemented in Phase 4)

```
POST /api/v1/insurance/checkout
Idempotency-Key: <uuid>
{ "quoteId": "<uuid>", "paymentToken": "tok_visa_4242" }

201 → { policyNumber, quoteId, status, premiumPaid, currency,
        paymentReference, coverageStart, coverageEnd, issuedAt }
410 → quote expired · 402 → payment declined · 409 → wrong state
```

Until Phase 4 lands, **Pay** shows "Online checkout isn't available yet. You have not been charged."
