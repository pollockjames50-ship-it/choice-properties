-- ============================================================
-- CHOICE PROPERTIES — Complete Database Setup
-- Single source of truth. Run this ONE file in:
--   Supabase Dashboard → SQL Editor → New Query → Run
--
-- This file replaces SCHEMA.sql + SECURITY-PATCHES.sql +
-- APPLICANT-AUTH.sql. All security patches and auth additions
-- are merged in. Safe to re-run on an existing database
-- (uses IF NOT EXISTS, OR REPLACE, and ON CONFLICT throughout).
--
-- After running this file:
--   1. Enable Email OTP in Supabase Auth settings
--      Dashboard → Authentication → Providers → Email → Enable OTP
--   2. Add your first admin:
--      INSERT INTO admin_roles (user_id, email)
--      VALUES ('your-supabase-user-uuid', 'your@email.com');
--   3. Set Edge Function secrets in Supabase Dashboard:
--      → Settings → Edge Functions → Environment Variables:
--        GAS_EMAIL_URL, GAS_RELAY_SECRET, DASHBOARD_URL,
--        ADMIN_EMAIL, IMAGEKIT_PRIVATE_KEY
--   4. Deploy Edge Functions from supabase/functions/
--
-- NOTE: Section 18 (pg_cron) requires the pg_cron extension.
--   Enable it first: Supabase → Database → Extensions → pg_cron
--   This file will skip the cron block gracefully if pg_cron is
--   not yet enabled and print a NOTICE instead of erroring out.
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM (
    'landlord', 'property_owner', 'realtor',
    'brokerage', 'agency', 'llc', 'property_management'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'pending', 'under_review', 'approved',
    'denied', 'withdrawn', 'waitlisted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'unpaid', 'paid', 'waived', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lease_status AS ENUM (
    'none', 'sent', 'signed', 'awaiting_co_sign',
    'co_signed', 'voided', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movein_status AS ENUM (
    'pending', 'scheduled', 'confirmed', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE property_status AS ENUM (
    'draft', 'active', 'paused', 'rented', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_sender AS ENUM ('admin', 'tenant', 'landlord');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add 'landlord' to message_sender if it was created without it
ALTER TYPE message_sender ADD VALUE IF NOT EXISTS 'landlord';


-- ============================================================
-- 2. ADMIN ROLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 3. LANDLORDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS landlords (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  account_type       account_type NOT NULL DEFAULT 'landlord',
  contact_name       TEXT NOT NULL,
  business_name      TEXT,
  email              TEXT NOT NULL,
  phone              TEXT,
  address            TEXT,
  city               TEXT,
  state              TEXT,
  zip                TEXT,
  avatar_url         TEXT,
  tagline            TEXT,
  bio                TEXT,
  website            TEXT,
  license_number     TEXT,
  license_state      TEXT,
  years_experience   INT,
  specialties        TEXT[],
  social_facebook    TEXT,
  social_instagram   TEXT,
  social_linkedin    TEXT,
  verified           BOOLEAN DEFAULT false,
  plan               TEXT DEFAULT 'free',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 4. PROPERTIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS properties (
  id                    TEXT PRIMARY KEY,
  landlord_id           UUID REFERENCES landlords(id) ON DELETE CASCADE,
  status                property_status DEFAULT 'draft',
  title                 TEXT NOT NULL,
  description           TEXT,
  showing_instructions  TEXT,
  address               TEXT NOT NULL,
  city                  TEXT NOT NULL,
  state                 TEXT NOT NULL,
  zip                   TEXT NOT NULL,
  county                TEXT,
  lat                   FLOAT,
  lng                   FLOAT,
  property_type         TEXT,
  year_built            INT,
  floors                INT,
  unit_number           TEXT,
  total_units           INT,
  bedrooms              INT,
  bathrooms             FLOAT,
  half_bathrooms        INT,
  square_footage        INT,
  lot_size_sqft         INT,
  garage_spaces         INT,
  monthly_rent          INT NOT NULL CHECK (monthly_rent > 0),
  security_deposit      INT,
  last_months_rent      INT,
  application_fee       INT DEFAULT 0,
  pet_deposit           INT,
  admin_fee             INT,
  move_in_special       TEXT,
  available_date        DATE,
  lease_terms           TEXT[],
  minimum_lease_months  INT,
  pets_allowed          BOOLEAN DEFAULT false,
  pet_types_allowed     TEXT[],
  pet_weight_limit      INT,
  pet_details           TEXT,
  smoking_allowed       BOOLEAN DEFAULT false,
  utilities_included    TEXT[],
  parking               TEXT,
  parking_fee           INT,
  amenities             TEXT[],
  appliances            TEXT[],
  flooring              TEXT[],
  heating_type          TEXT,
  cooling_type          TEXT,
  laundry_type          TEXT,
  photo_urls            TEXT[],
  photo_file_ids        TEXT[],   -- I-028: parallel array of ImageKit fileIds for deletion support
  virtual_tour_url      TEXT,
  views_count           INT DEFAULT 0,
  applications_count    INT DEFAULT 0,
  saves_count           INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 5. INQUIRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS inquiries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  TEXT REFERENCES properties(id) ON DELETE CASCADE,
  tenant_name  TEXT NOT NULL,
  tenant_email TEXT NOT NULL,
  tenant_phone TEXT,
  message      TEXT,
  read         BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 6. APPLICATIONS TABLE
-- All columns including Phase 2 fields, auth fields, and
-- lease/signing fields are defined here from the start.
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (

  -- Identity
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                           TEXT UNIQUE NOT NULL,
  created_at                       TIMESTAMPTZ DEFAULT now(),
  updated_at                       TIMESTAMPTZ DEFAULT now(),

  -- Status & Admin
  status                           application_status DEFAULT 'pending',
  payment_status                   payment_status DEFAULT 'unpaid',
  payment_date                     TIMESTAMPTZ,
  admin_notes                      TEXT,
  application_fee                  INT DEFAULT 0,

  -- Property & Landlord Link
  property_id                      TEXT REFERENCES properties(id) ON DELETE SET NULL,
  landlord_id                      UUID REFERENCES landlords(id) ON DELETE SET NULL,
  property_address                 TEXT,

  -- Applicant Personal Info
  first_name                       TEXT NOT NULL,
  last_name                        TEXT NOT NULL,
  email                            TEXT NOT NULL,
  phone                            TEXT NOT NULL,
  dob                              TEXT,
  ssn                              TEXT,  -- stored as XXX-XX-XXXX (last 4 only, masked by Edge Function)
  requested_move_in_date           TEXT,
  desired_lease_term               TEXT,

  -- Current Residence
  current_address                  TEXT,
  residency_duration               TEXT,
  current_rent_amount              TEXT,
  reason_for_leaving               TEXT,
  current_landlord_name            TEXT,
  landlord_phone                   TEXT,

  -- Prior Residence
  previous_address                 TEXT,
  previous_residency_duration      TEXT,
  previous_landlord_name           TEXT,
  previous_landlord_phone          TEXT,

  -- Employment
  employment_status                TEXT,
  employer                         TEXT,
  employer_address                 TEXT,
  job_title                        TEXT,
  employment_duration              TEXT,
  employment_start_date            TEXT,
  supervisor_name                  TEXT,
  supervisor_phone                 TEXT,
  monthly_income                   TEXT,
  other_income                     TEXT,

  -- Background
  has_bankruptcy                   BOOLEAN DEFAULT false,
  bankruptcy_explanation           TEXT,
  has_criminal_history             BOOLEAN DEFAULT false,
  criminal_history_explanation     TEXT,

  -- Government ID
  government_id_type               TEXT,
  government_id_number             TEXT,

  -- References
  reference_1_name                 TEXT,
  reference_1_phone                TEXT,
  reference_2_name                 TEXT,
  reference_2_phone                TEXT,

  -- Emergency Contact
  emergency_contact_name           TEXT,
  emergency_contact_phone          TEXT,
  emergency_contact_relationship   TEXT,

  -- Payment Preferences
  primary_payment_method           TEXT,
  primary_payment_method_other     TEXT,
  alternative_payment_method       TEXT,
  alternative_payment_method_other TEXT,
  third_choice_payment_method      TEXT,
  third_choice_payment_method_other TEXT,

  -- Household
  has_pets                         BOOLEAN DEFAULT false,
  pet_details                      TEXT,
  total_occupants                  TEXT,
  additional_occupants             TEXT,
  ever_evicted                     BOOLEAN DEFAULT false,
  smoker                           BOOLEAN DEFAULT false,

  -- Contact Preferences
  preferred_language               TEXT DEFAULT 'en',
  preferred_contact_method         TEXT,
  preferred_time                   TEXT,
  preferred_time_specific          TEXT,

  -- Vehicle
  vehicle_make                     TEXT,
  vehicle_model                    TEXT,
  vehicle_year                     TEXT,
  vehicle_license_plate            TEXT,

  -- Co-Applicant (detail columns live in co_applicants table — see section 7b)
  has_co_applicant                 BOOLEAN DEFAULT false,

  -- Auth Link (Supabase Auth user_id of primary applicant)
  applicant_user_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Landlord Contact
  landlord_email                   TEXT,

  -- Document Upload
  document_url                     TEXT,
  -- I-043: Array of Supabase Storage paths for uploaded documents.
  -- Replaces the unused single document_url field for multi-doc support.
  -- Paths are relative to the application-docs bucket: {user_id}/{doc_type}_{ts}.{ext}
  document_urls                    JSONB DEFAULT '[]'::jsonb,

  -- Lease Terms
  lease_status                     lease_status DEFAULT 'none',
  lease_sent_date                  TIMESTAMPTZ,
  lease_signed_date                TIMESTAMPTZ,
  lease_start_date                 DATE,
  lease_end_date                   DATE,
  monthly_rent                     NUMERIC(10,2),
  security_deposit                 NUMERIC(10,2),
  move_in_costs                    NUMERIC(10,2),
  lease_notes                      TEXT,
  lease_late_fee_flat              NUMERIC(10,2) DEFAULT 50,
  lease_late_fee_daily             NUMERIC(10,2) DEFAULT 10,
  lease_expiry_date                TIMESTAMPTZ,
  lease_state_code                 TEXT,
  lease_landlord_name              TEXT,
  lease_landlord_address           TEXT,
  lease_pets_policy                TEXT,
  lease_smoking_policy             TEXT,
  lease_compliance_snapshot        TEXT,
  lease_pdf_url                    TEXT,  -- storage PATH only, not a signed URL

  -- Signatures
  tenant_signature                 TEXT,
  tenant_sign_token                TEXT,  -- one-time signing token (set by generate-lease)
  signature_timestamp              TIMESTAMPTZ,
  lease_ip_address                 TEXT,
  co_applicant_signature           TEXT,
  co_applicant_signature_timestamp TIMESTAMPTZ,
  co_applicant_lease_token         TEXT,  -- one-time co-sign token

  -- Move-In
  move_in_status                   movein_status,
  move_in_date_actual              DATE,
  move_in_notes                    TEXT,
  move_in_confirmed_by             TEXT
);


-- ============================================================
-- 7b. CO-APPLICANTS TABLE
-- Extracted from applications (I-005). Stores co-applicant
-- identity and employment data separately. ~80% of applications
-- have no co-applicant, so keeping these 14 columns in the main
-- table meant constant NULL padding.
--
-- Relationship: one applications row → zero or one co_applicants row.
-- The has_co_applicant flag on applications is the quick existence
-- check; this table holds the full detail.
--
-- Signing columns (co_applicant_signature, co_applicant_lease_token,
-- co_applicant_signature_timestamp) stay on applications because the
-- sign_lease_co_applicant() DB function and sign-lease Edge Function
-- are tightly coupled to that row. Those can be extracted in a later
-- session if warranted.
-- ============================================================
CREATE TABLE IF NOT EXISTS co_applicants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id               TEXT NOT NULL REFERENCES applications(app_id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ DEFAULT now(),

  -- Identity
  first_name           TEXT,
  last_name            TEXT,
  email                TEXT,
  phone                TEXT,
  dob                  TEXT,
  -- ssn is set by process-application (service role) with XXX-XX-XXXX masking.
  -- Never written directly; the Edge Function sets it server-side.
  ssn                  TEXT,
  role                 TEXT,   -- e.g. 'co-signer', 'spouse', 'roommate'

  -- Employment
  employer             TEXT,
  job_title            TEXT,
  monthly_income       TEXT,
  employment_duration  TEXT,
  employment_status    TEXT,

  -- Consent
  consent              BOOLEAN DEFAULT false,

  CONSTRAINT co_applicants_app_id_unique UNIQUE (app_id)
);

-- is_admin(): returns true if the current user is in the admin_roles table.
-- Defined here early because it is referenced by RLS policies throughout this script.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid());
END;
$$;

-- RLS: mirrors applications policies — admins see all, landlords see their properties' apps
ALTER TABLE co_applicants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_applicants_admin_all" ON co_applicants
  FOR ALL USING (is_admin());

CREATE POLICY "co_applicants_landlord_read" ON co_applicants
  FOR SELECT USING (
    app_id IN (
      SELECT app_id FROM applications
      WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
         OR property_id IN (
              SELECT id FROM properties
              WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
            )
    )
  );

CREATE POLICY "co_applicants_applicant_read" ON co_applicants
  FOR SELECT USING (
    app_id IN (
      SELECT app_id FROM applications WHERE applicant_user_id = auth.uid()
    )
  );

-- ── Data migration: backfill from existing applications rows ──────────
-- Safe to re-run: ON CONFLICT (app_id) DO NOTHING skips existing rows.
-- Fresh installs: skipped automatically — old co_applicant_* columns never existed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications'
    AND column_name = 'co_applicant_first_name'
  ) THEN
    INSERT INTO co_applicants (
      app_id,
      first_name, last_name, email, phone, dob, ssn, role,
      employer, job_title, monthly_income, employment_duration, employment_status,
      consent
    )
    SELECT
      app_id,
      co_applicant_first_name,
      co_applicant_last_name,
      co_applicant_email,
      co_applicant_phone,
      co_applicant_dob,
      co_applicant_ssn,
      additional_person_role,
      co_applicant_employer,
      co_applicant_job_title,
      co_applicant_monthly_income,
      co_applicant_employment_duration,
      co_applicant_employment_status,
      co_applicant_consent
    FROM applications
    WHERE has_co_applicant = true
      AND co_applicant_email IS NOT NULL
    ON CONFLICT (app_id) DO NOTHING;
  END IF;
END $$;

-- ── Drop migrated columns from applications ────────────────────────
-- Only runs if the column still exists (safe for fresh installs where
-- the column was never created, and for re-runs after migration).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'co_applicant_first_name'
  ) THEN
    ALTER TABLE applications
      DROP COLUMN IF EXISTS additional_person_role,
      DROP COLUMN IF EXISTS co_applicant_first_name,
      DROP COLUMN IF EXISTS co_applicant_last_name,
      DROP COLUMN IF EXISTS co_applicant_email,
      DROP COLUMN IF EXISTS co_applicant_phone,
      DROP COLUMN IF EXISTS co_applicant_dob,
      DROP COLUMN IF EXISTS co_applicant_ssn,
      DROP COLUMN IF EXISTS co_applicant_employer,
      DROP COLUMN IF EXISTS co_applicant_job_title,
      DROP COLUMN IF EXISTS co_applicant_monthly_income,
      DROP COLUMN IF EXISTS co_applicant_employment_duration,
      DROP COLUMN IF EXISTS co_applicant_employment_status,
      DROP COLUMN IF EXISTS co_applicant_consent;
  END IF;
END;
$$;


-- ============================================================
-- 7. MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      TEXT NOT NULL REFERENCES applications(app_id) ON DELETE CASCADE,
  sender      message_sender NOT NULL,
  sender_name TEXT,
  message     TEXT NOT NULL,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 8. EMAIL LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  type       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  status     TEXT NOT NULL,
  app_id     TEXT,
  error_msg  TEXT
);


-- ============================================================
-- 9. SAVED PROPERTIES TABLE
-- user_id is UUID with a FK to auth.users for ownership-based
-- RLS and referential integrity.
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_properties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 10. TRIGGERS — auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS landlords_updated_at    ON landlords;
DROP TRIGGER IF EXISTS properties_updated_at   ON properties;
DROP TRIGGER IF EXISTS applications_updated_at ON applications;

CREATE TRIGGER landlords_updated_at
  BEFORE UPDATE ON landlords
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- I-018 FIX: Counter triggers for applications_count and saves_count
-- properties.applications_count was declared DEFAULT 0 but never
-- updated — no trigger existed. Same for saves_count.
-- ============================================================

-- Increment applications_count when a new application is submitted.
-- Guard against NULL property_id (ON DELETE SET NULL on the FK).
CREATE OR REPLACE FUNCTION trg_applications_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.property_id IS NOT NULL THEN
    UPDATE properties
       SET applications_count = COALESCE(applications_count, 0) + 1
     WHERE id = NEW.property_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS applications_count_trigger ON applications;
CREATE TRIGGER applications_count_trigger
  AFTER INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION trg_applications_count();

-- Increment saves_count on INSERT, decrement (floor 0) on DELETE.
CREATE OR REPLACE FUNCTION trg_saves_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE properties
       SET saves_count = COALESCE(saves_count, 0) + 1
     WHERE id = NEW.property_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE properties
       SET saves_count = GREATEST(COALESCE(saves_count, 0) - 1, 0)
     WHERE id = OLD.property_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS saves_count_trigger ON saved_properties;
CREATE TRIGGER saves_count_trigger
  AFTER INSERT OR DELETE ON saved_properties
  FOR EACH ROW EXECUTE FUNCTION trg_saves_count();


-- ============================================================
-- 11. HELPER FUNCTIONS
-- ============================================================

-- generate_app_id(): creates CP-YYYYMMDD-XXXXXXNNN application IDs
CREATE OR REPLACE FUNCTION generate_app_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_date   TEXT;
  v_random TEXT;
  v_ms     TEXT;
  v_id     TEXT;
BEGIN
  v_date   := to_char(now(), 'YYYYMMDD');
  v_random := upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 6));
  v_ms     := lpad((extract(milliseconds FROM now())::int % 1000)::text, 3, '0');
  v_id     := 'CP-' || v_date || '-' || v_random || v_ms;
  IF EXISTS (SELECT 1 FROM applications WHERE app_id = v_id) THEN
    RETURN generate_app_id();  -- retry on collision (astronomically rare)
  END IF;
  RETURN v_id;
