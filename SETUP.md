# Choice Properties — Setup Guide

Do these steps in order. Don't skip any.

---

## Step 1 — Generate Your Relay Secret

Generate a random 48-character secret. You can use any password manager, or run `openssl rand -hex 24` in your terminal.

Save it somewhere safe. You'll paste it in two places — both must match exactly or emails won't send.

---

## Step 2 — Supabase Project

1. Go to **supabase.com** → create a new project
2. Once it loads, go to **SQL Editor → New query**
3. Paste the **entire contents of `SETUP.sql`** → click **Run** → wait for the success message
4. That's it — one file, one run. No additional patch files needed.

> **What `SETUP.sql` includes:** full schema, all RLS policies, all database functions, all triggers, all indexes, all storage bucket definitions, and all table-level grants for `anon` and `authenticated` roles. Everything is in one file.

> **Optional — Enable pg_cron for automatic rate-limit log cleanup:**
> Supabase → **Database → Extensions** → search **pg_cron** → enable it.
> When enabled, `SETUP.sql` automatically registers a job that purges `rate_limit_log` entries older than 1 hour, running every 30 minutes. Without it the table still works correctly — rows accumulate but queries remain fast via an index. You can enable pg_cron any time (before or after running `SETUP.sql`) and re-run the script to register the cleanup job.

**Save these from Supabase → Project Settings → API:**
- Project URL (looks like `https://xxxx.supabase.co`)
- Anon public key (the `eyJ...` key labelled "anon public")

---

## Step 3 — Enable Email OTP in Supabase Auth

Supabase → **Authentication → Providers → Email:**
- Enable **OTP** (one-time code) — required for applicant login

Supabase → **Authentication → URL Configuration:**
- Site URL: `https://yourdomain.com`
- Redirect URLs — add both:
  - `https://yourdomain.com/landlord/login.html`
  - `https://yourdomain.com/admin/login.html`

---

## Step 4 — Supabase Edge Function Secrets

In Supabase → **Settings → Edge Functions → Environment Variables**, add these secrets:

