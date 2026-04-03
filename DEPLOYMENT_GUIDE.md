# Deployment Guide

This project is deployed via **Cloudflare Pages** and uses **Supabase** as the backend.

---

## How Deployment Works

1. Push your changes to the `main` branch on GitHub.
2. Cloudflare Pages detects the push and auto-deploys the static site (1-2 min).
3. If you changed Supabase Edge Functions, Supabase auto-deploys them from git (1-2 min).

---

## Environment Variables

Set these in your **Cloudflare Pages** dashboard under Settings → Environment Variables:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon (public) key |
| `SITE_URL` | Your production domain (e.g. `https://yourdomain.com`) — no trailing slash |
| `IMAGEKIT_URL` | Your ImageKit URL endpoint |
| `IMAGEKIT_PUBLIC_KEY` | Your ImageKit public key |
| `GEOAPIFY_API_KEY` | (Optional) For address autocomplete |
| `COMPANY_NAME` | Your company name |
| `COMPANY_EMAIL` | Your company email |
| `COMPANY_PHONE` | (Optional) Your company phone |
| `COMPANY_TAGLINE` | Your company tagline |
| `COMPANY_ADDRESS` | (Optional) Your company address |

---

## Build Configuration (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `node generate-config.js` |
| Build output directory | `/` (root) |
| Node.js version | 18 or higher |

---

## Verifying Deployment

- Check Cloudflare Pages dashboard → your project → Deployments tab.
- Check Supabase dashboard → Edge Functions → deployment history.

---

## Local Development

This is a pure static site. Open any `.html` file in a browser, or use a simple local server:

```bash
npx serve .
```

No build step is needed for local development. The `config.js` file is generated at deploy time only.