END;
$$;
-- FIX #10: grant was missing — added to match generate_property_id() pattern
GRANT EXECUTE ON FUNCTION generate_app_id() TO authenticated;

-- generate_property_id(): creates PROP-XXXXXXXX property IDs (server-side)
CREATE OR REPLACE FUNCTION generate_property_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_id    TEXT := 'PROP-';
  v_i     INT;
  v_bytes BYTEA;
BEGIN
  v_bytes := gen_random_bytes(8);
  FOR v_i IN 0..7 LOOP
    v_id := v_id || substr(v_chars, (get_byte(v_bytes, v_i) % 36) + 1, 1);
  END LOOP;
  IF EXISTS (SELECT 1 FROM properties WHERE id = v_id) THEN
    RETURN generate_property_id();
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_property_id() TO authenticated;

-- increment_counter(): restricted to properties.views_count only
-- (prevents attackers from incrementing arbitrary table/column counters)
CREATE OR REPLACE FUNCTION increment_counter(
  p_table  TEXT,
  p_id     TEXT,
  p_column TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_table != 'properties' OR p_column != 'views_count' THEN
    RAISE EXCEPTION 'Invalid counter target';
  END IF;
  UPDATE properties
    SET views_count = COALESCE(views_count, 0) + 1
    WHERE id = p_id;
END;
$$;
-- FIX #2: grant was missing — anon callers (public listing views) need this
GRANT EXECUTE ON FUNCTION increment_counter(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ============================================================
-- 12. ROW LEVEL SECURITY
-- Drop and recreate all policies cleanly.
-- ============================================================

ALTER TABLE admin_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlords         ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_properties  ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on these tables
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'admin_roles','landlords','properties','inquiries',
        'applications','messages','email_logs','saved_properties'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- admin_roles
CREATE POLICY "admin_roles_self_read" ON admin_roles
  FOR SELECT USING (user_id = auth.uid());

-- landlords
-- landlords_public_read covers all SELECT access (marketplace requires public profiles).
-- landlords_own_write scopes INSERT/UPDATE/DELETE to the owner's own row.
CREATE POLICY "landlords_admin_all"   ON landlords FOR ALL   USING (is_admin());
CREATE POLICY "landlords_public_read" ON landlords FOR SELECT USING (true);
CREATE POLICY "landlords_own_write"   ON landlords FOR ALL   USING (user_id = auth.uid());

-- properties
CREATE POLICY "properties_admin_all" ON properties FOR ALL USING (is_admin());
CREATE POLICY "properties_public_read" ON properties
  FOR SELECT USING (status = 'active');
-- FIX #8: removed redundant `OR status = 'active'` — properties_public_read already
-- covers active properties for everyone. This policy now only adds the landlord's
-- own non-active properties on top of what public_read already grants.
CREATE POLICY "properties_landlord_read" ON properties
  FOR SELECT USING (
    landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
  );
CREATE POLICY "properties_landlord_write" ON properties
  FOR ALL
  USING    (landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid()))
  WITH CHECK (landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid()));

