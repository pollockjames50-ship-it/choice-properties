# Choice Properties — System Architecture

---

## ══════════════════════════════════════════════════════════
## STOP — AI AGENTS READ THIS FIRST — NON-NEGOTIABLE
## ══════════════════════════════════════════════════════════
##
## THIS PROJECT IS A STATIC WEBSITE. IT IS NOT BEING MIGRATED.
## IT IS FULLY SET UP. DO NOT TOUCH THE DATABASE. DO NOT MIGRATE.
##
## MANDATORY: Read `.agents/instructions.md` before any action.
## It contains the complete rule set that governs this project.
##
## SHORT VERSION — NEVER, UNDER ANY CIRCUMSTANCES:
## - Provision or connect to Replit/Neon PostgreSQL
## - Use DATABASE_URL, PGHOST, PGPASSWORD, or any PG variable
## - Install Drizzle, Prisma, Sequelize, or any ORM
## - Run db:push, db:migrate, or any database command
## - Create backend server files or api/ directories
## - Run wrangler or any Cloudflare CLI command
## - Run git push, git commit, or any git write command
##
## `integrations = ["javascript_database:1.0.0"]` IN .replit IS
## A LOCKED SYSTEM ARTIFACT. IT DOES NOT MEAN USE A LOCAL DB.
## IGNORE IT COMPLETELY. EVERY TIME. FOREVER. NO EXCEPTIONS.
##
## YOUR ONLY JOB: Edit static HTML, CSS, and frontend JS files.
## ══════════════════════════════════════════════════════════

---

## Overview

Choice Properties is a **pure static frontend** connected to fully hosted backend services. There is no application server in this repository. Every component runs either in the browser or on a third-party hosted platform.

```
Browser
  │
  ├── Cloudflare Pages CDN  ← serves static HTML / CSS / JS
  │
  ├── Supabase              ← database, auth, realtime, storage
  │     ├── PostgreSQL (RLS enforced on all tables)
  │     ├── Supabase Auth (landlord + admin login)
  │     ├── Realtime (application status updates)
  │     ├── Storage (lease PDFs, application docs — private)
  │     └── Edge Functions (10 Deno functions — API layer)
  │
  ├── Google Apps Script    ← email relay (deployed separately)
  │
  ├── ImageKit.io           ← property photo CDN + transforms
  │
  └── Geoapify              ← address autocomplete API
```

---

## Component Breakdown

### Frontend — Cloudflare Pages

| Type | Details |
|---|---|
| Language | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Framework | None |
| Build step | `node generate-config.js` — injects env vars into `config.js`, injects CSP nonces into all HTML inline scripts, rewrites `sitemap.xml` + `robots.txt` with `SITE_URL` |
| Structured data | JSON-LD on `index.html` (WebSite+SearchAction), `listings.html` (CollectionPage), `property.html` (RealEstateListing+BreadcrumbList) |
| Deployment | Cloudflare Pages (auto-deploy on push to `main`) |
| CDN | Cloudflare global CDN (automatic, no configuration needed) |
| Security headers | `_headers` file (X-Frame-Options, CSP, HSTS, etc.) — CSP `script-src` uses a per-build nonce injected by `generate-config.js` (I-052); `unpkg.com` removed from allowlist (I-054) |
| 404 handling | `_redirects` file (catch-all → `404.html`) |

The build step uses only Node.js built-in modules (`fs`, `process.env`). No npm packages are installed during the build.

---

### Backend API — Supabase Edge Functions

10 Deno-based Edge Functions deployed to Supabase's infrastructure:

| Function | Purpose | Auth required |
|---|---|---|
| `process-application` | Receive and store rental applications | Public (rate-limited) |
| `generate-lease` | Generate lease PDF and send signing link | Admin only |
| `sign-lease` | Process digital signatures | Token-based (no login) |
| `update-status` | Update application status | Admin / Landlord |
| `mark-paid` | Mark first month paid | Admin only |
| `mark-movein` | Confirm move-in | Admin only |
| `send-inquiry` | Send property inquiry to landlord | Public (rate-limited) |
| `send-message` | Send message in thread | Admin only |
| `imagekit-upload` | Authenticated photo upload to ImageKit | Authenticated user |
| `get-application-status` | Tenant status check by Application ID | Public (rate-limited) |

**Deployment:** `npx supabase functions deploy --project-ref cfsdhylbwzyuvcvbnrel` (one-time; see SETUP.md → Step 7)

These functions are NOT part of this repository's local runtime. They run on Deno in Supabase's cloud and never execute locally.

---

### Database — Supabase PostgreSQL

| Table | Description |
|---|---|
| `properties` | Rental listings |
| `landlords` | Landlord profiles |
| `applications` | Tenant applications (SSN masked to last-4) |
| `co_applicants` | Co-applicant data linked to applications |
| `messages` | Application thread messages |
| `inquiries` | Property inquiry submissions |
| `email_logs` | All email send attempts with status |
| `admin_roles` | Admin user registry |
| `admin_actions` | Admin audit trail — records every admin action with actor and timestamp |
| `saved_properties` | Tenant saved listings |
| `rate_limit_log` | DB-backed rate limiting — stores IP, endpoint, and timestamp |

Row Level Security (RLS) is enabled on all tables. The complete schema, RLS policies, triggers, indexes, and **table-level grants** are all in `SETUP.sql` — one file, one run.

**Key helper database functions:**
- `is_admin()` — returns `true` if the current session's user exists in `admin_roles`. Used in RLS policies across all tables.
- `immutable_array_to_text(arr text[], sep text)` — `IMMUTABLE` wrapper around `array_to_string`. Required for use in generated column expressions (PostgreSQL requires all functions in generated columns to be immutable).

