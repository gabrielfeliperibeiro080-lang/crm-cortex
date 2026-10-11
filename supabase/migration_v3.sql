-- =====================================================================
-- CÓRTEX PARTNERS · migration v3
-- Execute no SQL Editor do Supabase.
-- Idempotente: pode ser rodado mais de uma vez com segurança.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. system_settings — configurações persistidas do sistema
-- ---------------------------------------------------------------------
create table if not exists public.system_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.system_settings (key, value)
values ('lead_distribution_mode', 'manual')
on conflict (key) do nothing;

alter table public.system_settings enable row level security;

drop policy if exists settings_select on public.system_settings;
create policy settings_select on public.system_settings for select to authenticated using (true);

drop policy if exists settings_admin_write on public.system_settings;
create policy settings_admin_write on public.system_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

revoke all on public.system_settings from anon;
grant select, insert, update on public.system_settings to authenticated;

drop trigger if exists set_updated_at on public.system_settings;
create trigger set_updated_at before update on public.system_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. leads — novos campos para distribuição e acompanhamento do teste
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists assigned_at     timestamptz,
  add column if not exists assigned_by     uuid references public.profiles(id) on delete set null,
  add column if not exists is_available    boolean not null default false,
  add column if not exists transfer_log    jsonb;

alter table public.leads
  add column if not exists trial_started_at  timestamptz,
  add column if not exists trial_ends_at     timestamptz,
  add column if not exists trial_status      text not null default 'not_started'
                           check (trial_status in ('not_started','active','ended','converted','not_converted')),
  add column if not exists trial_started_by  uuid references public.profiles(id) on delete set null;

alter table public.leads
  add column if not exists close_requested_at  timestamptz,
  add column if not exists close_requested_by  uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. partners — tipo da chave Pix + região de atuação
-- ---------------------------------------------------------------------
alter table public.partners
  add column if not exists pix_key_type  text
                           check (pix_key_type is null or pix_key_type in ('cpf','cnpj','email','phone','random')),
  add column if not exists city          text,
  add column if not exists state         text check (state is null or state ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------
-- 4. lead_transfer_history — histórico de transferências (auditoria)
-- ---------------------------------------------------------------------
create table if not exists public.lead_transfer_history (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  from_partner_id uuid references public.partners(id) on delete set null,
  to_partner_id   uuid references public.partners(id) on delete set null,
  transferred_by  uuid references public.profiles(id) on delete set null,
  reason          text,
  transferred_at  timestamptz not null default now()
);

alter table public.lead_transfer_history enable row level security;
drop policy if exists transfer_history_select on public.lead_transfer_history;
create policy transfer_history_select on public.lead_transfer_history for select to authenticated
  using (public.is_super_admin());
drop policy if exists transfer_history_insert on public.lead_transfer_history;
create policy transfer_history_insert on public.lead_transfer_history for insert to authenticated
  with check (public.is_super_admin());

revoke all on public.lead_transfer_history from anon;
grant select, insert on public.lead_transfer_history to authenticated;

-- ---------------------------------------------------------------------
-- 5. Atualizar RLS de leads para distribuição
-- ---------------------------------------------------------------------
do $$
begin
  execute 'drop policy if exists leads_select on public.leads';
  execute 'drop policy if exists leads_insert on public.leads';
  execute 'drop policy if exists leads_update on public.leads';
  execute 'drop policy if exists leads_delete on public.leads';
end $$;

create policy leads_select on public.leads for select to authenticated
  using (
    public.is_super_admin()
    or (public.is_active_partner() and partner_id = auth.uid())
    or (public.is_active_partner() and is_available = true)
  );

create policy leads_insert on public.leads for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.is_active_partner() and partner_id = auth.uid())
  );

create policy leads_update on public.leads for update to authenticated
  using (
    public.is_super_admin()
    or (public.is_active_partner() and partner_id = auth.uid())
  )
  with check (
    public.is_super_admin()
    or (public.is_active_partner() and partner_id = auth.uid())
  );

