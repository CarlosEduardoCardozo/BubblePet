-- get_advisors sinalizou current_petshop_id() como chamável via /rest/v1/rpc por
-- qualquer role. A função só devolve o petshop_id do próprio auth.uid(), então não
-- vaza dado de terceiros, mas não deveria estar exposta como endpoint público.
revoke execute on function public.current_petshop_id() from public;
revoke execute on function public.current_petshop_id() from anon;
grant execute on function public.current_petshop_id() to authenticated;
