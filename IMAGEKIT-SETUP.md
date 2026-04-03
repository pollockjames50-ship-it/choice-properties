# Choice Properties — ImageKit Setup Guide

ImageKit handles all property photos and landlord avatars. It's optional for launch — placeholder images show until configured. Everything else (applications, leases, emails, messaging) works without it.

---

## What ImageKit Does

- Serves all property photos and landlord avatars through a global CDN
- Auto-optimizes images per context (card thumbnails, full gallery, open graph, etc.)
- Handles secure server-side uploads via the `imagekit-upload` Edge Function
- Supabase Storage is still used for `application-docs` and `lease-pdfs` (unchanged)

---

## Step 1 — Create Your ImageKit Account

1. Go to **https://imagekit.io** → Sign up free
2. After signup, go to **Dashboard → Developer Options**
3. Copy these three values:
   - **URL Endpoint** — looks like `https://ik.imagekit.io/abc123xyz`
   - **Public Key** — looks like `public_XXXXXXXXXXXXXXXX`
   - **Private Key** — looks like `private_XXXXXXXXXXXXXXXX` ← keep secret, never put in frontend code

---

## Step 2 — Add Secrets to Supabase

The private key lives only in Supabase Edge Function secrets — never in the frontend.

Go to **Supabase → Edge Functions → Manage Secrets** and add:

| Secret Name | Value |
|---|---|
| `IMAGEKIT_PRIVATE_KEY` | Your ImageKit private key |
| `IMAGEKIT_URL_ENDPOINT` | Your ImageKit URL endpoint |

---

## Step 3 — Add Keys to Cloudflare Pages

Go to **Cloudflare Pages → your project → Settings → Environment variables** and add:

| Variable | Value |
|---|---|
| `IMAGEKIT_URL` | Your ImageKit URL endpoint (same as above) |
| `IMAGEKIT_PUBLIC_KEY` | Your ImageKit public key |

After adding these, trigger a redeploy: **Cloudflare Pages → your project → Deployments → Retry deployment** (or push any commit to `main`).

---

## Step 4 — Verify It's Working

After a landlord uploads a photo through the listing form:

1. Go to **ImageKit Dashboard → Media Library**
2. You should see a `/properties/PROP-XXXX/` folder with the uploaded images
3. On the listings page, open browser DevTools → Network → Images
4. Image URLs should start with `https://ik.imagekit.io/...`
5. You'll see `/tr:w-600,q-80,f-webp/` in the URL — that's the optimization working

---

## Image Presets Reference

| Preset | Used for | Transform |
|---|---|---|
| `card` | Listings grid card | 600px wide, 80% quality, WebP |
| `gallery` | Property page main photo | 1200px wide, 90% quality, WebP |
| `thumb` | Gallery thumbnail strip | 120×120px, 75% quality, WebP |
| `lightbox` | Full-screen lightbox | Original size, 95% quality, WebP |
| `og` | Open Graph / social share | 1200×630px crop, 85% quality, WebP |
| `avatar` | Landlord avatar small | 80×80px, face-crop, 80% quality, WebP |
| `avatar_lg` | Landlord avatar large | 160×160px, face-crop, 85% quality, WebP |

---

## Free Tier Limits

| Service | Free Limit |
|---|---|
| ImageKit storage | 20 GB (~40,000 photos at ~500KB each) |
| ImageKit bandwidth | 20 GB/month (~13,000 full property page views/month) |

---

## Troubleshooting

**Photos not uploading**
→ Check that `IMAGEKIT_PRIVATE_KEY` and `IMAGEKIT_URL_ENDPOINT` are set in Supabase Edge Function secrets
→ Check Supabase → Edge Functions → imagekit-upload → Logs for the error

**Images showing placeholder instead of uploaded photos**
→ `IMAGEKIT_URL` environment variable is missing or incorrect in Cloudflare Pages → Settings → Environment variables — trigger a redeploy after fixing it

**Edge Function 401 error**
→ Private key may be incorrect — regenerate it in ImageKit dashboard and update the Supabase secret

**Images loading slowly on first view**
→ Expected — ImageKit fetches and caches on first request per transformation. Subsequent loads are instant from CDN.
