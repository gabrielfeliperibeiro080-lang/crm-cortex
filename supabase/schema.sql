-- =====================================================================
-- CÓRTEX PARTNERS · schema v2 (Supabase / Postgres)
--
-- Para um projeto Supabase novo. Se você já rodou a v1, rode antes
-- supabase/reset_v1.sql (apaga as tabelas antigas).
--
-- Princípios:
--  1. O banco é a fonte da verdade: parceiro, preço, comissão e status
--     inicial são decididos por triggers, nunca pelo frontend.
--  2. RLS em todas as tabelas; parceiro só enxerga o que tem partner_id = auth.uid().
--  3. Comissões e pagamentos só mudam por funções (RPC) restritas ao Super Admin.
--  4. O script é idempotente: pode ser executado mais de uma vez.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILES (1 linha por usuário do Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) > 0),
  email       text,
  phone       text,
  role        text not null check (role in ('super_admin','partner')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, role)
);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES DE PERMISSÃO
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin' and p.active
  );
$$;

create or replace function public.is_active_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'partner' and p.active
  );
$$;

-- Super Admin, service_role ou execução direta no SQL Editor.
-- ATENÇÃO: nunca chame esta função de dentro de uma função SECURITY DEFINER
-- (lá current_user é o dono da função e o resultado seria sempre verdadeiro).
create or replace function public.is_privileged() returns boolean
language sql stable set search_path = public as $$
  select public.is_super_admin()
      or coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------
-- 3. PARTNERS (extensão 1:1 do profile com role = partner)
-- ---------------------------------------------------------------------
create table if not exists public.partners (
  id          uuid primary key,
  role        text not null default 'partner' check (role = 'partner'),
  pix_key     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (id, role) references public.profiles(id, role) on delete cascade
);

