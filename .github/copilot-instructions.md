# Choice Properties — GitHub Copilot Instructions
# Official Copilot instruction file: .github/copilot-instructions.md
# Full rule set: .agents/instructions.md

## Project Type

Pure static website. No server. No backend in this repository.

- Frontend: Vanilla HTML, CSS, JavaScript
- Build: `node generate-config.js` (Node.js built-ins only, no npm packages)
- Deploy: Cloudflare Pages (auto-deploys on push to `main`)
- Backend: Supabase cloud (Edge Functions, PostgreSQL)

## Rules for Copilot

DO NOT suggest:
- `npm install <anything>` — no runtime dependencies
- Server setup, Express, Fastify, or any Node.js server
- Database connections, ORMs, or migration commands
- Creating `config.js` — it is generated at build time and gitignored
- Using `DATABASE_URL` or `PG*` environment variables

DO suggest:
- Static HTML, CSS, and vanilla JavaScript edits
- Supabase client calls using the existing `cp-api.js` patterns
- Deno TypeScript for Supabase Edge Functions in `supabase/functions/`

## Deployment

The only valid path to production is: push to GitHub → Cloudflare Pages auto-deploys.
There is no local preview server. There is no local build step needed during development.
