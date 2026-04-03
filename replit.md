# Property Rental Platform — Replit Setup

## Overview

A static HTML/CSS/JS site with a Supabase cloud backend, served locally via a lightweight Node.js server and deployed to Cloudflare Pages.

## Architecture

- **Frontend**: Static HTML/CSS/JS site (no frontend framework/bundler)
- **Backend**: Supabase cloud (PostgreSQL + Auth + Storage + Edge Functions)
- **Image CDN**: ImageKit
- **Address autocomplete**: Geoapify

## How It Runs on Replit

A lightweight Node.js server (`server.js`) serves the static files and dynamically generates `config.js` from environment variables. No npm packages are required — only built-in Node.js modules are used.

```
node server.js   → listens on port 5000
```

The server:
1. Generates `/config.js` on every request from environment variables
2. Serves all static files (HTML, CSS, JS, images, fonts) from the project root
3. Handles directory index resolution and `.html` extension inference

## Environment Variables

All environment variables and secrets are stored in Replit's Secrets / Environment panel (not hardcoded in any file).

| Variable | Type | Purpose |
|---|---|---|
| `SUPABASE_URL` | Env var | Supabase project URL |
| `SUPABASE_ANON_KEY` | **Secret** | Supabase anonymous key (public JWT, kept as secret) |
| `IMAGEKIT_URL` | Env var | ImageKit CDN base URL |
| `IMAGEKIT_PUBLIC_KEY` | Env var | ImageKit public upload key |
| `GEOAPIFY_API_KEY` | Env var | Address autocomplete API key |
| `COMPANY_NAME` | Env var | Displayed company name |
| `COMPANY_EMAIL` | Env var | Company contact email |
| `COMPANY_PHONE` | Env var | Company phone number |
| `COMPANY_ADDRESS` | Env var | Company address |
| `COMPANY_TAGLINE` | Env var | Company tagline |
| `SITE_URL` | Env var | Canonical site URL |
| `ADMIN_EMAILS` | Env var | Admin notification email(s) |
| `PORT` | Env var | Server port (default: 5000) |

## Key Files

| File | Purpose |
|---|---|
| `server.js` | Node.js static file server (Replit entry point) |
| `generate-config.js` | Cloudflare Pages build script (not used on Replit) |
| `js/cp-api.js` | Shared API client — wraps Supabase calls |
| `supabase/functions/` | Supabase Edge Functions (deployed via Supabase CLI) |
| `SETUP.sql` | Database schema (applied in Supabase dashboard) |
| `webfonts/` | Font Awesome webfont files |

## Supabase Edge Functions

The backend logic lives in `supabase/functions/`. These are deployed to Supabase directly (not run on Replit). They handle:
- `process-application` — application submissions
- `generate-lease` — lease generation
- `sign-lease` — tenant e-signatures
- `update-status` — application status updates
- `send-message` / `send-inquiry` — messaging
- `imagekit-upload` / `imagekit-delete` — photo management
- `mark-paid` / `mark-movein` — move-in tracking
- `get-application-status` — public status lookup

## Site Pages

- `/` — Homepage with property search
- `/listings.html` — Browse available properties
- `/property.html?id=...` — Individual property page
- `/apply.html` — Rental application form
- `/admin/` — Admin portal (login-protected)
- `/landlord/` — Landlord portal (login-protected)
- `/apply/lease.html` — Tenant lease signing
- `/apply/success.html` — Application success page

## Important Notes

- The Replit PostgreSQL database (auto-created) is **not used** — Supabase is the database
- Supabase Edge Functions are deployed to Supabase cloud, not hosted on Replit
- This project does not require `npm install` — no dependencies beyond built-in Node.js modules
- For deployment to production, use Cloudflare Pages (not Replit Deploy)