-- ---------------------------------------------------------------------
-- 4. SERVICES (produtos/planos; comissão percentual OU fixa)
-- ---------------------------------------------------------------------
create table if not exists public.services (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique check (length(trim(name)) > 0),
  description         text,
  price               numeric(12,2) not null check (price >= 0),
  billing_period      text not null default 'monthly' check (billing_period in ('monthly','one_time')),
  commission_type     text not null default 'percent' check (commission_type in ('percent','fixed')),
  commission_percent  numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  commission_fixed    numeric(12,2) not null default 0 check (commission_fixed >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint services_fixed_le_price check (commission_type <> 'fixed' or commission_fixed <= price)
);

insert into public.services (name, description, price, billing_period, commission_type, commission_percent)
values ('Gestão Pro', 'Software de gestão para oficinas e centros automotivos', 80, 'monthly', 'percent', 30)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 5. ESTABLISHMENTS
-- ---------------------------------------------------------------------
create table if not exists public.establishments (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null default auth.uid() references public.partners(id) on delete restrict,
  name              text not null check (length(trim(name)) > 0),
  responsible_name  text,
  whatsapp          text,
  email             text,
  city              text,
  state             text check (state is null or state ~ '^[A-Z]{2}$'),
  segment           text not null default 'outro'
                    check (segment in ('mecanica','estetica_automotiva','lavacar','auto_center','outro')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists establishments_partner_identity_uk
  on public.establishments (partner_id, lower(trim(name)), lower(trim(coalesce(city, ''))));
create index if not exists establishments_partner_idx on public.establishments (partner_id);

-- ---------------------------------------------------------------------
-- 6. SALES
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null default auth.uid() references public.partners(id) on delete restrict,
  establishment_id    uuid not null references public.establishments(id) on delete restrict,
  service_id          uuid not null references public.services(id) on delete restrict,
  amount              numeric(12,2) not null check (amount >= 0),
  -- snapshot da regra de comissão no momento da venda (preenchido por trigger)
  commission_type     text not null check (commission_type in ('percent','fixed')),
  commission_percent  numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  commission_fixed    numeric(12,2) not null default 0 check (commission_fixed >= 0),
  status              text not null default 'pending_payment'
                      check (status in ('pending_payment','paid','cancelled')),
  payment_method      text check (payment_method is null or payment_method in
                      ('pix','boleto','cartao_credito','cartao_debito','transferencia','dinheiro','outro')),
  sold_at             date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  paid_at             timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists sales_partner_sold_idx   on public.sales (partner_id, sold_at desc);
create index if not exists sales_status_sold_idx    on public.sales (status, sold_at desc);
create index if not exists sales_service_idx        on public.sales (service_id);
create index if not exists sales_establishment_idx  on public.sales (establishment_id);

-- ---------------------------------------------------------------------
-- 7. COMMISSIONS e COMMISSION_PAYMENTS
--    expected  = venda aguardando pagamento (comissão prevista)
--    pending   = venda paga, comissão a pagar ao parceiro
--    paid      = comissão paga ao parceiro
--    cancelled = venda cancelada (não conta em nenhum total)
-- ---------------------------------------------------------------------
create table if not exists public.commissions (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null unique references public.sales(id) on delete cascade,
  partner_id  uuid not null references public.partners(id) on delete restrict,
  amount      numeric(12,2) not null check (amount >= 0),
  status      text not null default 'expected' check (status in ('expected','pending','paid','cancelled')),
  paid_at     timestamptz,
  paid_by     uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint commissions_paid_consistency check ((status = 'paid') = (paid_at is not null))
);

create index if not exists commissions_partner_status_idx on public.commissions (partner_id, status);
create index if not exists commissions_status_idx         on public.commissions (status);

create table if not exists public.commission_payments (
  id             uuid primary key default gen_random_uuid(),
  commission_id  uuid not null references public.commissions(id) on delete restrict,
  partner_id     uuid not null references public.partners(id) on delete restrict,
  amount         numeric(12,2) not null check (amount >= 0),
  paid_at        timestamptz not null,
  paid_by        uuid references public.profiles(id),
  notes          text,
  reverted_at    timestamptz,
  reverted_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create unique index if not exists commission_payments_active_uk
  on public.commission_payments (commission_id) where reverted_at is null;
create index if not exists commission_payments_partner_idx on public.commission_payments (partner_id);

-- ---------------------------------------------------------------------
-- 8. COSTS e MONTHLY_GOALS (somente Super Admin; parceiro vê só a própria meta)
-- ---------------------------------------------------------------------
create table if not exists public.costs (
  id           uuid primary key default gen_random_uuid(),
  description  text not null check (length(trim(description)) > 0),
  category     text,
  amount       numeric(12,2) not null check (amount >= 0),
  cost_date    date not null,
  recurrence   text not null default 'none' check (recurrence in ('none','monthly')),
  ends_on      date,
  created_by   uuid default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists costs_date_idx on public.costs (cost_date);

create table if not exists public.monthly_goals (
  id            uuid primary key default gen_random_uuid(),
  month         date not null check (extract(day from month) = 1),
  partner_id    uuid references public.partners(id) on delete cascade, -- null = meta geral da Córtex
  revenue_goal  numeric(12,2) not null default 0 check (revenue_goal >= 0),
  sales_goal    integer not null default 0 check (sales_goal >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists monthly_goals_month_partner_uk
  on public.monthly_goals (month, coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------
-- 8b. LEADS (CRM Kanban do parceiro) e PARTNER_REQUESTS (pedidos de cadastro)
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null default auth.uid() references public.partners(id) on delete restrict,
  name               text not null check (length(trim(name)) > 0),          -- empresa / estabelecimento
  contact_name       text,
  whatsapp           text,
  email              text,
  city               text,
  state              text check (state is null or state ~ '^[A-Z]{2}$'),
  segment            text not null default 'outro'
                     check (segment in ('mecanica','estetica_automotiva','lavacar','auto_center','outro')),
  source             text,                                                   -- origem do lead
  stage              text not null default 'new'
                     check (stage in ('new','contacted','qualified','meeting','proposal','negotiation','won','lost')),
  opportunity_value  numeric(12,2) check (opportunity_value is null or opportunity_value >= 0),
  next_action        text,
  next_follow_up     date,
  notes              text,
  lost_reason        text,
  sale_id            uuid references public.sales(id) on delete set null,
  stage_changed_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists leads_partner_stage_idx on public.leads (partner_id, stage);
create index if not exists leads_follow_up_idx     on public.leads (next_follow_up) where next_follow_up is not null;

-- Pedidos de acesso feitos na tela pública. Só o Super Admin lê/aprova;
-- a inserção é feita pelo servidor (service_role), nunca direto pelo navegador.
create table if not exists public.partner_requests (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(trim(full_name)) between 2 and 120),
  email        text not null check (length(email) between 5 and 200),
  phone        text not null check (length(phone) between 8 and 30),
  city         text,
  state        text check (state is null or state ~ '^[A-Z]{2}$'),
  message      text check (message is null or length(message) <= 1000),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists partner_requests_pending_email_uk
  on public.partner_requests (lower(email)) where status = 'pending';

-- ---------------------------------------------------------------------
-- 9. TRIGGERS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','partners','services','establishments','commissions','costs','monthly_goals','leads'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- 9.1 Estabelecimentos: partner_id vem do usuário autenticado e é imutável
create or replace function public.establishments_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_privileged() then
      new.partner_id := auth.uid();
    end if;
    if new.partner_id is null then
      raise exception 'partner_id é obrigatório' using errcode = '22023';
    end if;
  elsif new.partner_id <> old.partner_id then
    raise exception 'partner_id é imutável' using errcode = '42501';
  end if;
  new.name := trim(new.name);
  return new;
end $$;

drop trigger if exists establishments_before_write on public.establishments;
create trigger establishments_before_write before insert or update on public.establishments
  for each row execute function public.establishments_before_write();

-- 9.2 Vendas: parceiro, preço, snapshot de comissão e status são decididos aqui
create or replace function public.sales_before_write() returns trigger
language plpgsql set search_path = public as $$
declare
  v_priv  boolean := public.is_privileged();
  v_svc   public.services%rowtype;
  v_est   uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'INSERT' then
    if not v_priv then
      new.partner_id := auth.uid();
      new.status     := 'pending_payment';
      new.paid_at    := null;
    end if;
    if new.partner_id is null then
      raise exception 'partner_id é obrigatório' using errcode = '22023';
    end if;

    select * into v_svc from public.services where id = new.service_id;
    if not found or not v_svc.active then
      raise exception 'Serviço inexistente ou indisponível' using errcode = '22023';
    end if;

    select partner_id into v_est from public.establishments where id = new.establishment_id;
    if v_est is null or v_est <> new.partner_id then
      raise exception 'Estabelecimento inválido para este parceiro' using errcode = '42501';
    end if;

    new.commission_type    := v_svc.commission_type;
    new.commission_percent := v_svc.commission_percent;
    new.commission_fixed   := v_svc.commission_fixed;
    if not v_priv or new.amount is null then
      new.amount := v_svc.price;           -- parceiro nunca define o valor
    end if;
    if not v_priv and new.sold_at > v_today then
      raise exception 'A data da venda não pode ser futura' using errcode = '22023';
    end if;
    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;

  else -- UPDATE
    if new.id <> old.id
       or new.partner_id <> old.partner_id
       or new.service_id <> old.service_id
       or new.establishment_id <> old.establishment_id
       or new.commission_type <> old.commission_type
       or new.commission_percent <> old.commission_percent
       or new.commission_fixed <> old.commission_fixed
       or new.created_at <> old.created_at then
      raise exception 'Campos da venda imutáveis (parceiro, serviço, estabelecimento e regra de comissão)'
        using errcode = '42501';
    end if;

    if not v_priv then
      if new.amount <> old.amount or new.paid_at is distinct from old.paid_at then
        raise exception 'Parceiro não pode alterar valor nem data de pagamento' using errcode = '42501';
      end if;
      if new.status <> old.status
         and not (old.status = 'pending_payment' and new.status = 'cancelled') then
        raise exception 'Parceiro só pode cancelar vendas aguardando pagamento' using errcode = '42501';
      end if;
      if old.status <> 'pending_payment'
         and (new.notes is distinct from old.notes
              or new.payment_method is distinct from old.payment_method
              or new.sold_at <> old.sold_at) then
        raise exception 'Venda finalizada não pode ser editada' using errcode = '42501';
      end if;
      if new.sold_at > v_today then
        raise exception 'A data da venda não pode ser futura' using errcode = '22023';
      end if;
    end if;

    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, old.paid_at, now());
    else
      new.paid_at := null;
    end if;
    new.updated_at := now();
  end if;

  return new;
end $$;

drop trigger if exists sales_before_write on public.sales;
create trigger sales_before_write before insert or update on public.sales
  for each row execute function public.sales_before_write();

-- 9.3 Comissão acompanha a venda automaticamente (SECURITY DEFINER: parceiro não escreve em commissions)
create or replace function public.sales_sync_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric(12,2);
  v_status text;
  v_c      public.commissions%rowtype;
begin
  v_amount := case new.commission_type
                when 'percent' then round(new.amount * new.commission_percent / 100, 2)
                else least(new.commission_fixed, new.amount)
              end;
  v_status := case new.status
                when 'paid' then 'pending'
                when 'pending_payment' then 'expected'
                else 'cancelled'
              end;

  select * into v_c from public.commissions where sale_id = new.id for update;

  if not found then
    insert into public.commissions (sale_id, partner_id, amount, status)
    values (new.id, new.partner_id, v_amount, v_status);
  elsif v_c.status = 'paid' then
    if new.status <> 'paid' or v_amount <> v_c.amount then
      raise exception 'Comissão já paga: reverta o pagamento antes de alterar ou cancelar a venda'
        using errcode = 'P0001';
    end if;
  else
    update public.commissions set amount = v_amount, status = v_status where id = v_c.id;
  end if;

  return new;
end $$;

drop trigger if exists sales_sync_commission on public.sales;
create trigger sales_sync_commission after insert or update on public.sales
  for each row execute function public.sales_sync_commission();

-- 9.4 Leads: partner_id vem do usuário autenticado, é imutável, e a venda vinculada precisa ser do mesmo parceiro
create or replace function public.leads_before_write() returns trigger
language plpgsql set search_path = public as $$
declare v_sale_partner uuid;
begin
  if tg_op = 'INSERT' then
    if not public.is_privileged() then
      new.partner_id := auth.uid();
    end if;
    if new.partner_id is null then
      raise exception 'partner_id é obrigatório' using errcode = '22023';
    end if;
    new.stage_changed_at := now();
  else
    if new.partner_id <> old.partner_id then
      raise exception 'partner_id é imutável' using errcode = '42501';
    end if;
    if new.stage <> old.stage then
      new.stage_changed_at := now();
    end if;
  end if;

  new.name := trim(new.name);

  if new.sale_id is not null and (tg_op = 'INSERT' or new.sale_id is distinct from old.sale_id) then
    select partner_id into v_sale_partner from public.sales where id = new.sale_id;  -- RLS vale aqui
    if v_sale_partner is null or v_sale_partner <> new.partner_id then
      raise exception 'Venda inválida para este lead' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();

-- ---------------------------------------------------------------------
-- 10. FUNÇÕES (RPC) DE PAGAMENTO DE COMISSÃO — somente Super Admin
-- ---------------------------------------------------------------------
create or replace function public.mark_commission_paid(
  p_commission_id uuid,
  p_paid_at timestamptz default now(),
  p_notes text default null
) returns public.commissions
language plpgsql security definer set search_path = public as $$
declare v_c public.commissions;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_c from public.commissions where id = p_commission_id for update;
  if not found then raise exception 'Comissão não encontrada'; end if;
  if v_c.status = 'paid' then raise exception 'Comissão já está paga'; end if;
  if v_c.status <> 'pending' then
    raise exception 'Só é possível pagar comissões pendentes (venda paga)';
  end if;

  update public.commissions
     set status = 'paid', paid_at = coalesce(p_paid_at, now()), paid_by = auth.uid()
   where id = v_c.id returning * into v_c;

  insert into public.commission_payments (commission_id, partner_id, amount, paid_at, paid_by, notes)
  values (v_c.id, v_c.partner_id, v_c.amount, v_c.paid_at, auth.uid(), p_notes);

  return v_c;
end $$;

create or replace function public.mark_commission_pending(p_commission_id uuid)
returns public.commissions
language plpgsql security definer set search_path = public as $$
declare v_c public.commissions;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_c from public.commissions where id = p_commission_id for update;
  if not found then raise exception 'Comissão não encontrada'; end if;
  if v_c.status <> 'paid' then raise exception 'A comissão não está paga'; end if;

  update public.commissions
     set status = 'pending', paid_at = null, paid_by = null
   where id = v_c.id returning * into v_c;

  update public.commission_payments
     set reverted_at = now(), reverted_by = auth.uid()
   where commission_id = v_c.id and reverted_at is null;

  return v_c;
end $$;

-- ---------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.partners            enable row level security;
alter table public.services            enable row level security;
alter table public.establishments      enable row level security;
alter table public.sales               enable row level security;
alter table public.commissions         enable row level security;
alter table public.commission_payments enable row level security;
alter table public.costs               enable row level security;
alter table public.monthly_goals       enable row level security;
alter table public.leads               enable row level security;
alter table public.partner_requests    enable row level security;

-- limpa policies antigas (v1 e execuções anteriores)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','partners','services','establishments','sales',
                        'commissions','commission_payments','costs','monthly_goals','leads','partner_requests')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- profiles: cada um lê o próprio; só admin escreve (parceiro não consegue mudar role/active)
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- partners: parceiro lê e atualiza (pix) só a própria linha
create policy partners_select on public.partners for select to authenticated
  using (public.is_super_admin() or (id = auth.uid() and public.is_active_partner()));
create policy partners_update_own on public.partners for update to authenticated
  using (id = auth.uid() and public.is_active_partner())
  with check (id = auth.uid() and public.is_active_partner());
create policy partners_admin_all on public.partners for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- services: parceiro só lê serviços ativos; admin faz tudo
create policy services_select on public.services for select to authenticated
  using (public.is_super_admin() or (active and public.is_active_partner()));
create policy services_admin_all on public.services for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- establishments
create policy establishments_select on public.establishments for select to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy establishments_insert on public.establishments for insert to authenticated
  with check (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy establishments_update on public.establishments for update to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()))
  with check (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy establishments_delete on public.establishments for delete to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));

-- sales (delete só admin)
create policy sales_select on public.sales for select to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy sales_insert on public.sales for insert to authenticated
  with check (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy sales_update on public.sales for update to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()))
  with check (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy sales_delete on public.sales for delete to authenticated
  using (public.is_super_admin());

-- commissions e pagamentos: somente leitura (escrita apenas via triggers/RPC)
create policy commissions_select on public.commissions for select to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy commission_payments_select on public.commission_payments for select to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));

-- costs: só admin
create policy costs_admin_all on public.costs for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- monthly_goals: admin tudo; parceiro vê apenas a meta individual dele
create policy goals_select on public.monthly_goals for select to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy goals_admin_all on public.monthly_goals for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- leads: parceiro só os próprios; admin tudo
create policy leads_select on public.leads for select to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy leads_update on public.leads for update to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()))
  with check (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));
