CREATE OR REPLACE FUNCTION public.clear_all_candidates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.change_history WHERE id IS NOT NULL;
  DELETE FROM public.chase_actions WHERE id IS NOT NULL;
  DELETE FROM public.compliance_items WHERE id IS NOT NULL;
  DELETE FROM public.candidates WHERE id IS NOT NULL;
END;
$$;