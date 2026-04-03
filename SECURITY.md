# Security Policy — Choice Properties

## Architecture Overview

Choice Properties is a **static frontend** connected to Supabase cloud. All security-sensitive logic runs server-side in Supabase Edge Functions (Deno), not in this repository.

| Layer | Where it runs | Notes |
|---|---|---|
| Database | Supabase PostgreSQL | RLS policies + table grants on all tables |
| Auth | Supabase Auth | JWT verification server-side |
| API | Supabase Edge Functions | 10 Deno functions in Supabase's cloud |
| Email | Google Apps Script | HMAC secret verified on every request |
| CDN | Cloudflare Pages | Static files only; `_headers` enforces CSP, HSTS |
| Images | ImageKit.io | Public CDN; private key stays in Supabase secrets |

---

## What Lives in This Repository

Only static assets:
- HTML, CSS, and JavaScript files (no secrets)
- `config.example.js` (placeholder values only — no real credentials)
- Supabase Edge Function source (`supabase/functions/`) — deployed separately to Supabase's cloud

## What Does NOT Live in This Repository

- `config.js` — generated at Cloudflare build time; gitignored
- `.env` files — secrets belong in Supabase and GAS dashboards only
- Any private keys or credentials

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public GitHub issue.

Contact the project owner directly with:
1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact

Allow reasonable time for a fix before any public disclosure.

---

## Security Headers

All HTTP security headers are defined in `_headers` and enforced by Cloudflare Pages on every response. This includes:

- `Content-Security-Policy` with per-build CSP nonce (injected by `generate-config.js`)
- `Strict-Transport-Security` with preload
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Do not modify `_headers` without owner approval — changes affect the live security posture of the site.
