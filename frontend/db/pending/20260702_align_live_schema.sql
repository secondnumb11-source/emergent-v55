-- =============================================================================
-- 20260702: Align live schema with sync API & UI expectations (APPLIED to live DB)
-- case_parties: add party_* columns used by /api/public/najiz-sync and the UI
-- case_judgments: add court_name / circuit_number / appeal_circuit_number
-- case_details: unique (owner_id, case_number) for idempotent upserts
-- =============================================================================

ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_type TEXT DEFAULT 'plaintiff';
ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_name TEXT;
ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_id_number TEXT;
ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_nationality TEXT;
ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_identity_type TEXT;
ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_capacity TEXT;
ALTER TABLE public.case_parties ADD COLUMN IF NOT EXISTS party_status_in_case TEXT;

-- backfill from legacy columns if present
UPDATE public.case_parties SET
  party_type = COALESCE(party_type, CASE WHEN party_role = 'defendant' THEN 'defendant' ELSE 'plaintiff' END),
  party_name = COALESCE(party_name, name),
  party_id_number = COALESCE(party_id_number, id_number),
  party_nationality = COALESCE(party_nationality, nationality),
  party_identity_type = COALESCE(party_identity_type, id_type),
  party_capacity = COALESCE(party_capacity, capacity),
  party_status_in_case = COALESCE(party_status_in_case, poa_status)
WHERE party_name IS NULL AND name IS NOT NULL;

ALTER TABLE public.case_judgments ADD COLUMN IF NOT EXISTS court_name TEXT;
ALTER TABLE public.case_judgments ADD COLUMN IF NOT EXISTS circuit_number TEXT;
ALTER TABLE public.case_judgments ADD COLUMN IF NOT EXISTS appeal_circuit_number TEXT;

UPDATE public.case_judgments SET
  court_name = COALESCE(court_name, court),
  circuit_number = COALESCE(circuit_number, circuit),
  appeal_circuit_number = COALESCE(appeal_circuit_number, appeal_circuit)
WHERE court_name IS NULL AND court IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS case_details_owner_case_number_key
  ON public.case_details (owner_id, case_number);

-- relax legacy NOT NULL constraints (superseded by the new columns / auto-linking)
ALTER TABLE public.case_parties ALTER COLUMN party_role DROP NOT NULL;
ALTER TABLE public.case_parties ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.case_parties ALTER COLUMN party_role SET DEFAULT 'plaintiff';
ALTER TABLE public.case_parties ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE public.case_judgments ALTER COLUMN case_id DROP NOT NULL;

-- refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'schema aligned' AS result;
