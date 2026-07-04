-- Migration: Fix Najiz sync upsert constraints
-- Date: 2026-07-01
-- Description: Add unique indexes on (owner_id, najiz_id) for cases, powers_of_attorney, executions
--              to support ON CONFLICT upsert operations from the Chrome extension sync API.
--              Also fixes the document_type enum mapping to use valid values.

-- Add unique index for cases upsert
CREATE UNIQUE INDEX IF NOT EXISTS cases_owner_najiz_uk 
  ON public.cases (owner_id, najiz_id);

-- Add unique index for powers_of_attorney upsert
CREATE UNIQUE INDEX IF NOT EXISTS powers_of_attorney_owner_najiz_uk 
  ON public.powers_of_attorney (owner_id, najiz_id);

-- Add unique index for executions upsert
CREATE UNIQUE INDEX IF NOT EXISTS executions_owner_najiz_uk 
  ON public.executions (owner_id, najiz_id);
