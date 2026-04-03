// ============================================================
// Choice Properties — Config Generator
// Runs at build time to create config.js from environment vars
// Runs at Cloudflare Pages build time — triggered by GitHub push
// Never edit config.js directly — edit this file instead
// ============================================================

(async function main() {

const fs = require('fs');

// Read from environment variables (set in your hosting platform's dashboard)
const config = {
  SUPABASE_URL:      process.env.SUPABASE_URL      || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',

  // I-029: SITE_URL is used to rewrite sitemap.xml and robots.txt at build time.
  // Set this to your production domain in your hosting platform's env var dashboard.
  // Example: https://choiceproperties.com  (no trailing slash)
  SITE_URL: (process.env.SITE_URL || '').replace(/\/$/, ''),

  IMAGEKIT_URL:        process.env.IMAGEKIT_URL        || '',
  IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY || '',

  GEOAPIFY_API_KEY: process.env.GEOAPIFY_API_KEY || '',

  COMPANY_NAME:     process.env.COMPANY_NAME     || 'Choice Properties',
  COMPANY_EMAIL:    process.env.COMPANY_EMAIL    || 'hello@choiceproperties.com',
  COMPANY_PHONE:    process.env.COMPANY_PHONE    || '',
  COMPANY_TAGLINE:  process.env.COMPANY_TAGLINE  || 'Your trust is our standard.',
  COMPANY_ADDRESS:  process.env.COMPANY_ADDRESS  || '',

  LEASE_DEFAULT_LATE_FEE_FLAT:  Number(process.env.LEASE_DEFAULT_LATE_FEE_FLAT)  || 50,
  LEASE_DEFAULT_LATE_FEE_DAILY: Number(process.env.LEASE_DEFAULT_LATE_FEE_DAILY) || 10,
  LEASE_DEFAULT_EXPIRY_DAYS:    Number(process.env.LEASE_DEFAULT_EXPIRY_DAYS)    || 7,

  FEATURES: {
    CO_APPLICANT:    process.env.FEATURE_CO_APPLICANT    !== 'false',
    VEHICLE_INFO:    process.env.FEATURE_VEHICLE_INFO    !== 'false',
    DOCUMENT_UPLOAD: process.env.FEATURE_DOCUMENT_UPLOAD !== 'false',
    MESSAGING:       process.env.FEATURE_MESSAGING       !== 'false',
    REALTIME_UPDATES:process.env.FEATURE_REALTIME_UPDATES !== 'false',
  },
};

// Validate required values
// I-051: SITE_URL is required — without it, sitemap.xml and robots.txt ship with
// YOUR-DOMAIN.com placeholders, breaking SEO and crawler discovery in production.
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'IMAGEKIT_URL', 'IMAGEKIT_PUBLIC_KEY', 'SITE_URL'];
const missing  = required.filter(k => !config[k]);
if (missing.length) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.error('   Set these in your hosting platform\'s environment variables dashboard');
  if (missing.includes('SITE_URL')) {
    console.error('   SITE_URL example: https://choiceproperties.com  (no trailing slash)');
    console.error('   Without SITE_URL, sitemap.xml ships with YOUR-DOMAIN.com placeholders.');
  }
  process.exit(1);
}

if (!config.GEOAPIFY_API_KEY) {
  console.warn('⚠  GEOAPIFY_API_KEY is not set — address autocomplete will be disabled');
}

