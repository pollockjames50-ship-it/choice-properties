-- ============================================================
-- MIGRATION: I-069 — Backfill Orphaned Photo Data
-- Date: 2026-03-31
-- Purpose: Fix array length mismatches between photo_urls and 
--          photo_file_ids from before Session 027 (when I-028 was implemented)
-- 
-- Context:
-- Before I-028 was implemented, properties could have photos uploaded
-- to ImageKit without tracking their fileIds (for CDN deletion).
-- When the CHECK constraint was added (line 1744 in SETUP.sql),
-- it prevented NEW mismatches, but existing legacy data was not fixed.
--
-- This migration:
-- 1. Audits existing mismatches
-- 2. Backfills photo_file_ids with NULL values to match length
-- 3. Verifies the fix
--
-- Frequency: Run ONCE per environment (dev, staging, production)
-- Safety: Idempotent — safe to re-run (only updates rows where mismatch exists)
-- ============================================================

BEGIN;

-- ── AUDIT: Find all mismatches before migration ─────────────
CREATE TEMP TABLE mismatch_audit AS
SELECT 
  id,
  title,
  landlord_id,
  array_length(photo_urls, 1) AS url_count,
  array_length(photo_file_ids, 1) AS fileid_count,
  CASE 
    WHEN array_length(photo_urls, 1) > array_length(photo_file_ids, 1) THEN 'photoUrls longer'
    WHEN array_length(photo_file_ids, 1) > array_length(photo_urls, 1) THEN 'photoFileIds longer'
    ELSE 'equal'
  END AS mismatch_type
FROM properties 
WHERE photo_urls IS NOT NULL 
  AND array_length(photo_urls, 1) IS DISTINCT FROM array_length(photo_file_ids, 1);

-- Log the audit results to console
DO $$
DECLARE
  mismatch_count INT;
  total_orphaned INT;
BEGIN
  SELECT COUNT(*) INTO mismatch_count FROM mismatch_audit;
  SELECT SUM(url_count) INTO total_orphaned FROM mismatch_audit;
  
  IF mismatch_count > 0 THEN
    RAISE NOTICE 'AUDIT: Found % properties with array mismatches', mismatch_count;
    RAISE NOTICE 'AUDIT: Total orphaned photos (no fileIds): %', COALESCE(total_orphaned, 0);
  ELSE
    RAISE NOTICE 'AUDIT: No mismatches found. Database is already compliant.';
  END IF;
END $$;

-- ── BACKFILL: Fix mismatches ─────────────────────────────
-- For each property with mismatched arrays, set photo_file_ids 
-- to an array of NULLs matching the length of photo_urls.
-- This allows deletion to proceed safely (null fileIds are skipped).
UPDATE properties
SET photo_file_ids = array_fill(null::text, ARRAY[array_length(photo_urls, 1)])
WHERE photo_urls IS NOT NULL 
  AND (
    photo_file_ids IS NULL 
    OR array_length(photo_urls, 1) IS DISTINCT FROM array_length(photo_file_ids, 1)
  );

-- ── VERIFY: Confirm all mismatches are fixed ──────────────
DO $$
DECLARE
  remaining_count INT;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM properties 
  WHERE photo_urls IS NOT NULL 
    AND array_length(photo_urls, 1) IS DISTINCT FROM array_length(photo_file_ids, 1);
  
  IF remaining_count = 0 THEN
    RAISE NOTICE 'VERIFICATION: ✓ All arrays are now in sync';
  ELSE
    RAISE NOTICE 'VERIFICATION: ✗ Still found % mismatches. Migration may have failed.', remaining_count;
  END IF;
END $$;

-- ── CLEANUP: Drop audit table ────────────────────────────
DROP TABLE mismatch_audit;

COMMIT;

-- ============================================================
-- SUMMARY
-- ============================================================
-- This migration:
-- • Identifies properties with orphaned photos (photos without fileIds)
-- • Backfills photo_file_ids with NULL values to match photo_urls length
-- • Prevents index misalignment that would delete wrong photos on CDN
-- • CHECK constraint now enforces this invariant going forward
--
-- After migration:
-- • All photo_urls[i] corresponds to photo_file_ids[i]
-- • Null fileIds mean photos were legacy uploads (before I-028)
-- • These photos can still be deleted from the UI, but will skip CDN delete
-- • Admins can manually clean up orphaned CDN files from ImageKit dashboard
-- ============================================================
