-- =============================================================================
-- 20260702: Bot & deep-scrape additional fields (APPLIED to live DB)
-- executions: creditor / ids / request_type / execution_data (طلبات التنفيذ)
-- lawsuit_requests: request_number / request_date / request_status (الطلبات)
-- =============================================================================
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS creditor_name TEXT;
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS creditor_id_number TEXT;
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS debtor_id_number TEXT;
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS request_type TEXT;
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS execution_data TEXT;

ALTER TABLE public.lawsuit_requests ADD COLUMN IF NOT EXISTS request_number TEXT;
ALTER TABLE public.lawsuit_requests ADD COLUMN IF NOT EXISTS request_date DATE;
ALTER TABLE public.lawsuit_requests ADD COLUMN IF NOT EXISTS request_status TEXT;

NOTIFY pgrst, 'reload schema';
