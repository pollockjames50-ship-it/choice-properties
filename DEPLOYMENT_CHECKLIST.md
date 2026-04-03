# Choice Properties — Zero-Failure Deployment Checklist

Follow this checklist in order every time you deploy to a new environment.
Each item maps to a known production failure. Do not skip any step.

---

## Part 1 — Supabase Project

### 1.1 Auth URL Configuration (prevents session/redirect failures)

In **Supabase Dashboard → Authentication → URL Configuration**:

- [ ] **Site URL** = your exact production domain, e.g. `https://yourdomain.com`
  - This must match the domain users will land on after any auth action
  - Do NOT use a Cloudflare preview URL here — it changes on every deploy
  - Do NOT leave as `http://localhost:3000` (the config.toml default)

- [ ] **Redirect URLs** — add ALL of:
  - `https://yourdomain.com`
  - `https://yourdomain.com/landlord/login.html`
  - `https://yourdomain.com/admin/login.html`
  - `https://yourdomain.com/apply/login.html`
  - If also testing on Replit: `https://*.replit.dev`

> **Why this matters:** A JWT issued for `yourdomain.com` is rejected on `preview-xxx.pages.dev`
> because the `aud` claim won't match. Auth appears to work locally but fails in production.

---

### 1.2 Edge Function Secrets (prevents broken emails, uploads, and lease signing)

In **Supabase Dashboard → Settings → Edge Functions → Environment Variables**:

- [ ] `GAS_EMAIL_URL` — your Google Apps Script web app URL
- [ ] `GAS_RELAY_SECRET` — must exactly match the `RELAY_SECRET` in your GAS script properties
- [ ] `RESEND_API_KEY` — if using Resend as primary email provider (optional, GAS is fallback)
- [ ] `RESEND_FROM` — sender address for Resend (e.g. `Choice Properties <noreply@yourdomain.com>`)
- [ ] `IMAGEKIT_PRIVATE_KEY` — from ImageKit → Developer Options
- [ ] `IMAGEKIT_URL_ENDPOINT` — from ImageKit → Developer Options
- [ ] `DASHBOARD_URL` — **CRITICAL**: your production domain, e.g. `https://yourdomain.com`
  - Used by `generate-lease` and `sign-lease` to build tenant signing links
  - Wrong value = every generated lease has broken signing links
- [ ] `ADMIN_EMAIL` — your admin notification email

After setting secrets, redeploy ALL edge functions (secrets do not hot-reload).

---

### 1.3 Edge Function Deployment (prevents ES256 JWT rejection)

- [ ] Verify `supabase/config.toml` has `verify_jwt = false` for every function
  - **Why:** New Supabase projects issue ES256 JWTs. The Supabase API gateway's built-in
    JWT verification uses HS256 and rejects ES256 tokens with HTTP 401 before the function
    runs. All functions handle their own auth via `getUser()` which is algorithm-agnostic.
  - All functions in this project have `verify_jwt = false` configured in `config.toml`.
    This is already correct — just confirm it hasn't been removed.

- [ ] Deploy all functions: `supabase functions deploy --project-ref YOUR_PROJECT_REF`
  - Or deploy individually per function if only some changed

---

### 1.4 Database Schema

- [ ] Run `SETUP.sql` in **Supabase Dashboard → SQL Editor → New query**
  - Run the full file on a fresh project, or check `SETUP.md` for incremental migration notes
- [ ] Confirm all tables exist: `applications`, `properties`, `landlords`, `co_applicants`,
  `messages`, `email_logs`, `rate_limit_log`, `admin_roles`, `admin_actions`

---

## Part 2 — Cloudflare Pages (Production Deployment)

### 2.1 Build Configuration

In **Cloudflare Pages → Settings → Builds & Deployments**:

| Setting | Value |
|---|---|
| Build command | `node generate-config.js` |
| Build output directory | `/` (root — NOT `dist` or `public`) |
| Node.js version | `18` or higher |

---

### 2.2 Environment Variables

In **Cloudflare Pages → Settings → Environment Variables**:

Set these for **Production** (and optionally **Preview** with different values):

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | From Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | `eyJ...` | Anon public key — safe to expose in browser |
| `SITE_URL` | `https://yourdomain.com` | No trailing slash. Must match Supabase Site URL |
| `IMAGEKIT_URL` | `https://ik.imagekit.io/yourID` | From ImageKit → Developer Options |
| `IMAGEKIT_PUBLIC_KEY` | `public_...` | From ImageKit → Developer Options |
| `GEOAPIFY_API_KEY` | your key | Optional — disables address autocomplete if missing |
| `COMPANY_NAME` | `Your Company` | Displayed in UI |
| `COMPANY_EMAIL` | `you@yourdomain.com` | Displayed in UI |
| `COMPANY_PHONE` | `555-555-5555` | Displayed in UI |
| `COMPANY_TAGLINE` | `Your tagline` | Displayed in UI |
| `COMPANY_ADDRESS` | `123 Main St...` | Displayed in UI |

