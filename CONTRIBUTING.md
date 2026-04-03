# Contributing to Choice Properties

## Read Before You Do Anything

This is a **pure static website**. Before making any change, read `.agents/instructions.md` in full.

---

## What This Project Is

| Item | Detail |
|---|---|
| Type | Static HTML / CSS / Vanilla JS site |
| Hosting | Cloudflare Pages — auto-deploys on push to `main` |
| Backend | Supabase cloud (not in this repo) |
| Build | `node generate-config.js` — Node.js built-ins only, no npm packages |

---

## Non-Negotiable Rules

These apply to all contributors, human or AI:

1. **Do not run `npm install`** — there are no runtime dependencies. The `preinstall` script will block you.
2. **Do not run `npm start`** — there is no local server.
3. **Do not commit `config.js`** — it is gitignored and generated at Cloudflare build time. Committing it leaks credentials.
4. **Do not use `DATABASE_URL` or any `PG*` variable** — Replit injects these; they are irrelevant to this project.
5. **Do not install any ORM** — the database is Supabase cloud.
6. **Do not modify protected files** without explicit owner approval:
   - `generate-config.js`
   - `_headers`
   - `SETUP.sql`
   - `js/cp-api.js`
   - `js/apply*.js`

---

## How to Contribute

1. Edit static `.html`, `.css`, or `.js` files
2. Push your branch to GitHub
3. Open a pull request — Cloudflare Pages will generate a preview URL for the PR automatically
4. Owner reviews and merges
5. Cloudflare Pages auto-deploys to production on merge to `main`

---

## What You Do Not Need

- Node.js running locally
- A local server or dev server
- npm packages installed
- A `.env` file (secrets live in Supabase and GAS dashboards only)
- Any database setup

---

## Questions

See `ARCHITECTURE.md` for a full system breakdown, or `.agents/instructions.md` for the complete rule set.