create policy leads_delete on public.leads for delete to authenticated
  using (public.is_super_admin() or (public.is_active_partner() and partner_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 6. RPC: claim_lead — parceiro assume lead disponível (concorrência segura)
-- ---------------------------------------------------------------------
create or replace function public.claim_lead(p_lead_id uuid)
returns public.leads
language plpgsql security definer set search_path = public as $$
declare
  v_lead public.leads;
begin
  if not public.is_active_partner() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select * into v_lead from public.leads
    where id = p_lead_id and is_available = true
    for update skip locked;

  if not found then
    raise exception 'Lead não disponível ou já assumido por outro parceiro' using errcode = 'P0002';
  end if;

  update public.leads set
    partner_id   = auth.uid(),
    is_available = false,
    assigned_at  = now(),
    assigned_by  = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  return v_lead;
end $$;

revoke all on function public.claim_lead(uuid) from public, anon;
grant execute on function public.claim_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC: start_trial — inicia teste de 24h
-- ---------------------------------------------------------------------
create or replace function public.start_trial(p_lead_id uuid)
returns public.leads
language plpgsql security definer set search_path = public as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead não encontrado'; end if;

  if not public.is_super_admin() and v_lead.partner_id <> auth.uid() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_lead.trial_status = 'active' then
    raise exception 'Teste já iniciado para este lead' using errcode = 'P0003';
  end if;

  if v_lead.trial_status in ('ended','converted','not_converted') then
    raise exception 'Não é possível reiniciar um teste já encerrado. Contate o administrador.' using errcode = 'P0004';
  end if;

  update public.leads set
    trial_started_at = now(),
    trial_ends_at    = now() + interval '24 hours',
    trial_status     = 'active',
    trial_started_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  return v_lead;
end $$;

revoke all on function public.start_trial(uuid) from public, anon;
grant execute on function public.start_trial(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. RPC: cancel_trial — admin reseta teste
-- ---------------------------------------------------------------------
create or replace function public.cancel_trial(p_lead_id uuid)
returns public.leads
language plpgsql security definer set search_path = public as $$
declare v_lead public.leads;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  update public.leads set
    trial_started_at = null,
    trial_ends_at    = null,
    trial_status     = 'not_started',
    trial_started_by = null
  where id = p_lead_id
  returning * into v_lead;

  if not found then raise exception 'Lead não encontrado'; end if;
  return v_lead;
end $$;

revoke all on function public.cancel_trial(uuid) from public, anon;
grant execute on function public.cancel_trial(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. RPC: transfer_lead — admin transfere lead entre parceiros
-- ---------------------------------------------------------------------
create or replace function public.transfer_lead(
  p_lead_id        uuid,
  p_to_partner_id  uuid,
  p_reason         text default null
) returns public.leads
language plpgsql security definer set search_path = public as $$
declare
  v_lead public.leads;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead não encontrado'; end if;

  insert into public.lead_transfer_history(lead_id, from_partner_id, to_partner_id, transferred_by, reason)
  values (p_lead_id, v_lead.partner_id, p_to_partner_id, auth.uid(), p_reason);

  update public.leads set
    partner_id   = p_to_partner_id,
    is_available = false,
    assigned_at  = now(),
    assigned_by  = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  return v_lead;
end $$;

revoke all on function public.transfer_lead(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_lead(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. RPC: auto_distribute_lead — distribui automaticamente por região
-- ---------------------------------------------------------------------
create or replace function public.auto_distribute_lead(p_lead_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead      public.leads;
  v_partner   uuid;
  v_mode      text;
begin
  select value into v_mode from public.system_settings where key = 'lead_distribution_mode';
  if v_mode <> 'auto' then return null; end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or not v_lead.is_available then return null; end if;

  select p.id into v_partner
  from public.partners p
  join public.profiles pr on pr.id = p.id and pr.active = true and pr.role = 'partner'
  left join (
    select partner_id, count(*) as active_count
    from public.leads
    where stage not in ('won','lost') and is_available = false
    group by partner_id
  ) lc on lc.partner_id = p.id
  where
    (p.city is not null and lower(trim(p.city)) = lower(trim(coalesce(v_lead.city, ''))))
    or (p.state is not null and p.state = v_lead.state and (v_lead.city is null or p.city is null))
  order by
    case when p.city is not null and lower(trim(p.city)) = lower(trim(coalesce(v_lead.city, ''))) then 0 else 1 end,
    coalesce(lc.active_count, 0),
    p.created_at
  limit 1;

  if v_partner is null then return null; end if;

  update public.leads set
    partner_id   = v_partner,
    is_available = false,
    assigned_at  = now()
  where id = p_lead_id;

  return v_partner;
end $$;

revoke all on function public.auto_distribute_lead(uuid) from public, anon;
grant execute on function public.auto_distribute_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. Atualiza trigger leads_before_write para suportar admin criando leads
-- ---------------------------------------------------------------------
create or replace function public.leads_before_write() returns trigger
language plpgsql set search_path = public as $$
declare v_sale_partner uuid;
begin
  if tg_op = 'INSERT' then
    if public.is_privileged() then
      if new.partner_id is null and not new.is_available then
        raise exception 'Forneça partner_id ou marque is_available=true' using errcode = '22023';
      end if;
    else
      new.partner_id := auth.uid();
      new.is_available := false;
    end if;
    new.stage_changed_at := now();
  else
    if not public.is_privileged() then
      if new.partner_id <> old.partner_id then
        raise exception 'partner_id é imutável' using errcode = '42501';
      end if;
      if new.trial_started_at is distinct from old.trial_started_at
         or new.trial_ends_at is distinct from old.trial_ends_at
         or new.trial_status is distinct from old.trial_status then
        raise exception 'Use a RPC start_trial para iniciar o teste' using errcode = '42501';
      end if;
      if new.stage = 'won' and old.stage <> 'won' then
        raise exception 'Somente o administrador pode confirmar o fechamento' using errcode = '42501';
      end if;
    end if;
    if new.stage <> old.stage then
      new.stage_changed_at := now();
    end if;
  end if;

  if new.name is not null then new.name := trim(new.name); end if;

  if new.sale_id is not null and (tg_op = 'INSERT' or new.sale_id is distinct from old.sale_id) then
    select partner_id into v_sale_partner from public.sales where id = new.sale_id;
    if v_sale_partner is null or (new.partner_id is not null and v_sale_partner <> new.partner_id) then
      raise exception 'Venda inválida para este lead' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

-- Concessão final
revoke all on function public.claim_lead(uuid), public.start_trial(uuid),
  public.cancel_trial(uuid), public.transfer_lead(uuid, uuid, text),
  public.auto_distribute_lead(uuid) from public, anon;

grant execute on function
  public.claim_lead(uuid),
  public.start_trial(uuid),
  public.cancel_trial(uuid),
  public.transfer_lead(uuid, uuid, text),
  public.auto_distribute_lead(uuid)
to authenticated;