create policy leads_delete on public.leads for delete to authenticated
  using (public.is_super_admin() or (partner_id = auth.uid() and public.is_active_partner()));

-- partner_requests: somente Super Admin (inserção pública é feita pelo servidor com service_role)
create policy partner_requests_admin_all on public.partner_requests for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 12. PRIVILÉGIOS (defesa em profundidade além do RLS)
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.partners, public.services, public.establishments,
              public.sales, public.commissions, public.commission_payments,
              public.costs, public.monthly_goals, public.leads, public.partner_requests from anon;
revoke all on public.profiles, public.partners, public.services, public.establishments,
              public.sales, public.commissions, public.commission_payments,
              public.costs, public.monthly_goals, public.leads, public.partner_requests from authenticated;

grant select, insert, update, delete on
  public.profiles, public.partners, public.services, public.establishments,
  public.sales, public.costs, public.monthly_goals, public.leads to authenticated;
grant select, update on public.partner_requests to authenticated;
grant select on public.commissions, public.commission_payments to authenticated;

revoke all on function public.is_super_admin(), public.is_active_partner(), public.is_privileged(),
  public.mark_commission_paid(uuid, timestamptz, text), public.mark_commission_pending(uuid)
  from public, anon;
grant execute on function public.is_super_admin(), public.is_active_partner(), public.is_privileged(),
  public.mark_commission_paid(uuid, timestamptz, text), public.mark_commission_pending(uuid)
  to authenticated;
