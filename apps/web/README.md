# @careshield/web

Next.js 16 (App Router) + Tailwind CSS 4 website for the CareShield Max purchase journey.

```bash
npm run dev        # http://localhost:3000 (needs apps/web/.env.local and the API running)
npm run build
npm run lint
```

## The experience

A landing page (hero, how it works, pricing, FAQ). Every "Get my price" button opens the journey as a **pop-up**: a centred dialog on desktop, a bottom sheet on phones.

1. **Your details:** age and pre-existing conditions → a price locked for 15 minutes.
2. **Health:** six yes/no questions under a live price strip with a countdown ring.
3. **Payment:** order summary and a mock payment method.
4. **You're covered:** the issued policy, shown as a card.

**Navigation:**

- **Back** and **Change details** return to your details, pre-filled. Resubmitting the same details keeps the same quote and timer; changed details get a new quote.
- **Cancel quote** asks for confirmation, then discards the quote.
- **Closing the pop-up** leaves a "Price locked · mm:ss — Resume" pill on the page.
- **Errors appear just above the buttons,** and the first unanswered question is scrolled into view.

## How it works

```
Browser ── form submit ──► Server Action (src/app/actions.ts) ── fetch ──► NestJS API
```

- **The browser never calls the API.** `src/lib/api.ts` is `server-only`, and `API_URL` is a server-side variable.
- **Journey state lives in one place.** `components/flow/FlowProvider.tsx` holds the quote, countdown, policy and recalculate logic, shared by the page buttons, the pop-up and the resume pill.

| Task | How |
| ---- | --- |
| 3.1 Accessible UI | Native `<dialog>` (focus trap, Esc to close); real labels and `fieldset`/`legend`; focus moves to each step's heading; `prefers-reduced-motion` respected |
| 3.2 Countdown | `hooks/useCountdown.ts` corrects for device-clock skew using the server's `serverTime`. At 0 the buttons are disabled and **Recalculate premium** re-quotes. A 410 from the API triggers the same state |
| 3.3 No double payment | `PaymentStep.tsx`: `useActionState`'s `pending` disables Pay and shows "Processing payment…"; a ref guard drops clicks that arrive before React re-renders; one `Idempotency-Key` per quote + payment method is reused on retries |

| Folder | Contents |
| ------ | -------- |
| `src/app/` | `page.tsx`, `layout.tsx`, `actions.ts` (the three Server Actions) |
| `src/components/flow/` | The pop-up, its steps and its pieces |
| `src/components/landing/` | Landing page sections |
| `src/components/ui.tsx`, `icons.tsx` | Buttons, alerts, yes/no control, inline SVG icons |
| `src/hooks/` | `useCountdown`, `useSubmit` (submits without React's form reset, so answers survive errors), `useRevealInvalid` |
| `src/lib/` | Server-only API client, shared types, formatting |