// ── M-09: Validate Supabase credentials with a live HTTP probe ───────────────
// A non-empty URL/key can still be wrong (typo, wrong project).
// GET /rest/v1/ with the anon key returns:
//   200  → URL correct, key valid
//   401  → URL correct, key invalid (still a useful signal)
//   anything else / timeout → URL is wrong
// Build fails fast rather than deploying a broken site.
await (async function validateSupabaseCredentials() {
  const testUrl = config.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';
  console.log('🔍 Validating Supabase credentials against', testUrl);
  try {
    const https = require('https');
    const url   = require('url');
    const parsed = url.parse(testUrl);
    await new Promise(function(resolve, reject) {
      const req = https.request({
        hostname: parsed.hostname,
        path:     parsed.path,
        method:   'GET',
        headers:  { apikey: config.SUPABASE_ANON_KEY },
        timeout:  8000,
      }, function(res) {
        if (res.statusCode === 200) {
          console.log('✅ Supabase credentials validated (HTTP 200)');
          resolve();
        } else if (res.statusCode === 401) {
          // Read body to distinguish "valid key, schema restricted" from "invalid key"
          let body = '';
          res.on('data', function(chunk) { body += chunk; });
          res.on('end', function() {
            try {
              const parsed = JSON.parse(body);
              if (parsed.message && parsed.message.includes('Access to schema is forbidden')) {
                // Key is valid — project restricts schema listing to service_role only
                console.log('✅ Supabase credentials validated (schema-restricted project, key accepted)');
                resolve();
                return;
              }
            } catch (e) { /* ignore JSON parse errors */ }
            console.error('❌ Supabase credential check failed: URL is reachable but SUPABASE_ANON_KEY is invalid (HTTP 401).');
            console.error('   Double-check the anon key in your hosting platform environment variables.');
            process.exit(1);
          });
        } else {
          console.error('❌ Supabase credential check failed: unexpected HTTP ' + res.statusCode + ' from ' + testUrl);
          console.error('   Check that SUPABASE_URL is correct and the project is not paused.');
          process.exit(1);
        }
      });
      req.on('timeout', function() {
        req.destroy();
        console.error('❌ Supabase credential check timed out. Verify SUPABASE_URL is correct and the project is active.');
        process.exit(1);
      });
      req.on('error', function(err) {
        console.error('❌ Supabase credential check network error:', err.message);
        console.error('   Verify SUPABASE_URL is a valid HTTPS URL.');
        process.exit(1);
      });
      req.end();
    });
  } catch (err) {
    console.error('❌ Supabase credential check threw an unexpected error:', err.message);
    process.exit(1);
  }
})();

// Generate config.js
const output = `// ============================================================
// Choice Properties — Auto-generated config
// Generated by generate-config.js at build time
// DO NOT EDIT THIS FILE — it is overwritten on every deploy
// Edit environment variables in your hosting platform dashboard
// ============================================================

const CONFIG = {
  SUPABASE_URL:      '${config.SUPABASE_URL}',
  SUPABASE_ANON_KEY: '${config.SUPABASE_ANON_KEY}',

  IMAGEKIT_URL:        '${config.IMAGEKIT_URL}',
  IMAGEKIT_PUBLIC_KEY: '${config.IMAGEKIT_PUBLIC_KEY}',

  GEOAPIFY_API_KEY: '${config.GEOAPIFY_API_KEY}',

  COMPANY_NAME:     '${config.COMPANY_NAME}',
  COMPANY_EMAIL:    '${config.COMPANY_EMAIL}',
  COMPANY_PHONE:    '${config.COMPANY_PHONE}',
  COMPANY_TAGLINE:  '${config.COMPANY_TAGLINE}',
  COMPANY_ADDRESS:  '${config.COMPANY_ADDRESS}',

  LEASE_DEFAULT_LATE_FEE_FLAT:  ${config.LEASE_DEFAULT_LATE_FEE_FLAT},
  LEASE_DEFAULT_LATE_FEE_DAILY: ${config.LEASE_DEFAULT_LATE_FEE_DAILY},
  LEASE_DEFAULT_EXPIRY_DAYS:    ${config.LEASE_DEFAULT_EXPIRY_DAYS},

  FEATURES: {
    CO_APPLICANT:     ${config.FEATURES.CO_APPLICANT},
    VEHICLE_INFO:     ${config.FEATURES.VEHICLE_INFO},
    DOCUMENT_UPLOAD:  ${config.FEATURES.DOCUMENT_UPLOAD},
    MESSAGING:        ${config.FEATURES.MESSAGING},
    REALTIME_UPDATES: ${config.FEATURES.REALTIME_UPDATES},
  },
};

// Derived helpers
CONFIG.isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
CONFIG.baseUrl     = location.origin;

// ImageKit delivery helper
CONFIG.img = function(url, preset) {
  const fallback = url || '/assets/placeholder-property.jpg';
  if (!url) return '/assets/placeholder-property.jpg';
  if (!CONFIG.IMAGEKIT_URL || CONFIG.IMAGEKIT_URL.includes('YOUR_IMAGEKIT_ID')) {
    return fallback;
  }
  const transforms = {
    card:       'tr:w-600,q-80,f-webp',
    card_2x:    'tr:w-1200,q-80,f-webp',
    gallery:    'tr:w-1200,q-90,f-webp',
    gallery_2x: 'tr:w-2400,q-85,f-webp',
    strip:      'tr:w-80,h-60,c-maintain_ratio,q-70,f-webp',
    thumb:      'tr:w-120,h-120,c-maintain_ratio,q-75,f-webp',
    lightbox:   'tr:q-95,f-webp',
    og:         'tr:w-1200,h-630,c-force,fo-center,q-85,f-webp',
    avatar:     'tr:w-80,h-80,c-force,fo-face,q-80,f-webp',
    avatar_lg:  'tr:w-160,h-160,c-force,fo-face,q-85,f-webp',
  };
  const tr = transforms[preset] || transforms.gallery;
  if (url.startsWith(CONFIG.IMAGEKIT_URL)) {
    const clean = url.replace(/\\/tr:[^/]+/, '');
    return clean.replace(CONFIG.IMAGEKIT_URL, \`\${CONFIG.IMAGEKIT_URL}/\${tr}\`);
  }
  // External URLs (Zillow CDN, S3, etc.) — serve directly, never proxy through ImageKit
  return url;
};

CONFIG.srcset = function(url, preset1x, preset2x) {
  const u1 = CONFIG.img(url, preset1x);
  const u2 = CONFIG.img(url, preset2x);
  if (!u1) return '';
  if (!u2 || u2 === u1) return u1;
  return u1 + ' 1x, ' + u2 + ' 2x';
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.FEATURES);
`;

