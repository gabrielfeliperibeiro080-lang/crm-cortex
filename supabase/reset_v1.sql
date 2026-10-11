-- =====================================================================
-- CÓRTEX PARTNERS · RESET (DESTRUTIVO)
-- Apaga as tabelas do schema v1 e v2 e TODOS os dados delas.
-- Use apenas em ambiente de desenvolvimento, antes de rodar schema.sql.
-- Não mexe em auth.users.
-- =====================================================================
drop table if exists public.partner_requests    cascade;
drop table if exists public.leads               cascade;
drop table if exists public.commission_payments cascade;
drop table if exists public.commissions         cascade;
drop table if exists public.monthly_goals       cascade;
drop table if exists public.costs               cascade;
drop table if exists public.sales               cascade;
drop table if exists public.establishments      cascade;
drop table if exists public.services           cascade;
drop table if exists public.partners            cascade;
drop table if exists public.profiles            cascade;

drop function if exists public.mark_commission_paid(uuid, timestamptz, text);
drop function if exists public.mark_commission_pending(uuid);
drop function if exists public.leads_before_write();
drop function if exists public.sales_sync_commission();
drop function if exists public.sales_before_write();
drop function if exists public.establishments_before_write();
drop function if exists public.is_privileged();
drop function if exists public.is_active_partner();
drop function if exists public.is_super_admin();