-- inquiries
-- C-04 FIX: inquiries_public_insert policy removed. Anonymous users can no longer
-- INSERT directly into the inquiries table via the REST API. All inquiry submissions
-- must go through the send-inquiry Edge Function, which enforces rate limiting and
-- uses the service-role key for the DB insert.
CREATE POLICY "inquiries_admin_all"      ON inquiries FOR ALL USING (is_admin());
CREATE POLICY "inquiries_landlord_read"  ON inquiries
  FOR SELECT USING (
    property_id IN (
      SELECT id FROM properties
      WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "inquiries_landlord_update" ON inquiries
  FOR UPDATE USING (
    property_id IN (
      SELECT id FROM properties
      WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
    )
  );

-- applications
CREATE POLICY "applications_admin_all" ON applications FOR ALL USING (is_admin());
-- FIX #12: Also allow landlords to read applications linked to their properties via property_id,
-- covering the case where landlord_id was not populated at submission time (e.g., edge function
-- resolved property_id but the property had no landlord_id set, or property_id was absent).
CREATE POLICY "applications_landlord_read" ON applications
  FOR SELECT USING (
    landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
    OR property_id IN (
      SELECT id FROM properties
      WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
    )
  );
-- Authenticated applicants can read their own applications
CREATE POLICY "applications_applicant_read" ON applications
  FOR SELECT USING (applicant_user_id = auth.uid());

-- FIX #4: Removed applications_public_insert policy.
-- All application inserts go through the process-application Edge Function which
-- uses the service-role key (bypassing RLS). Allowing direct anonymous inserts
-- bypasses rate limiting, SSN masking, email notifications, and generate_app_id().
-- No permissive INSERT policy is needed here.

-- messages
CREATE POLICY "messages_admin_all" ON messages FOR ALL USING (is_admin());
-- FIX #12: Mirror the applications_landlord_read fallback — also allow messages on
-- applications linked via property_id when landlord_id was not resolved at submission.
CREATE POLICY "messages_landlord_read" ON messages
  FOR SELECT USING (
    app_id IN (
      SELECT app_id FROM applications
      WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
         OR property_id IN (
              SELECT id FROM properties
              WHERE landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
            )
    )
  );

-- email_logs
CREATE POLICY "email_logs_admin_all" ON email_logs FOR ALL USING (is_admin());

-- saved_properties
-- FIX #7: user_id is now UUID (was TEXT), so cast removed from policy comparisons.
CREATE POLICY "saved_properties_select_own" ON saved_properties
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "saved_properties_insert_own" ON saved_properties
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_properties_delete_own" ON saved_properties
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "saved_properties_admin_all"  ON saved_properties
  FOR ALL USING (is_admin());


-- ============================================================
-- 13. SECURE FUNCTIONS
-- Final (patched) versions of all security-critical RPCs.
-- ============================================================

-- ── get_application_status ──────────────────────────────────
-- Returns tenant-safe status fields. Does NOT include financial
-- fields (monthly_rent etc.) or signing tokens — those require
-- last-name verification via get_lease_financials().
-- C-01 FIX: Requires p_last_name as a second verification factor.
-- Data is only returned if lower(trim(last_name)) matches the record.
-- Authenticated users (getMyApplications RPC) are unaffected.
CREATE OR REPLACE FUNCTION get_application_status(p_app_id TEXT, p_last_name TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_app   applications%ROWTYPE;
  v_coapp co_applicants%ROWTYPE;
  v_msgs  JSON;
BEGIN
  SELECT * INTO v_app
  FROM applications
  WHERE app_id = p_app_id
    AND lower(trim(last_name)) = lower(trim(p_last_name));
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Application not found');
  END IF;

  -- Fetch co-applicant detail row (may not exist)
  SELECT * INTO v_coapp FROM co_applicants WHERE app_id = p_app_id;

  SELECT json_agg(
    json_build_object(
      'sender',      sender,
      'sender_name', sender_name,
      'message',     message,
      'read',        read,
      'created_at',  created_at
    ) ORDER BY created_at ASC
  ) INTO v_msgs FROM messages WHERE app_id = p_app_id;

  RETURN json_build_object(
    'success', true,
    'application', json_build_object(
      'app_id',                    v_app.app_id,
      'first_name',                v_app.first_name,
      'last_name',                 v_app.last_name,
      'email',                     v_app.email,
      'status',                    v_app.status,
      'payment_status',            v_app.payment_status,
      'lease_status',              v_app.lease_status,
      'lease_expiry_date',         v_app.lease_expiry_date,
      'lease_start_date',          v_app.lease_start_date,
      'lease_end_date',            v_app.lease_end_date,
      'lease_signed_date',         v_app.lease_signed_date,
      'lease_pets_policy',         v_app.lease_pets_policy,
      'lease_smoking_policy',      v_app.lease_smoking_policy,
      'lease_compliance_snapshot', v_app.lease_compliance_snapshot,
      'lease_landlord_name',       v_app.lease_landlord_name,
      'lease_landlord_address',    v_app.lease_landlord_address,
      'lease_pdf_url',             v_app.lease_pdf_url,
      'has_co_applicant',          v_app.has_co_applicant,
      'co_applicant_first_name',   v_coapp.first_name,
      'co_applicant_last_name',    v_coapp.last_name,
      'co_applicant_email',        v_coapp.email,
      'co_applicant_signature',    v_app.co_applicant_signature,
      'move_in_status',            v_app.move_in_status,
      'move_in_date_actual',       v_app.move_in_date_actual,
      'property_address',          v_app.property_address,
      'desired_lease_term',        v_app.desired_lease_term,
      'admin_notes',               v_app.admin_notes,
      'created_at',                v_app.created_at,
      'updated_at',                v_app.updated_at
    ),
    'messages', COALESCE(v_msgs, '[]'::json)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_application_status(TEXT, TEXT) TO anon, authenticated;


-- ── get_lease_financials ─────────────────────────────────────
-- Returns financial lease data gated by app_id + last name.
-- Also returns the signing token (needed to build the sign link).
-- The last-name gate is the security check — callers must know
-- both the app_id AND the applicant's or co-applicant's last name.
CREATE OR REPLACE FUNCTION get_lease_financials(p_app_id TEXT, p_last_name TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_app   applications%ROWTYPE;
  v_coapp co_applicants%ROWTYPE;
BEGIN
  -- Fetch the application, gated by primary applicant's last name
  SELECT * INTO v_app
  FROM applications
  WHERE app_id = p_app_id
    AND lower(trim(last_name)) = lower(trim(p_last_name));

  -- If not found by primary last name, try the co-applicant's last name
  IF NOT FOUND THEN
    SELECT a.* INTO v_app
    FROM applications a
    JOIN co_applicants c ON c.app_id = a.app_id
    WHERE a.app_id = p_app_id
      AND lower(trim(c.last_name)) = lower(trim(p_last_name));
  END IF;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Fetch co-applicant detail (may not exist)
  SELECT * INTO v_coapp FROM co_applicants WHERE app_id = p_app_id;

  RETURN json_build_object(
    'monthly_rent',         v_app.monthly_rent,
    'security_deposit',     v_app.security_deposit,
    'move_in_costs',        v_app.move_in_costs,
    'lease_late_fee_flat',  v_app.lease_late_fee_flat,
    'lease_late_fee_daily', v_app.lease_late_fee_daily,
    'co_applicant_email',   v_coapp.email,
    'lease_pdf_url',        v_app.lease_pdf_url,
    'tenant_sign_token',    v_app.tenant_sign_token
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_lease_financials(TEXT, TEXT) TO anon, authenticated;


-- ── sign_lease ───────────────────────────────────────────────
-- DB-level primary-applicant lease signing with void/expiry guards.
-- Called by the sign-lease Edge Function (which also verifies the
-- signing token before calling this). NOT granted to anon to force
-- all signing through the Edge Function's token check layer.
CREATE OR REPLACE FUNCTION sign_lease(
  p_app_id    TEXT,
  p_signature TEXT,
  p_ip        TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_app applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM applications WHERE app_id = p_app_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Application not found');
  END IF;
  IF v_app.lease_status = 'voided' THEN
    RETURN json_build_object('success', false, 'error', 'This lease has been voided');
  END IF;
  IF v_app.lease_status = 'expired' OR
     (v_app.lease_expiry_date IS NOT NULL AND v_app.lease_expiry_date < now()) THEN
    UPDATE applications SET lease_status = 'expired' WHERE app_id = p_app_id;
    RETURN json_build_object('success', false, 'error', 'This lease link has expired');
  END IF;
  IF v_app.tenant_signature IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Lease already signed');
  END IF;

  UPDATE applications SET
    tenant_signature    = p_signature,
    signature_timestamp = now(),
    lease_ip_address    = p_ip,
    lease_status        = CASE WHEN has_co_applicant THEN 'awaiting_co_sign' ELSE 'signed' END,
    lease_signed_date   = now()
  WHERE app_id = p_app_id;

  RETURN json_build_object('success', true, 'app_id', p_app_id);
END;
$$;
-- Granted to authenticated only (not anon) — all signing must go via Edge Function
GRANT EXECUTE ON FUNCTION sign_lease(TEXT, TEXT, TEXT) TO authenticated;


-- ── sign_lease_co_applicant ──────────────────────────────────
-- Co-applicant signing with void, expiry, and duplicate guards.
CREATE OR REPLACE FUNCTION sign_lease_co_applicant(
  p_app_id    TEXT,
  p_signature TEXT,
  p_ip        TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_app applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM applications WHERE app_id = p_app_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Application not found');
  END IF;
  IF NOT v_app.has_co_applicant THEN
    RETURN json_build_object('success', false, 'error', 'No co-applicant on this application');
  END IF;
  IF v_app.lease_status = 'voided' THEN
    RETURN json_build_object('success', false, 'error', 'This lease has been voided');
  END IF;
  IF v_app.lease_status = 'expired' OR
     (v_app.lease_expiry_date IS NOT NULL AND v_app.lease_expiry_date < now()) THEN
    UPDATE applications SET lease_status = 'expired' WHERE app_id = p_app_id;
    RETURN json_build_object('success', false, 'error', 'This lease link has expired');
  END IF;
  IF v_app.co_applicant_signature IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Co-applicant lease already signed');
  END IF;

  UPDATE applications SET
    co_applicant_signature           = p_signature,
    co_applicant_signature_timestamp = now(),
    lease_ip_address                 = COALESCE(NULLIF(p_ip, ''), lease_ip_address),
    lease_status                     = 'co_signed'
  WHERE app_id = p_app_id;

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION sign_lease_co_applicant(TEXT, TEXT, TEXT) TO authenticated;


-- ── submit_tenant_reply ──────────────────────────────────────
-- Inserts a tenant reply message. Allowed for both authenticated
-- and anonymous callers — only requires the app_id to exist.
-- Anonymous tenants who look up by App ID can still reply.
-- The Edge Function (send-message) handles landlord notification.
CREATE OR REPLACE FUNCTION submit_tenant_reply(
  p_app_id  TEXT,
  p_message TEXT,
  p_name    TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM applications WHERE app_id = p_app_id) THEN
    RETURN json_build_object('success', false, 'error', 'Application not found');
  END IF;

  INSERT INTO messages (app_id, sender, sender_name, message)
  VALUES (p_app_id, 'tenant', p_name, p_message);

  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_tenant_reply(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ── get_my_applications ──────────────────────────────────────
-- Returns all applications linked to the authenticated applicant.
-- Does NOT expose SSN, income, criminal history, or PII fields.
CREATE OR REPLACE FUNCTION get_my_applications()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  RETURN json_build_object(
    'success', true,
    'applications', (
      SELECT COALESCE(
        json_agg(json_build_object(
          'app_id',           app_id,
          'status',           status,
          'payment_status',   payment_status,
          'lease_status',     lease_status,
          'property_address', property_address,
          'created_at',       created_at,
          'first_name',       first_name,
          'last_name',        last_name,
          'monthly_rent',     monthly_rent,
          'lease_start_date', lease_start_date,
          'move_in_status',   move_in_status,
          'application_fee',  application_fee,
          'email',            email
        ) ORDER BY created_at DESC),
        '[]'::json
      )
      FROM applications WHERE applicant_user_id = v_uid
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_applications() TO authenticated;


-- ── claim_application ────────────────────────────────────────
-- Links a legacy (pre-auth) application to the current authenticated
-- user. Verified against the server-side auth.email() — a caller
-- cannot claim another person's application even if they know the app_id.
CREATE OR REPLACE FUNCTION claim_application(p_app_id TEXT, p_email TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_auth_email TEXT := auth.email();
  v_app        applications%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_app FROM applications WHERE app_id = p_app_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Application not found');
  END IF;

  -- Auth.email() is the email the caller proved ownership of via OTP
  IF lower(v_app.email) <> lower(v_auth_email) THEN
    RETURN json_build_object('success', false, 'error', 'Email does not match application');
  END IF;

  IF v_app.applicant_user_id = v_uid THEN
    RETURN json_build_object('success', true, 'already_claimed', true);
  END IF;

  IF v_app.applicant_user_id IS NOT NULL AND v_app.applicant_user_id <> v_uid THEN
    RETURN json_build_object('success', false, 'error', 'Application already linked to another account');
  END IF;

  UPDATE applications SET applicant_user_id = v_uid WHERE app_id = p_app_id;
  RETURN json_build_object('success', true, 'claimed', true);
END;
$$;
GRANT EXECUTE ON FUNCTION claim_application(TEXT, TEXT) TO authenticated;


-- ── get_apps_by_email ────────────────────────────────────────
-- Returns app_id + property_address for recovery/lookup.
-- Does NOT return status (avoids leaking approval state).
-- FIX #5: Restricted to authenticated only — anon access allowed any
-- visitor to enumerate application IDs and property addresses for
-- any email address, a PII disclosure risk.
CREATE OR REPLACE FUNCTION get_apps_by_email(p_email TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::json)
    FROM (
      SELECT app_id,
             property_address,
             created_at::date AS created_at
      FROM applications
      WHERE lower(email) = lower(p_email)
    ) r
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_apps_by_email(TEXT) TO authenticated;


-- ── get_app_id_by_email ──────────────────────────────────────
-- Returns the most recent app_id for an email (single-app lookup).
-- FIX #5: Restricted to authenticated only — same PII disclosure
-- risk as get_apps_by_email() if exposed to anon callers.
CREATE OR REPLACE FUNCTION get_app_id_by_email(p_email TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_app_id TEXT;
BEGIN
  SELECT app_id INTO v_app_id FROM applications
  WHERE lower(email) = lower(p_email)
  ORDER BY created_at DESC LIMIT 1;
  RETURN v_app_id;
END;
$$;
GRANT EXECUTE ON FUNCTION get_app_id_by_email(TEXT) TO authenticated;


-- ── mark_expired_leases ──────────────────────────────────────
-- Bulk-marks stale 'sent' leases as 'expired' where expiry_date
-- has passed. Called by the admin Leases page and by the nightly
-- pg_cron job.
-- FIX #3: Added admin guard. auth.uid() IS NULL allows the pg_cron
-- job (which runs without a session) to call this function freely.
-- Regular authenticated non-admin users are blocked.
CREATE OR REPLACE FUNCTION mark_expired_leases()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Allow: pg_cron / service-role callers (auth.uid() is NULL)
  -- Allow: admin users
  -- Block: all other authenticated users (tenants, landlords)
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE applications
  SET lease_status = 'expired'
  WHERE lease_status = 'sent'
    AND lease_expiry_date IS NOT NULL
    AND lease_expiry_date < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_expired_leases() TO authenticated;


-- ============================================================
-- 14. VIEWS
-- ============================================================

-- ── admin_application_view ───────────────────────────────────
-- Complete view for admin use. security_invoker=on means queries
-- run with the caller's RLS permissions — only admins (who have
-- applications_admin_all) can actually see all rows.
-- Includes ALL application detail fields so the admin detail
-- panel has full data without a secondary query.
DROP VIEW IF EXISTS admin_application_view;
CREATE VIEW admin_application_view WITH (security_invoker=on) AS
  SELECT
    -- Identity & Status
    a.id,
    a.app_id,
    a.created_at,
    a.updated_at,
    a.status,
    a.payment_status,
    a.payment_date,
    a.application_fee,
    a.admin_notes,

    -- Applicant Core
    a.first_name,
    a.last_name,
    a.email,
    a.phone,
    a.dob,
    a.ssn,
    a.requested_move_in_date,
    a.desired_lease_term,

    -- Property
    a.property_address,
    a.property_id,
    a.landlord_id,

    -- Current Residence
    a.current_address,
    a.residency_duration,
    a.current_rent_amount,
    a.reason_for_leaving,
    a.current_landlord_name,
    a.landlord_phone,

    -- Prior Residence
    a.previous_address,
    a.previous_residency_duration,
    a.previous_landlord_name,
    a.previous_landlord_phone,

    -- Employment
    a.employment_status,
    a.employer,
    a.employer_address,
    a.job_title,
    a.employment_duration,
    a.employment_start_date,
    a.supervisor_name,
    a.supervisor_phone,
    a.monthly_income,
    a.other_income,

    -- Background
    a.has_bankruptcy,
    a.bankruptcy_explanation,
    a.has_criminal_history,
    a.criminal_history_explanation,

    -- Government ID
    a.government_id_type,
    a.government_id_number,

    -- References
    a.reference_1_name,
    a.reference_1_phone,
    a.reference_2_name,
    a.reference_2_phone,

    -- Emergency Contact
    a.emergency_contact_name,
    a.emergency_contact_phone,
    a.emergency_contact_relationship,

    -- Payment Preferences
    a.primary_payment_method,
    a.alternative_payment_method,
    a.third_choice_payment_method,

    -- Household
    a.has_pets,
    a.pet_details,
    a.total_occupants,
    a.additional_occupants,
    a.ever_evicted,
    a.smoker,

    -- Vehicle
    a.vehicle_make,
    a.vehicle_model,
    a.vehicle_year,
    a.vehicle_license_plate,

    -- Co-Applicant (joined from co_applicants table)
    a.has_co_applicant,
    ca.role                    AS additional_person_role,
    ca.first_name              AS co_applicant_first_name,
    ca.last_name               AS co_applicant_last_name,
    ca.email                   AS co_applicant_email,
    ca.phone                   AS co_applicant_phone,
    ca.dob                     AS co_applicant_dob,
    ca.employer                AS co_applicant_employer,
    ca.job_title               AS co_applicant_job_title,
    ca.monthly_income          AS co_applicant_monthly_income,
    ca.employment_status       AS co_applicant_employment_status,

    -- Document
    a.document_url,

    -- Lease
    a.lease_status,
    a.lease_sent_date,
    a.lease_signed_date,
    a.lease_start_date,
    a.lease_end_date,
    a.monthly_rent,
    a.security_deposit,
    a.move_in_costs,
    a.lease_late_fee_flat,
    a.lease_late_fee_daily,
    a.lease_expiry_date,
    a.tenant_signature,
    a.co_applicant_signature,

    -- Move-In
    a.move_in_status,
    a.move_in_date_actual,
    a.move_in_notes,

    -- Joined from landlords & properties
    l.contact_name  AS landlord_name,
    l.business_name AS landlord_business,
    p.title         AS property_title,
    p.city          AS property_city,
    p.state         AS property_state

  FROM applications a
  LEFT JOIN landlords    l  ON a.landlord_id = l.id
  LEFT JOIN properties   p  ON a.property_id = p.id
  LEFT JOIN co_applicants ca ON ca.app_id     = a.app_id;


-- ── public_landlord_profiles ─────────────────────────────────
-- Public-safe landlord profile data (no private contact details).
-- FIX #11: Added security_invoker=on so queries run with the
-- caller's RLS permissions rather than the definer's, consistent
-- with admin_application_view and safe for future RLS tightening.
DROP VIEW IF EXISTS public_landlord_profiles;
CREATE VIEW public_landlord_profiles WITH (security_invoker=on) AS
  SELECT
    id, account_type, business_name, contact_name,
    avatar_url, tagline, bio, website,
    license_number, license_state, years_experience,
    specialties, social_facebook, social_instagram,
    social_linkedin, verified, created_at
  FROM landlords;
GRANT SELECT ON public_landlord_profiles TO anon, authenticated;

-- Table-level grants (required alongside RLS — RLS alone does not work without these)
GRANT SELECT                        ON properties       TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON properties      TO authenticated;

GRANT SELECT                        ON landlords        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON landlords       TO authenticated;

GRANT SELECT, INSERT                ON applications     TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON applications    TO authenticated;

GRANT SELECT, INSERT                ON co_applicants    TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON co_applicants   TO authenticated;

-- C-04 FIX: anon role no longer has INSERT on inquiries. All inserts go through
-- the send-inquiry Edge Function (service-role key) with server-side rate limiting.
GRANT SELECT                        ON inquiries        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON inquiries       TO authenticated;

GRANT SELECT, INSERT                ON messages         TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages        TO authenticated;

GRANT SELECT                        ON email_logs       TO authenticated;
GRANT SELECT                        ON admin_roles      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_properties TO authenticated;


-- ============================================================
-- 15. STORAGE BUCKETS & POLICIES
-- ============================================================

-- Buckets
INSERT INTO storage.buckets (id, name, public)
  VALUES ('property-photos', 'property-photos', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('profile-photos', 'profile-photos', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('application-docs', 'application-docs', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('lease-pdfs', 'lease-pdfs', false)
  ON CONFLICT (id) DO NOTHING;

-- Ensure lease-pdfs and application-docs are private
UPDATE storage.buckets SET public = false WHERE id = 'lease-pdfs';
UPDATE storage.buckets SET public = false WHERE id = 'application-docs';

-- FIX #9: Drop only the specific named policies this file manages instead of
-- wiping ALL policies on storage.objects. The previous approach silently
-- destroyed any manually-created policies for other buckets on each re-run.
DROP POLICY IF EXISTS "property_photos_read"           ON storage.objects;
DROP POLICY IF EXISTS "property_photos_insert"         ON storage.objects;
DROP POLICY IF EXISTS "property_photos_update"         ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_read"            ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_insert"          ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_update"          ON storage.objects;
DROP POLICY IF EXISTS "application_docs_upload_own"    ON storage.objects;
DROP POLICY IF EXISTS "application_docs_read_own"      ON storage.objects;
DROP POLICY IF EXISTS "application_docs_delete_own"    ON storage.objects;
DROP POLICY IF EXISTS "lease_pdfs_read_own"            ON storage.objects;

-- property-photos: public read, authenticated upload/update
CREATE POLICY "property_photos_read"   ON storage.objects FOR SELECT USING (bucket_id = 'property-photos');
CREATE POLICY "property_photos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'property-photos');
CREATE POLICY "property_photos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'property-photos');

-- profile-photos: public read, authenticated upload/update
CREATE POLICY "profile_photos_read"    ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "profile_photos_insert"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'profile-photos');
CREATE POLICY "profile_photos_update"  ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'profile-photos');

-- application-docs (private bucket)
--
-- INSERT: authenticated users may only upload into their own UID-prefixed folder.
--   Storage path convention: application-docs/{user_id}/{filename}
--   storage.foldername(name) returns an array of path segments; [1] is the first folder.
--   This prevents one authenticated user from writing into another user's folder.
CREATE POLICY "application_docs_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'application-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: users may only read files in their own UID-prefixed folder.
--   Admins bypass via is_admin() and can read all docs.
--   Landlords needing doc access should go through a service-role Edge Function.
CREATE POLICY "application_docs_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'application-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );

-- DELETE: users may only remove files they own (same folder-prefix rule as INSERT).
CREATE POLICY "application_docs_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'application-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- lease-pdfs (private bucket)
--
-- SELECT: applicants may read their own lease file; admins may read all.
--   File naming convention (enforced by sign-lease Edge Function):
--   lease-{app_id}-signed.html
--   The correlated sub-query matches the storage object's path against
--   the computed filename for every application owned by the caller.
CREATE POLICY "lease_pdfs_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lease-pdfs'
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1
        FROM   public.applications a
        WHERE  a.applicant_user_id = auth.uid()
          AND  objects.name = 'lease-' || a.app_id || '-signed.html'
      )
    )
  );

-- INSERT: no policy needed. The sign-lease Edge Function uses the service-role
-- key, which bypasses RLS entirely. No direct browser client should ever write
-- to this bucket, so leaving the INSERT unguarded by a permissive policy is
-- intentional — any unauthenticated or authenticated direct upload is blocked
-- by the absence of a matching INSERT policy.


-- ============================================================
-- 16. REALTIME
-- ============================================================
-- Adds tables to the supabase_realtime publication only if they
-- are not already members. pg_publication_tables is the system
-- catalog view for this check. Using a DO block makes this
-- section safe to re-run (plain ALTER PUBLICATION ... ADD TABLE
-- throws "relation already member of publication" on re-runs).
DO $$
DECLARE
  v_pub TEXT := 'supabase_realtime';
  v_tables TEXT[] := ARRAY['applications','messages','inquiries','properties'];
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = v_pub
        AND schemaname = 'public'
        AND tablename  = v_tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION %I ADD TABLE public.%I', v_pub, v_tbl);
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- 17. INDEXES
-- ============================================================
-- FIX #6: Removed idx_applications_app_id — the UNIQUE NOT NULL constraint
-- on applications.app_id already creates an implicit B-tree index.
-- A duplicate explicit index wastes storage and adds write overhead.
-- Also removed the duplicate applications_app_id_unique constraint addition
-- below for the same reason — the inline UNIQUE in CREATE TABLE is sufficient.
CREATE INDEX IF NOT EXISTS idx_applications_status           ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_landlord_id      ON applications(landlord_id);
CREATE INDEX IF NOT EXISTS idx_applications_property_id      ON applications(property_id);
CREATE INDEX IF NOT EXISTS idx_applications_email            ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_created_at       ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_user   ON applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_app_id               ON messages(app_id);
CREATE INDEX IF NOT EXISTS idx_properties_landlord_id        ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_status             ON properties(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_app_id             ON email_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_property_id         ON inquiries(property_id);


-- ============================================================
-- 18. SCHEDULED JOBS (pg_cron)
-- ============================================================
-- Requires the pg_cron extension. Enable it first:
--   Supabase → Database → Extensions → search "pg_cron" → Enable
-- Then re-run this file (or just this section) to register the job.
--
-- FIX #1: The block now checks whether pg_cron is enabled before
-- running. If not enabled it emits a NOTICE and exits gracefully
-- instead of crashing the entire file run with a missing-table error.
-- ============================================================

DO $pgcron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not enabled — skipping scheduled job setup. '
      'Enable the pg_cron extension in Supabase → Database → Extensions, '
      'then re-run this file to register the nightly lease-expiry job.';
    RETURN;
  END IF;

  -- Remove existing job if present so the schedule can be updated on re-run.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-expired-leases-nightly') THEN
    PERFORM cron.unschedule('mark-expired-leases-nightly');
  END IF;

  -- Run mark_expired_leases() every night at 01:00 UTC.
  -- The function bulk-updates applications where lease_status = 'sent'
  -- and lease_expiry_date < now() → sets lease_status = 'expired'.
  -- auth.uid() is NULL in cron context, which mark_expired_leases() explicitly allows.
  PERFORM cron.schedule(
    'mark-expired-leases-nightly',
    '0 1 * * *',
    'SELECT mark_expired_leases()'
  );
END $pgcron$;


-- ============================================================
-- PERFORMANCE: Composite indexes on properties (Session 015)
-- ============================================================
-- Single-column indexes on status and landlord_id already exist.
-- These composite indexes cover the common filter combinations on
-- the listings page so Postgres can satisfy them with an index-only
-- scan instead of filtering a full status-index range in memory.

CREATE INDEX IF NOT EXISTS idx_properties_status_type
  ON properties(status, property_type);

CREATE INDEX IF NOT EXISTS idx_properties_status_rent
  ON properties(status, monthly_rent);

CREATE INDEX IF NOT EXISTS idx_properties_status_beds
  ON properties(status, bedrooms);

CREATE INDEX IF NOT EXISTS idx_properties_status_avail
  ON properties(status, available_date);

-- ============================================================
-- PERFORMANCE: Full-text search on properties (Session 015)
-- ============================================================
-- Replaces the four-column ilike '%term%' scan (which cannot use
-- any B-tree index due to the leading wildcard) with a GIN-indexed
-- tsvector column. The column is GENERATED ALWAYS AS ... STORED so
-- Postgres keeps it in sync automatically on INSERT / UPDATE.
--
-- cp-api.js getListings() switches to .textSearch('search_tsv', term)
-- when a search term is present.
--
-- I-024 FIX: Extended to include description, property_type, and
-- amenities so searches like "dishwasher", "pet friendly", "pool",
-- "apartment" match listings that only have those terms in those fields.
-- Requires DROP + re-ADD because ALTER COLUMN ... SET EXPRESSION is
-- Postgres 16+ only and Supabase runs Postgres 15.

-- array_to_string is STABLE in PostgreSQL, not IMMUTABLE.
-- Generated columns require every function to be IMMUTABLE.
-- This wrapper is safe: the function depends only on its inputs.
CREATE OR REPLACE FUNCTION immutable_array_to_text(arr text[], sep text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT array_to_string(arr, sep)
$$;

ALTER TABLE properties DROP COLUMN IF EXISTS search_tsv;

ALTER TABLE properties
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig,
      coalesce(title,         '') || ' ' ||
      coalesce(city,          '') || ' ' ||
      coalesce(state,         '') || ' ' ||
      coalesce(address,       '') || ' ' ||
      coalesce(description,   '') || ' ' ||
      coalesce(property_type, '') || ' ' ||
      immutable_array_to_text(coalesce(amenities, '{}'::text[]), ' ')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_properties_search_gin
  ON properties USING GIN(search_tsv);

-- ============================================================
-- I-028 FIX: Add photo_file_ids column to properties (migration)
-- Idempotent — IF NOT EXISTS is safe on repeat runs.
-- Stores ImageKit fileIds in parallel with photo_urls so photos
-- can be deleted from CDN when removed from a listing (I-015).
-- ============================================================
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS photo_file_ids TEXT[];


-- ============================================================
-- I-043 FIX: document_urls migration (EXISTING DATABASES ONLY)
-- This ALTER TABLE is for databases created before Session 022.
-- Fresh installs already have this column via CREATE TABLE above
-- (line 334) — this block is a no-op for them (IF NOT EXISTS).
-- Safe to re-run: idempotent on all installs.
-- ============================================================
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS document_urls JSONB DEFAULT '[]'::jsonb;


-- ============================================================
-- C-01 FIX: get_application_status now requires last_name.
-- Drop the old single-argument version to prevent it being called directly.
-- ============================================================
DROP FUNCTION IF EXISTS get_application_status(TEXT);


-- ============================================================
-- H-02 FIX: Backfill tenant_sign_token and co_applicant_lease_token
-- for any existing lease records where the token is NULL.
-- Without this, legacy leases could be signed by anyone with just the app_id.
-- Uses the same token format as generate-lease: encode(gen_random_bytes(24), 'hex').
-- Safe to re-run: only updates rows where the token IS NULL.
-- ============================================================
UPDATE applications
SET tenant_sign_token = encode(gen_random_bytes(24), 'hex')
WHERE lease_status IN ('sent', 'signed', 'co_signed')
  AND tenant_sign_token IS NULL;

UPDATE applications
SET co_applicant_lease_token = encode(gen_random_bytes(24), 'hex')
WHERE has_co_applicant = true
  AND lease_status IN ('sent', 'signed', 'co_signed')
  AND co_applicant_lease_token IS NULL;


-- ============================================================
-- H-06 FIX: Add provider column to email_logs.
-- Records which email provider delivered each message: 'resend' or 'gas'.
-- Safe to re-run: IF NOT EXISTS guard prevents duplicate column error.
-- ============================================================
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider TEXT;


-- ============================================================
-- H-04 FIX: Add CHECK constraint to ensure photo_urls and photo_file_ids
-- arrays always have the same length. Prevents index misalignment that
-- causes wrong photos to be permanently deleted from ImageKit.
-- Pre-check: verify no rows currently violate this before adding.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'photo_arrays_parity'
    AND conrelid = 'properties'::regclass
  ) THEN
    ALTER TABLE properties ADD CONSTRAINT photo_arrays_parity
      CHECK (
        photo_urls IS NULL OR photo_file_ids IS NULL OR
        array_length(photo_urls, 1) IS NOT DISTINCT FROM array_length(photo_file_ids, 1)
      );
  END IF;
END $$;


-- ============================================================
-- C-03 FIX: DB-backed rate limiting — replaces in-memory Maps that reset
-- on Deno cold starts. Provides persistent rate limits across all instances.
-- Applied to process-application and send-inquiry Edge Functions.
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         BIGSERIAL PRIMARY KEY,
  ip         TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_log_lookup
  ON rate_limit_log (ip, endpoint, created_at);

-- RLS: only service-role can read/write (Edge Functions use service-role key)
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- pg_cron cleanup job: purge entries older than 1 hour every 30 minutes.
-- Requires pg_cron extension enabled in Supabase dashboard (Database → Extensions).
-- If pg_cron is not available, rows accumulate but the index keeps queries fast;
-- a manual periodic DELETE FROM rate_limit_log WHERE created_at < now() - interval '1 hour'
-- can be run as an alternative.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'rate-limit-cleanup',
      '*/30 * * * *',
      'DELETE FROM rate_limit_log WHERE created_at < now() - interval ''1 hour'''
    );
  END IF;
END $outer$;


-- ============================================================
-- M-07 FIX: DB-level length constraints on free-text fields.
-- HTML maxlength attributes exist but can be bypassed via direct API calls.
-- char_length() counts Unicode characters; length() counts bytes — use char_length().
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_description_len' AND conrelid = 'properties'::regclass
  ) THEN
    ALTER TABLE properties ADD CONSTRAINT chk_description_len
      CHECK (description IS NULL OR char_length(description) <= 5000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_title_len' AND conrelid = 'properties'::regclass
  ) THEN
    ALTER TABLE properties ADD CONSTRAINT chk_title_len
      CHECK (title IS NULL OR char_length(title) <= 200);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_showing_instructions_len' AND conrelid = 'properties'::regclass
  ) THEN
    ALTER TABLE properties ADD CONSTRAINT chk_showing_instructions_len
      CHECK (showing_instructions IS NULL OR char_length(showing_instructions) <= 2000);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_message_len' AND conrelid = 'inquiries'::regclass
  ) THEN
    ALTER TABLE inquiries ADD CONSTRAINT chk_message_len
      CHECK (message IS NULL OR char_length(message) <= 4000);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_admin_notes_len' AND conrelid = 'applications'::regclass
  ) THEN
    ALTER TABLE applications ADD CONSTRAINT chk_admin_notes_len
      CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 5000);
  END IF;
END $$;


-- ============================================================
-- M-06 FIX: Admin action audit log table.
-- Records which admin performed which action on which record.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_actions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  target_type TEXT        NOT NULL,
  target_id   TEXT        NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_created_at ON admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_user_id    ON admin_actions (user_id);

-- Only service-role (Edge Functions) can insert; admins can SELECT via their own RLS
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_actions_select ON admin_actions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_roles WHERE user_id = auth.uid())
  );

-- GRANT read access to authenticated admins
GRANT SELECT ON admin_actions TO authenticated;


-- ============================================================
-- DONE.
-- ============================================================
SELECT 'Choice Properties database setup complete.' AS result;
