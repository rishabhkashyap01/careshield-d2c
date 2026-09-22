# Deploying to Vercel + Neon

The repo deploys as **two Vercel projects** from the same GitHub repository:

| Vercel project | Root directory | What it is |
| -------------- | -------------- | ---------- |
| `careshield-api` | `apps/api` | NestJS API running as one serverless function (`apps/api/api/index.js`) |
| `careshield-web` | `apps/web` | Next.js website |

The database is **Neon** (PostgreSQL), connected through Vercel's Storage tab. Migrations run automatically on every API deploy (`vercel-build` → `prisma migrate deploy`).

## 1. Push to GitHub

1. On github.com, click **New repository**. Name it `careshield-d2c`, leave it **empty** (no README, .gitignore or licence), and create it.
2. In Terminal:

   ```bash
   cd ~/Desktop/Project/careshield-d2c
   git remote add origin https://github.com/<your-username>/careshield-d2c.git
   git push -u origin main
   ```

   If Git asks for a password, use a **personal access token** (GitHub → Settings → Developer settings → Personal access tokens), not your GitHub password. You can also run `gh auth login` first if you have the GitHub CLI.

## 2. Deploy the API

1. Go to vercel.com → **Add New… → Project**, then import `careshield-d2c`.
2. Set **Root Directory** to `apps/api`. Leave **Framework Preset** as **Other**; `apps/api/vercel.json` sets the build.
3. Under **Environment Variables**, add:
   - `DB_POOL_MAX` = `3`
   - `PAYMENT_WEBHOOK_SECRET` = a long random string (for example the output of `openssl rand -hex 32`). The payment provider signs webhooks with it.
   - `CRON_SECRET` = another long random string. It protects `/api/v1/payments/reconcile`, and Vercel Cron sends it automatically.
   - Optionally `MOCK_GATEWAY_WEBHOOK_URL` = `https://<api-project>.vercel.app/api/v1/payments/webhook`, so the mock gateway also delivers webhooks. Without it, slow payments are still settled by the page's status poll.
4. Click **Deploy**. **This first deploy is expected to fail**, because there's no database yet (`prisma migrate deploy` has no `DATABASE_URL`).
5. In the project, open **Storage → Create Database → Neon**. Pick a region near you and connect it to this project for all environments. This adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
6. Go to **Deployments**, open the ⋯ menu on the latest one, and click **Redeploy**.
7. Check it: `https://<api-project>.vercel.app/api/v1/health/ready` should return `{"status":"ok","database":"up",…}`.

**Tip:** put the API function in the same region as the database. Set **Settings → Functions → Function Region** to match Neon's region (for example Mumbai `bom1` with Neon `ap-south-1`). Checkout makes several queries, so this keeps it fast.

## 3. Deploy the website

1. Go to **Add New… → Project** again and import the **same** repository.
2. Set **Root Directory** to `apps/web`. Next.js is detected automatically.
3. Add the environment variable `API_URL` = `https://<api-project>.vercel.app/api/v1`, using the production URL from step 2.
4. Click **Deploy**, then open the site's URL.

## Good to know

- **`API_URL` is server-only.** The website's Server Actions call the API from Vercel's servers, so there's no CORS to configure.
- **Cold starts:** the first request after a quiet period takes about 1–2 s while the function starts. After that, requests are fast.
- **Mock payments:** the double-charge protection lives in the database, so it works across function instances. Only the mock gateway's own memory (its charges and `retrieve()`) is per-instance, and no real money is involved. A real provider doesn't have this limit.
- **Stuck payments:** to settle payments stuck in `PENDING_PAYMENT` even when nobody is polling, add a cron to `apps/api/vercel.json`: `"crons": [{ "path": "/api/v1/payments/reconcile", "schedule": "*/5 * * * *" }]`. On the Hobby plan Vercel only allows daily crons, for example `"0 3 * * *"`.
- **Updating:** every `git push` to `main` redeploys both projects, and the API applies any new migrations.
