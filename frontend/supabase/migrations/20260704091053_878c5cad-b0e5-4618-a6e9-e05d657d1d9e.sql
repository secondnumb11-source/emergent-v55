
CREATE TABLE IF NOT EXISTS public.case_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  case_number TEXT NOT NULL,
  case_classification TEXT,
  case_type_detail TEXT,
  case_date DATE,
  subject_matter TEXT,
  plaintiff_requests TEXT,
  case_foundations TEXT,
  court_name TEXT,
  circuit_number TEXT,
  is_draft BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_details_owner ON public.case_details(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS case_details_owner_case_number_key ON public.case_details(owner_id, case_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_details TO authenticated;
GRANT ALL ON public.case_details TO service_role;
ALTER TABLE public.case_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manage case_details" ON public.case_details;
CREATE POLICY "owner manage case_details" ON public.case_details FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS trg_case_details_updated ON public.case_details;
CREATE TRIGGER trg_case_details_updated BEFORE UPDATE ON public.case_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.case_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  case_number TEXT,
  name TEXT,
  party_role TEXT DEFAULT 'plaintiff',
  party_type TEXT DEFAULT 'plaintiff',
  party_name TEXT,
  party_id_number TEXT,
  party_nationality TEXT,
  party_identity_type TEXT,
  party_capacity TEXT,
  party_status_in_case TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_parties_owner ON public.case_parties(owner_id);
CREATE INDEX IF NOT EXISTS idx_case_parties_case_number ON public.case_parties(owner_id, case_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_parties TO authenticated;
GRANT ALL ON public.case_parties TO service_role;
ALTER TABLE public.case_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manage case_parties" ON public.case_parties;
CREATE POLICY "owner manage case_parties" ON public.case_parties FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS trg_case_parties_updated ON public.case_parties;
CREATE TRIGGER trg_case_parties_updated BEFORE UPDATE ON public.case_parties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.case_sessions_detail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  case_number TEXT,
  session_status TEXT,
  court_name TEXT,
  circuit_number TEXT,
  mechanism TEXT,
  degree TEXT,
  session_date DATE,
  session_time TEXT,
  session_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_sessions_detail_owner ON public.case_sessions_detail(owner_id);
CREATE INDEX IF NOT EXISTS idx_case_sessions_detail_case_number ON public.case_sessions_detail(owner_id, case_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_sessions_detail TO authenticated;
GRANT ALL ON public.case_sessions_detail TO service_role;
ALTER TABLE public.case_sessions_detail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manage case_sessions_detail" ON public.case_sessions_detail;
CREATE POLICY "owner manage case_sessions_detail" ON public.case_sessions_detail FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS trg_case_sessions_detail_updated ON public.case_sessions_detail;
CREATE TRIGGER trg_case_sessions_detail_updated BEFORE UPDATE ON public.case_sessions_detail FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.case_judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  case_number TEXT,
  judgment_finality TEXT,
  deed_number TEXT,
  deed_date DATE,
  court_name TEXT,
  circuit_number TEXT,
  degree TEXT,
  appeal_deed_date DATE,
  appeal_circuit_number TEXT,
  judgment_details TEXT,
  judgment_document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_judgments_owner ON public.case_judgments(owner_id);
CREATE INDEX IF NOT EXISTS idx_case_judgments_case_number ON public.case_judgments(owner_id, case_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_judgments TO authenticated;
GRANT ALL ON public.case_judgments TO service_role;
ALTER TABLE public.case_judgments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manage case_judgments" ON public.case_judgments;
CREATE POLICY "owner manage case_judgments" ON public.case_judgments FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS trg_case_judgments_updated ON public.case_judgments;
CREATE TRIGGER trg_case_judgments_updated BEFORE UPDATE ON public.case_judgments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.lawsuit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  case_number TEXT,
  case_date DATE,
  request_number TEXT,
  request_date DATE,
  request_status TEXT,
  court_name TEXT,
  circuit_number TEXT,
  case_status TEXT,
  case_classification TEXT,
  case_type_detail TEXT,
  applicant_type TEXT,
  applicant_name TEXT,
  request_type TEXT,
  judgment_number TEXT,
  submissions TEXT,
  request_reasons TEXT,
  reason_1 TEXT,
  reason_2 TEXT,
  reason_3 TEXT,
  reason_4 TEXT,
  reason_5 TEXT,
  reason_6 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lawsuit_requests_owner ON public.lawsuit_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_lawsuit_requests_case_number ON public.lawsuit_requests(owner_id, case_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lawsuit_requests TO authenticated;
GRANT ALL ON public.lawsuit_requests TO service_role;
ALTER TABLE public.lawsuit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manage lawsuit_requests" ON public.lawsuit_requests;
CREATE POLICY "owner manage lawsuit_requests" ON public.lawsuit_requests FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS trg_lawsuit_requests_updated ON public.lawsuit_requests;
CREATE TRIGGER trg_lawsuit_requests_updated BEFORE UPDATE ON public.lawsuit_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
