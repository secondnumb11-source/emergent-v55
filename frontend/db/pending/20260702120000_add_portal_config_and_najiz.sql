-- Add structured portal_config JSONB to clients and employees, and add needs_review_count to najiz_sync_logs

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_config jsonb;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS portal_config jsonb;

ALTER TABLE public.najiz_sync_logs
  ADD COLUMN IF NOT EXISTS needs_review_count integer;

-- Grant minimal privileges
GRANT SELECT, UPDATE ON public.clients TO authenticated;
GRANT SELECT, UPDATE ON public.employees TO authenticated;
GRANT SELECT, UPDATE ON public.najiz_sync_logs TO authenticated;
