# Choice Properties

## STATIC SITE — No backend server required

This repository contains a **pure static frontend** deployed via Cloudflare Pages. There is no application server, no Node.js runtime server, no Python server, and no Docker configuration in this codebase.

All server-side logic runs on fully hosted third-party platforms:

- **Cloudflare Pages** — serves the static HTML / CSS / JS
- **Supabase Edge Functions** — handles all API logic (10 Deno functions deployed to Supabase's cloud)
- **Supabase PostgreSQL** — database with Row Level Security on all tables
- **Google Apps Script** — email relay (deployed separately to Google's platform)
- **ImageKit.io** — property photo CDN
- **Geoapify** — address autocomplete API

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a full breakdown of every component, all Edge Functions, database tables, the security model, and an explicit list of what does **not** exist in this repository.

## Deployment

- **Cloudflare Pages root directory:** `/` (repository root)
- **Build command:** `node generate-config.js`
- **Build output directory:** `.`

No npm packages are installed at runtime. The build step uses only Node.js built-in modules.

## Frontend Audit & Improvements (April 2026)

A comprehensive frontend audit was completed to optimize mobile-first UX, performance, and code quality. All changes maintain the static site architecture and no backend modifications were made.

### Key Improvements

#### 1. Mobile Optimization
- **Responsive Layouts**: Property gallery collapses to single column on tablets (<900px) and simplifies on phones (<500px)
- **Touch Targets**: All interactive elements meet 44px minimum for accessibility
- **Property Cards**: Compressed mobile layout with stacked buttons and adjusted typography
- **Search Bar**: Vertical stacking on mobile devices

#### 2. Performance Enhancements
- **Font Awesome Local Hosting**: Replaced CDN dependency with local `/assets/fontawesome.css` for faster, more reliable loading
- **CSS Preload Strategy**: Converted all stylesheet links to preload with fallback, reducing render-blocking CSS
- **Image Lazy Loading**: Implemented across property galleries and listings (first image eager, others lazy)
- **Critical CSS Inlining**: Above-the-fold styles inlined for faster first paint

#### 3. Navigation Consistency
- **Shared Nav Component**: Unified navigation across public, apply, landlord, and admin sections
- **Portal Links**: Added "Landlord Portal" and "Admin Portal" links in mobile drawer and desktop nav
- **Route Highlighting**: Active nav links now highlight correctly for portal routes (e.g., `/landlord/*` activates landlord link)

#### 4. Code Quality
- **Inline Style Cleanup**: Moved inline styles to CSS files for better maintainability
- **Semantic HTML**: Ensured proper alt text, ARIA labels, and structure
- **Error-Free Code**: All modified files pass syntax validation

### Technical Details
- **Files Modified**: 11 HTML files, 5 CSS files, 1 JS file, 1 nav component
- **No Breaking Changes**: All improvements are backward-compatible
- **Static Site Preserved**: No runtime dependencies added
- **Validation**: `get_errors` clean across all touched files

### Performance Metrics (Target)
- First Contentful Paint (FCP): <1.5s
- Largest Contentful Paint (LCP): <2.5s
- Cumulative Layout Shift (CLS): <0.1
- Total Blocking Time (TBT): <200ms

### Testing Recommendations
- Visual QA in browser emulators: 320px, 375px, 414px, 768px, 1024px
- Lighthouse audit for performance scores
- Manual testing of nav, forms, and image loading

### Deployment Ready
All changes are production-ready and will auto-deploy via Cloudflare Pages on push to main branch.

### Notes

- Supabase Edge Functions have their own uptime dashboard at [app.supabase.com](https://app.supabase.com) → your project → Edge Functions.
- GAS (Google Apps Script) email relay does **not** have a public health endpoint. Monitor email delivery by reviewing the Email Logs page in the admin panel regularly, or set up a daily cron alert via UptimeRobot's "Keyword" monitor type pointed at a GAS-triggered status page if desired.
- Replace `your-domain.com` with your actual Cloudflare Pages domain before setting up monitors.
