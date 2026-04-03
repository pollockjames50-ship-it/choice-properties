# Choice Properties — Replit Setup

## Overview

A static HTML/CSS/JS property rental platform with a Supabase cloud backend, served on Replit via a lightweight Node.js static file server.

## Architecture

- **Frontend**: Static HTML/CSS/JS site (no frontend framework/bundler)
- **Backend**: Supabase cloud (PostgreSQL + Auth + Storage + Edge Functions)
- **Image CDN**: ImageKit
- **Address autocomplete**: Geoapify
- **Server**: Node.js (`server.js`) — serves static files and generates `config.js` from env vars

## How It Runs on Replit

The "Start application" workflow runs `node server.js`, which listens on port 5000.

The server:
1. Generates `/config.js` on every request from environment variables (no hardcoded values)
2. Serves all static files (HTML, CSS, JS, images, fonts) from the project root
3. Handles directory index resolution and `.html` extension inference

## Environment Variables & Secrets

All configuration is stored in Replit's Environment Variables and Secrets panels — nothing is hardcoded in source files.

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | Env var (shared) | Supabase project URL |
| `SUPABASE_ANON_KEY` | **Secret** | Supabase anonymous key (public JWT) |
| `IMAGEKIT_URL` | Env var (shared) | ImageKit CDN base URL |
| `IMAGEKIT_PUBLIC_KEY` | Env var (shared) | ImageKit public upload key |
| `GEOAPIFY_API_KEY` | Env var (shared) | Address autocomplete API key |
| `COMPANY_NAME` | Env var (shared) | Displayed company name |
| `COMPANY_EMAIL` | Env var (shared) | Company contact email |
| `COMPANY_PHONE` | Env var (shared) | Company phone number |
| `COMPANY_ADDRESS` | Env var (shared) | Company address |
| `COMPANY_TAGLINE` | Env var (shared) | Company tagline |
| `SITE_URL` | Env var (shared) | Canonical site URL |
| `ADMIN_EMAILS` | Env var (shared) | Admin notification email(s) |
| `PORT` | Env var (shared) | Server port (5000) |

## Key Files

| File | Purpose |
|---|---|
| `server.js` | Node.js static file server — Replit entry point |
| `generate-config.js` | Cloudflare Pages build script (not used on Replit) |
| `js/cp-api.js` | Shared API client — wraps Supabase calls |
| `supabase/functions/` | Supabase Edge Functions (deployed to Supabase, not run on Replit) |
| `SETUP.sql` | Database schema (applied in Supabase dashboard) |

## Supabase Edge Functions

Backend logic lives in `supabase/functions/` and is deployed to Supabase directly. They handle:
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
- No credentials are hardcoded anywhere — all config comes from Replit env vars/secrets