| Secret Name | Value |
|---|---|
| `GAS_EMAIL_URL` | Your GAS Web App URL (you'll get this in Step 5) |
| `GAS_RELAY_SECRET` | Your relay secret from Step 1 |
| `IMAGEKIT_PRIVATE_KEY` | From ImageKit → Developer Options |
| `IMAGEKIT_URL_ENDPOINT` | From ImageKit → Developer Options |
| `ADMIN_EMAIL` | Your admin email address |
| `DASHBOARD_URL` | Your public site base URL e.g. `https://yourdomain.com` — **required for lease signing**. Used by the `generate-lease` and `sign-lease` Edge Functions to build the signing link sent to tenants. If missing or wrong, lease signing links will be broken and tenants will not be able to sign. |
| `FRONTEND_ORIGIN` | Same value as `DASHBOARD_URL` — used for CORS origin validation in Edge Functions. Must match exactly (no trailing slash). |

> ⚠️ **`DASHBOARD_URL` is critical.** Without it, generated leases will contain broken signing links. Set this before generating any lease.
> You can add ImageKit secrets later — everything else works without them.

---

## Step 5 — Google Apps Script Email Relay

1. Go to **script.google.com** → New project
2. Delete all default code, paste the entire contents of `GAS-EMAIL-RELAY.gs`
3. Click **Project Settings** (gear icon) → **Script Properties** → add these:

| Property | Value |
|---|---|
| `RELAY_SECRET` | Your relay secret from Step 1 — must be identical |
| `ADMIN_EMAILS` | Your admin email |
| `COMPANY_NAME` | Your business name |
| `COMPANY_EMAIL` | Your reply-to email |
| `COMPANY_PHONE` | Your phone number |
| `DASHBOARD_URL` | Your live site URL |

4. Click **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL → go back to Step 4 and add it as `GAS_EMAIL_URL`

> Future updates: always use **Deploy → Manage deployments → Edit (pencil)** — never create a new deployment or you'll get a new URL and break everything.

---

## Step 6 — Cloudflare Pages Frontend Deploy

1. Go to **dash.cloudflare.com** → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Connect your GitHub account and select your repository
3. Under **Set up builds and deployments**:
   - **Framework preset**: None
   - **Root directory**: `/` *(repository root)*
   - **Build command**: `node generate-config.js`
   - **Build output directory**: `.`
4. Under **Environment variables**, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `SITE_URL` | Your production domain e.g. `https://choiceproperties.com` (no trailing slash) — rewrites `sitemap.xml` and `robots.txt` at build time |
| `IMAGEKIT_URL` | `https://ik.imagekit.io/your-id` |
| `IMAGEKIT_PUBLIC_KEY` | Your ImageKit public key |
| `GEOAPIFY_API_KEY` | Your Geoapify API key (address autocomplete) |
| `COMPANY_NAME` | Your business name |
| `COMPANY_EMAIL` | Your business email |
| `COMPANY_PHONE` | Your phone number |
| `COMPANY_ADDRESS` | Your business address |
| `COMPANY_TAGLINE` | Your brand tagline e.g. `Your trust is our standard.` |
| `ADMIN_EMAILS` | Comma-separated admin email(s) e.g. `you@email.com` — used for UI display only. For server-side admin notifications, set `ADMIN_EMAIL` (singular) in Supabase Edge Function secrets (Step 4). |

5. Click **Save and Deploy**

From now on: every push to `main` → Cloudflare Pages auto-redeploys the frontend.

> **Custom domain**: Cloudflare Pages → your project → **Custom domains** → Add domain. SSL is automatic.

---

## Step 7 — Deploy Edge Functions (One Time)

1. Open your terminal and navigate to your project folder
2. Log in to Supabase CLI:
```
npx supabase login
```
3. Deploy all functions:
```
npx supabase functions deploy --project-ref cfsdhylbwzyuvcvbnrel
```
4. Go to **Supabase → Edge Functions** — you should see all functions listed and active

Only repeat this step if you edit the function code.

---

## Step 8 — Create Your Admin Account

**Option A — Via Supabase Dashboard (recommended):**
1. Supabase → **Authentication → Users** → **Add user** → enter your admin email and a strong password → click **Create user**
2. Copy the **User UID** shown in the users list
3. Supabase → **SQL Editor → New query** → run:

```sql
INSERT INTO admin_roles (user_id, email)
VALUES ('your-user-uid-here', 'your@email.com');
```

4. Go to `/admin/login.html` on your live site and sign in

**Option B — Self-register then elevate:**
1. Register a landlord account or any account on the live site
2. Supabase → **Authentication → Users** → find your email → copy the **User UID**
3. Run the same SQL INSERT above
4. Sign out and back in at `/admin/login.html`

> **Email confirmation must be OFF** for admin and landlord accounts. Supabase → Authentication → Providers → Email → toggle **"Confirm email" OFF**. If it is ON, `signUp()` will not return a session and account creation will fail.

---

## When You Change Domains

Update all of these — missing even one breaks something:

- Supabase Secrets: `DASHBOARD_URL` and `FRONTEND_ORIGIN`
- GAS Script Properties: `DASHBOARD_URL`
- Supabase → Authentication → URL Configuration: Site URL and both Redirect URLs
- Cloudflare Pages → your project → Custom domains (if applicable)

---

## Troubleshooting

**"Permission denied for table X" on login, registration, or any page action**
→ The table-level grants are missing. This only happens if `SETUP.sql` was run from an older version that did not include the `GRANT` statements at the bottom of the file.
→ Fix: In Supabase → SQL Editor, run the grant block manually:
```sql
GRANT SELECT ON properties TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON properties TO authenticated;
GRANT SELECT ON landlords TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON landlords TO authenticated;
GRANT SELECT, INSERT ON applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON applications TO authenticated;
GRANT SELECT, INSERT ON co_applicants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON co_applicants TO authenticated;
GRANT SELECT, INSERT ON inquiries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON inquiries TO authenticated;
GRANT SELECT, INSERT ON messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
GRANT SELECT ON email_logs TO authenticated;
GRANT SELECT ON admin_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_properties TO authenticated;
```
→ The current `SETUP.sql` already includes these — this only affects setups from before 2026-03-29.

**"Account setup failed" on landlord registration followed by "User already registered" on retry**
→ The auth user was created but the landlord profile INSERT failed (usually a table grant issue — see above).
→ Fix the grants first, then: Supabase → Authentication → Users → delete the orphaned user → have the user register again.

**Admin login says "Access denied. This account does not have admin privileges."**
→ The user logged in successfully but is not in the `admin_roles` table.
→ Fix: Supabase → SQL Editor → `INSERT INTO admin_roles (user_id, email) VALUES ('uid', 'email');`

**Emails not sending / email_logs shows `failed`**
→ Supabase → Edge Functions → click the function → Logs tab for the exact error
→ Most common: `GAS_EMAIL_URL` secret is wrong or GAS not deployed yet
→ Verify `GAS_RELAY_SECRET` matches `RELAY_SECRET` in GAS Script Properties exactly

**Site loads but shows errors / CONFIG not defined**
→ Environment variables not set in Cloudflare Pages → Settings → Environment variables
→ Trigger a redeploy: Cloudflare Pages → your project → Deployments → Retry deployment

**Address autocomplete not working**
→ `GEOAPIFY_API_KEY` not set — add it in Cloudflare Pages environment variables and redeploy

**Admin login redirects incorrectly after domain change**
→ Update redirect URLs in Supabase → Authentication → URL Configuration

**Lease signing link is broken**
→ `DASHBOARD_URL` in Supabase secrets is pointing to the old domain — update it

**Images not loading**
→ `IMAGEKIT_URL` environment variable is wrong or not set

---

*Choice Properties · Your trust is our standard.*
