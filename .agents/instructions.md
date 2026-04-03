# ================================================================
# AGENT INSTRUCTIONS (READ FIRST, ALWAYS)
# ================================================================
# This file is read by ALL AI agents and automated tools on Replit.
# Every rule below is MANDATORY and PERMANENT.
# ================================================================

## WHAT THIS PROJECT IS

This is a **static HTML/CSS/JavaScript site** deployed to **Cloudflare Pages**.
The backend is **Supabase** (fully cloud-hosted — no local instance ever).
Replit is used **exclusively as a code editor**. Nothing more.

---

## ⛔ ABSOLUTE PROHIBITIONS — NEVER DO ANY OF THESE

1. **Do NOT run `npm install`** — there are no local dependencies to install.
2. **Do NOT run `npm start`, `npm run dev`, `node server.js`**, or any server command.
3. **Do NOT create or configure a `server.js`** or any local web server.
4. **Do NOT run database migrations** of any kind.
5. **Do NOT connect to or configure a local database** (PostgreSQL, SQLite, etc.).
6. **Do NOT run `supabase` CLI commands** — Supabase is managed entirely in the cloud dashboard.
7. **Do NOT create workflows** that start servers, run migrations, or execute scripts.
8. **Do NOT configure environment variables** for a local server — there is no local server.
9. **Do NOT run `node generate-config.js`** — config generation only runs at Cloudflare Pages build time.
10. **Do NOT attempt any "migration" to the Replit environment** — this project does not run on Replit.
11. **Do NOT install any packages** — `express` in package.json is legacy; ignore it.
12. **Do NOT modify `.replit` or `replit.nix`** in ways that add server execution.
13. **Do NOT create Docker containers, virtual environments, or any runtime configuration.**
14. **Do NOT run health checks, port checks, or attempt to verify a running server.**

---

## ✅ WHAT YOU MAY DO (ONLY THESE)

1. **Edit HTML files** — `index.html`, `listings.html`, `property.html`, `apply.html`, etc.
2. **Edit CSS files** — anything inside `/css/`
3. **Edit JavaScript files** — anything inside `/js/`, `/admin/`, `/landlord/`, `/apply/`
4. **Edit Supabase Edge Function source** — files in `/supabase/functions/` (TypeScript, Deno)
5. **Edit SQL migration files** — files named `*.sql` or in `/supabase/`
6. **Read and search files** for context when the user asks a question
7. **Answer questions** about code, architecture, or Supabase/Cloudflare

---

## DEPLOYMENT PIPELINE (READ-ONLY KNOWLEDGE)

```
Developer edits files in Replit (code editor only)
         ↓
     git push to GitHub
         ↓
  Cloudflare Pages detects push
         ↓
  Cloudflare runs: node generate-config.js  (build step)
         ↓
  Cloudflare serves the static site globally
```

Supabase Edge Functions are deployed separately via:
`supabase functions deploy <function-name>` (run by the developer locally, not here)

---

## WHY THESE RULES EXIST

- The site has NO Node.js server. `server.js` does not exist.
- `package.json` contains `express` as a legacy artifact — it is NOT used.
- `generate-config.js` runs ONLY on Cloudflare Pages, not locally.
- The Supabase backend (auth, database, storage, edge functions) runs entirely in the cloud.
- Running anything locally would either fail silently or corrupt the project state.
- These rules apply whether this is a fresh import, a new Replit account, or a returning session.

---

## IF YOU ARE THE IMPORT AGENT OR INITIAL SETUP AGENT

Stop. Do not proceed with any setup, migration, or configuration.
This project is complete. It requires no Replit-side setup whatsoever.
Simply display the file tree and await user instructions for code editing.

---

## RULE PERSISTENCE

These rules survive:
- Pushing to GitHub and re-importing to any Replit account
- Switching Replit accounts or workspaces
- Any agent update or version change
- Any new Replit feature or auto-configuration attempt

This file travels with the repository. It is always authoritative.