fs.writeFileSync('config.js', output);
console.log('✅ config.js generated successfully from environment variables');

// ── I-029 / I-051: Rewrite sitemap.xml and robots.txt with real domain ──────
// SITE_URL is now required (validated above) so this block always runs.
// Replaces YOUR-DOMAIN.com placeholder with the value of SITE_URL env var.
if (config.SITE_URL) {
  const PLACEHOLDER = 'YOUR-DOMAIN.com';
  const domain = config.SITE_URL.replace(/^https?:\/\//, ''); // strip protocol for bare replacements

  ['sitemap.xml', 'robots.txt'].forEach(function (filename) {
    if (!fs.existsSync(filename)) return;
    const original = fs.readFileSync(filename, 'utf8');
    const rewritten = original
      .split('https://' + PLACEHOLDER).join(config.SITE_URL)
      .split('http://'  + PLACEHOLDER).join(config.SITE_URL)
      .split(PLACEHOLDER).join(domain);
    if (rewritten !== original) {
      fs.writeFileSync(filename, rewritten);
      console.log('✅ ' + filename + ' domain updated to ' + config.SITE_URL);
    }
  });
}

// ── I-052: CSP nonce injection — eliminates 'unsafe-inline' from script-src ─
// Generates a fresh random nonce on every build.
// Injects nonce="<value>" into every inline <script> and <script type="module">
// tag across all HTML files, then rewrites _headers CSP to use 'nonce-<value>'
// instead of 'unsafe-inline'. Since Cloudflare Pages deploys _headers as a
// static file per build, the nonce is consistent within each deployment.
// ── H-07: Automated cache busting — replace ?v=__BUILD_VERSION__ in all HTML ──
// BUILD_VERSION is a timestamp set once per build. Every deploy automatically
// produces unique ?v= strings, so browsers always fetch the latest CSS/JS files
// even when _headers sets Cache-Control: immutable on /css/* and /js/*.
const htmlFiles = (function walk(dir) {
  const results = [];
  fs.readdirSync(dir).forEach(function(name) {
    const full = dir + '/' + name;
    if (fs.statSync(full).isDirectory()) {
      results.push.apply(results, walk(full));
    } else if (name.endsWith('.html')) {
      results.push(full);
    }
  });
  return results;
})('.');

const BUILD_VERSION = Date.now().toString();

htmlFiles.forEach(function(file) {
  const src = fs.readFileSync(file, 'utf8');
  const updated = src.replace(/\?v=__BUILD_VERSION__/g, '?v=' + BUILD_VERSION);
  if (updated !== src) {
    fs.writeFileSync(file, updated);
  }
});
console.log('✅ Cache-bust token replaced in HTML files (BUILD_VERSION: ' + BUILD_VERSION + ')');
// NOTE: Nonce-based CSP injection was removed. _headers uses 'unsafe-inline' for script-src
// because the onload="this.rel='stylesheet'" CSS preload pattern requires it, and nonces
// were causing CSP mismatches on every Cloudflare deploy (nonce in _headers changed each
// build but HTML nonces stayed baked-in from a previous committed build output).

})().catch(function(err) {
  console.error('Build script error:', err);
  process.exit(1);
});
