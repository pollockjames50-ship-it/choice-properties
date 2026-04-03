# Choice Properties — Replit Setup

## Overview

Choice Properties is a nationwide rental marketplace — a static HTML/CSS/JS site with a Supabase cloud backend.

## Architecture

- **Frontend**: Static HTML/CSS/JS site (no frontend framework/bundler)
- **Backend**: Supabase cloud (PostgreSQL + Auth + Storage + Edge Functions)
- **Image CDN**: ImageKit
- **Address autocomplete**: Geoapify
- **Email relay**: GAS (Google Apps Script) + Resend

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

Set in Replit's environment (already configured):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (public) |
| `IMAGEKIT_URL` | ImageKit CDN base URL |
| `IMAGEKIT_PUBLIC_KEY` | ImageKit public upload key |
| `GEOAPIFY_API_KEY` | Address autocomplete API key |
| `COMPANY_NAME` | Displayed company name |
| `COMPANY_EMAIL` | Company contact email |
| `COMPANY_PHONE` | Company phone number |
| `COMPANY_ADDRESS` | Company address |
| `SITE_URL` | Canonical site URL |
| `PORT` | Server port (default: 5000) |

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
