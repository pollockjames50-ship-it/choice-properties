# Property Management Platform

A **pure static frontend** deployed via Cloudflare Pages. There is no application server, no Node.js runtime server, no Python server, and no Docker configuration in this codebase.

All server-side logic runs on fully hosted third-party platforms:

- **Cloudflare Pages** — serves the static HTML / CSS / JS
- **Supabase Edge Functions** — handles all API logic (Deno functions deployed to Supabase's cloud)
- **Supabase PostgreSQL** — database with Row Level Security on all tables
- **ImageKit.io** — property photo CDN
- **Geoapify** — address autocomplete API

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a full breakdown of every component, all Edge Functions, database tables, the security model, and an explicit list of what does **not** exist in this repository.

## Deployment (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `node generate-config.js` |
| Build output directory | `/` (root) |
| Node.js version | 18 or higher |

No npm packages are installed at runtime. The build step uses only Node.js built-in modules.

### Required Environment Variables

Set these in your Cloudflare Pages dashboard under **Settings → Environment Variables**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SITE_URL` — your production domain (e.g. `https://yourdomain.com`, no trailing slash)
- `IMAGEKIT_URL`
- `IMAGEKIT_PUBLIC_KEY`
- `GEOAPIFY_API_KEY` *(optional — disables address autocomplete if missing)*
- `COMPANY_NAME`, `COMPANY_EMAIL`, `COMPANY_PHONE`, `COMPANY_TAGLINE`, `COMPANY_ADDRESS`

See [`SETUP.md`](SETUP.md) for the full setup guide including Supabase configuration.

## Local Development

Open any `.html` file directly in a browser, or serve locally with:

```bash
npx serve .
```

No build step is needed for local development.