> **Important:** RLS policies alone are not enough. PostgreSQL requires both a table-level `GRANT` (giving the role permission to touch the table at all) AND an RLS policy (determining which rows that role can see). Without the grants, all queries return `permission denied` even when valid RLS policies exist. `SETUP.sql` includes both. If you ever see `permission denied for table X`, run the grant block in `SETUP.sql` section 14 manually in the SQL Editor.

---

### Email — Google Apps Script Relay

A Google Apps Script Web App receives email requests from Supabase Edge Functions and sends them via Gmail. The script source is in `GAS-EMAIL-RELAY.gs` and must be manually deployed to Google's platform.

Secret verification (`RELAY_SECRET`) is enforced on every request. The GAS URL and secret live only in Supabase Edge Function secrets — never in the frontend.

---

### Image Storage — ImageKit.io

Property photos and landlord avatars are served through ImageKit's global CDN. Upload is handled by the `imagekit-upload` Edge Function (private key stays in Supabase secrets). The frontend receives CDN URLs and applies transform presets for different display sizes.

**Upload flow:**
```
Browser (imagekit.js)
  → fileToBase64(file)
  → POST /functions/v1/imagekit-upload
      { fileData, fileName, folder }   ← field name must be 'fileData'
  → Edge Function authenticates caller, forwards to ImageKit Upload API
  → Returns { success, url, fileId }
  → Browser stores url in properties.photo_urls[]
```

**Previously known gaps (all resolved as of Session 019):**
| Gap | Issue | Status |
|---|---|---|
| `fileId` is discarded — cannot delete from ImageKit | I-028 | ✅ RESOLVED |
| Photos removed from a listing are never deleted from CDN | I-015 | ✅ RESOLVED |
| Uploads are sequential (one at a time) — slow on mobile | I-016 | ✅ RESOLVED |

**Post-launch improvement (Phase 3 backlog):**
Replace `photo_urls TEXT[]` on the `properties` table with a dedicated `property_photos` table for per-photo metadata, sort order, and clean CDN deletion. See `.agents/instructions.md` Phase 3 backlog for details.

---

### Lease Storage — Supabase Storage

| Bucket | Access | Contents |
|---|---|---|
| `lease-pdfs` | Private | Signed lease HTML files |
| `application-docs` | Authenticated users only | Tenant-uploaded documents |

Signed URLs (7-day expiry) are generated on-demand by the `get-application-status` function. Files are never publicly accessible.

---

## Security Model

| Concern | Mechanism |
|---|---|
| Database access | Table-level grants (`GRANT`) + RLS policies on every table; service role key server-side only |
| Admin auth | JWT verified server-side against `admin_roles` table |
| SSN data | Masked to last-4 on receipt; never stored full |
| Lease signing | 192-bit random tokens per lease; verified server-side |
| Email relay | HMAC secret verified on every request |
| Rate limiting | In-memory per-IP limits on all public Edge Functions |
| File access | All sensitive buckets private; signed URLs only |
| CORS | Edge Functions use `Access-Control-Allow-Origin: *` (public API) |
| Frontend config | `config.js` generated at build time; gitignored; no-cache headers |

---

## What Does NOT Exist In This Repository

| What you might expect | Reality |
|---|---|
| Express / Fastify / Koa server | None — no server at all |
| Node.js API routes | None — Supabase Edge Functions handle all server logic |
| Python Flask / Django | None |
| Local database | None — Supabase is the database |
| Redis / queue / workers | None |
| Docker / docker-compose | None |
| `.env` file with secrets | None — secrets live in Supabase and GAS dashboards |
| npm packages for runtime | None — `generate-config.js` uses only Node.js built-ins |

---

## Local Development

Any static file server works. No build pipeline is needed for local development.

```bash
# From the repository root:
python3 -m http.server 8080
# OR
npx serve .
```

Create a local `config.js` from `config.example.js` with your Supabase credentials. This file is gitignored.

---

## Data Flow — Tenant Submits Application

```
Browser → POST /functions/v1/process-application
            │
            ├── Rate limit check (in-memory, per IP)
            ├── Duplicate check (email + property)
            ├── INSERT into applications (SSN masked server-side)
            ├── INSERT into email_logs (pending)
            └── POST to GAS relay → Gmail sends confirmation email
                    │
                    └── email_logs updated to success/failed
```

---

## Deployment Checklist

- [ ] Supabase project created, `SETUP.sql` run in SQL Editor (one file, one run — includes schema, RLS, functions, grants, and storage buckets)
- [ ] Supabase Edge Function secrets set (see SETUP.md Step 4 for full list)
- [ ] Google Apps Script deployed, URL added as `GAS_EMAIL_URL` secret
- [ ] Supabase Auth redirect URLs configured (Site URL + landlord + admin redirect URLs)
- [ ] Cloudflare Pages project created, all environment variables set (see SETUP.md Step 6)
- [ ] Edge Functions deployed — see SETUP.md Step 7. If deploying from mobile/no CLI, use the Supabase Dashboard → Edge Functions → Deploy via UI
- [ ] Admin account created via SQL insert into `admin_roles` (see SETUP.md Step 8)
- [ ] `health.html` checks passing on the live site
- [ ] At least 3–5 listings seeded via landlord dashboard so homepage shows live content

---

## Issue Registry

All tracked issues are resolved as of Session 019. See `ISSUES.md` for the full history.
For post-launch improvements (saved listings UI, rate limiting, lazy-load translations), see the Phase 3 backlog in `.agents/instructions.md`.