> **SITE_URL must exactly match the Supabase Site URL** — they're used by different systems
> (Cloudflare builds config.js; Supabase validates redirect domains) but must be identical.
> A mismatch between these two is the #1 cause of "session expired" errors in production.

---

### 2.3 Custom Domain (if applicable)

- [ ] Add your custom domain in Cloudflare Pages → Custom domains
- [ ] After DNS propagates, update Supabase Auth Site URL to the custom domain
- [ ] Re-trigger a Cloudflare Pages deployment so `config.js` is rebuilt with the new `SITE_URL`

---

## Part 3 — Replit (Development Preview)

### 3.1 Environment Variables (Replit Secrets Panel)

- [ ] `SUPABASE_ANON_KEY` — set as a **Secret** (not an env var)

### 3.2 Environment Variables (Replit Env Vars Panel — Shared)

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `IMAGEKIT_URL` | `https://ik.imagekit.io/yourID` |
| `IMAGEKIT_PUBLIC_KEY` | `public_...` |
| `GEOAPIFY_API_KEY` | your key |
| `COMPANY_NAME` | your company name |
| `COMPANY_EMAIL` | your email |
| `COMPANY_PHONE` | your phone |
| `COMPANY_TAGLINE` | your tagline |
| `COMPANY_ADDRESS` | your address |
| `SITE_URL` | your production domain |
| `DASHBOARD_URL` | your production domain (same as SITE_URL) |
| `ADMIN_EMAILS` | your admin email |
| `PORT` | `5000` |

---

## Part 4 — Post-Deployment Verification

Run these checks after every deployment before considering it complete:

### 4.1 Frontend Config

- [ ] Visit `https://yourdomain.com/config.js` — confirm all variables are set (no empty strings)
- [ ] `SUPABASE_URL` ends in `.supabase.co` (not localhost)
- [ ] `SITE_URL` matches your actual domain

### 4.2 Auth Flow

- [ ] Landlord can register → login → see dashboard
- [ ] Admin can login → see admin dashboard
- [ ] Applicant OTP: request code → verify code → session persists after page refresh
- [ ] Session does NOT expire immediately or show "Your session expired" on first authenticated action

### 4.3 Edge Functions

- [ ] Submit a test application → confirm it appears in admin dashboard
- [ ] Send a test message from admin → confirm email sends (or logs as failed gracefully)
- [ ] Generate a lease → confirm the signing link is valid (contains your production domain, not localhost)

### 4.4 Image Uploads (requires ImageKit)

- [ ] Create a test property listing → upload a photo → confirm it appears via ImageKit CDN URL
- [ ] If upload fails with 401: verify `IMAGEKIT_PRIVATE_KEY` is set in Supabase edge function secrets

### 4.5 Lease Signing

- [ ] Generate a test lease → open the signing link → confirm it loads correctly
- [ ] The URL should be `https://yourdomain.com/apply/lease.html?id=...&token=...`
  - If it shows `undefined/apply/lease.html` → `DASHBOARD_URL` is not set in Supabase edge function secrets

---

## Common Failures & Fixes

| Symptom | Root Cause | Fix |
|---|---|---|
| "Your session expired" immediately | Supabase Site URL ≠ actual domain | Update Site URL in Supabase Auth settings |
| All edge function calls return HTTP 401 | `verify_jwt = true` with ES256 tokens | Confirm `verify_jwt = false` in config.toml, redeploy functions |
| Image upload fails with 401 | `IMAGEKIT_PRIVATE_KEY` not set in Supabase | Add key in Supabase → Settings → Edge Functions |
| Lease signing link goes to `undefined/...` | `DASHBOARD_URL` not set in Supabase | Add `DASHBOARD_URL` in Supabase → Edge Function secrets |
| Auth works locally, fails in production | `site_url` mismatch between environments | Set Supabase Site URL to production domain, not localhost |
| Email not sent, no error shown | `GAS_RELAY_SECRET` mismatch | Verify secret matches exactly in both Supabase and GAS script |
| Config.js has empty strings | Env vars not set in Cloudflare Pages | Add missing vars in Cloudflare Pages → Environment Variables |

---

## Key Architecture Rules (never violate these)

1. **`verify_jwt = false` on all functions** — functions do their own auth via `getUser()`
2. **`DASHBOARD_URL` in Supabase secrets, `SITE_URL` in Cloudflare** — they must be identical values
3. **`SUPABASE_ANON_KEY` is public** — it goes in Cloudflare env vars AND is embedded in `config.js`
4. **`SUPABASE_SERVICE_ROLE_KEY` is private** — it is auto-injected by Supabase runtime, never set it manually in Cloudflare
5. **Supabase Site URL = Cloudflare SITE_URL** — these two must always be identical
