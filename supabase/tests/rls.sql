-- =====================================================================
-- CÓRTEX PARTNERS · TESTES DE RLS E REGRAS DE NEGÓCIO
--
-- Como rodar: cole tudo no SQL Editor do Supabase e execute.
--  * Tudo roda dentro de uma transação que termina em ROLLBACK:
--    nenhum dado de teste é gravado, nem dados reais são alterados.
--  * Se algum teste falhar, o script para com "FALHA Tn: ..." (veja a mensagem).
--  * Se tudo passar, a última linha retorna "TODOS OS TESTES PASSARAM".
-- =====================================================================
begin;

do $test$
declare
  v_admin uuid := gen_random_uuid();
  v_a     uuid := gen_random_uuid();   -- parceiro A
  v_b     uuid := gen_random_uuid();   -- parceiro B
  v_c     uuid := gen_random_uuid();   -- parceiro C (será desativado)
  v_svc   uuid;
  v_est_a uuid; v_est_b uuid; v_est_c uuid;
  v_sale_a uuid; v_sale_b uuid; v_sale_a2 uuid;
  v_comm_a uuid; v_comm_b uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n int; v_ok boolean;
  v_lead_a uuid; v_lead_b uuid; v_stage text;
  v_pid uuid; v_amount numeric; v_status text; v_pct numeric;
begin
  ---------------------------------------------------------------- SETUP (como postgres)
  insert into auth.users (id, email, aud, role) values
    (v_admin, 'admin-'||v_admin||'@teste.invalid', 'authenticated', 'authenticated'),
    (v_a,     'a-'||v_a||'@teste.invalid',         'authenticated', 'authenticated'),
    (v_b,     'b-'||v_b||'@teste.invalid',         'authenticated', 'authenticated'),
    (v_c,     'c-'||v_c||'@teste.invalid',         'authenticated', 'authenticated');

  insert into public.profiles (id, full_name, role) values
    (v_admin, 'Admin Teste', 'super_admin'),
    (v_a, 'Parceiro A', 'partner'),
    (v_b, 'Parceiro B', 'partner'),
    (v_c, 'Parceiro C', 'partner');
  insert into public.partners (id) values (v_a), (v_b), (v_c);

  select id into v_svc from public.services where name = 'Gestão Pro';
  if v_svc is null then raise exception 'FALHA SETUP: serviço Gestão Pro não existe (rode o schema.sql)'; end if;

  insert into public.establishments (partner_id, name, segment) values (v_c, 'Oficina C', 'outro') returning id into v_est_c;
  update public.profiles set active = false where id = v_c;

  ---------------------------------------------------------------- T1-T2: PARCEIRO A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T1: partner_id forjado no estabelecimento é ignorado
  insert into public.establishments (partner_id, name, responsible_name, whatsapp, email, city, state, segment)
  values (v_b, 'Oficina A', 'Resp A', '14999990000', 'a@x.com', 'Bauru', 'SP', 'mecanica')
  returning id, partner_id into v_est_a, v_pid;
  if v_pid <> v_a then raise exception 'FALHA T1: partner_id forjado foi aceito no estabelecimento'; end if;

  -- T2: venda com tudo forjado (outro parceiro, valor 1, status pago, comissão 100%)
  insert into public.sales (partner_id, establishment_id, service_id, amount, status,
                            commission_type, commission_percent, commission_fixed, payment_method, sold_at)
  values (v_b, v_est_a, v_svc, 1, 'paid', 'percent', 100, 0, 'pix', v_today)
  returning id, partner_id, amount, status, commission_percent into v_sale_a, v_pid, v_amount, v_status, v_pct;
  if v_pid <> v_a then raise exception 'FALHA T2a: partner_id forjado foi aceito na venda'; end if;
  if v_amount <> 80 then raise exception 'FALHA T2b: valor forjado aceito (%)', v_amount; end if;
  if v_status <> 'pending_payment' then raise exception 'FALHA T2c: status forjado aceito (%)', v_status; end if;
  if v_pct <> 30 then raise exception 'FALHA T2d: percentual forjado aceito (%)', v_pct; end if;

  select id, amount, status into v_comm_a, v_amount, v_status from public.commissions where sale_id = v_sale_a;
  if v_amount <> 24 then raise exception 'FALHA T2e: comissão esperada 24, veio %', v_amount; end if;
  if v_status <> 'expected' then raise exception 'FALHA T2f: comissão deveria ser prevista, veio %', v_status; end if;

  -- T2g: venda com data futura é recusada
  v_ok := false;
  begin
    insert into public.sales (establishment_id, service_id, commission_type, amount, sold_at)
    values (v_est_a, v_svc, 'percent', 80, v_today + 5);
    v_ok := true;
  exception when others then null; end;
  if v_ok then raise exception 'FALHA T2g: venda com data futura foi aceita'; end if;

  ---------------------------------------------------------------- T3-T5: PARCEIRO B
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.establishments (name, segment, city) values ('Oficina B', 'lavacar', 'Bauru') returning id into v_est_b;

  -- T3: B não consegue vender usando o estabelecimento de A
  v_ok := false;
  begin
    insert into public.sales (establishment_id, service_id, commission_type, amount)
    values (v_est_a, v_svc, 'percent', 80);
    v_ok := true;
  exception when others then null; end;
  if v_ok then raise exception 'FALHA T3: B vendeu com estabelecimento de A'; end if;

  -- T4: B não enxerga nada de A nem de admin
  select count(*) into v_n from public.sales;               if v_n <> 0 then raise exception 'FALHA T4a: B vê % vendas', v_n; end if;
  select count(*) into v_n from public.establishments;      if v_n <> 1 then raise exception 'FALHA T4b: B vê % estabelecimentos (esperado 1)', v_n; end if;
  select count(*) into v_n from public.commissions;         if v_n <> 0 then raise exception 'FALHA T4c: B vê % comissões', v_n; end if;
  select count(*) into v_n from public.commission_payments; if v_n <> 0 then raise exception 'FALHA T4d: B vê pagamentos'; end if;
  select count(*) into v_n from public.costs;               if v_n <> 0 then raise exception 'FALHA T4e: B vê custos'; end if;
  select count(*) into v_n from public.monthly_goals;       if v_n <> 0 then raise exception 'FALHA T4f: B vê metas'; end if;
  select count(*) into v_n from public.profiles;            if v_n <> 1 then raise exception 'FALHA T4g: B vê % perfis (esperado 1)', v_n; end if;
  select count(*) into v_n from public.partners;            if v_n <> 1 then raise exception 'FALHA T4h: B vê % parceiros (esperado 1)', v_n; end if;

  -- T4i: B tenta alterar/apagar dados de A informando o ID manualmente
  v_n := 0; begin update public.sales set notes = 'hack' where id = v_sale_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T4i: B alterou venda de A'; end if;
  v_n := 0; begin delete from public.sales where id = v_sale_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T4j: B apagou venda de A'; end if;
  v_n := 0; begin update public.establishments set name = 'hack' where id = v_est_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T4k: B alterou estabelecimento de A'; end if;
  v_n := 0; begin delete from public.establishments where id = v_est_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T4l: B apagou estabelecimento de A'; end if;
  v_n := 0; begin update public.partners set pix_key = 'hack' where id = v_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T4m: B alterou dados de parceiro A'; end if;

  -- T4n: B tenta virar super_admin
  v_n := 0; begin update public.profiles set role = 'super_admin' where id = v_b; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T4n: B alterou o próprio role'; end if;

  -- T5: B cria venda própria e tenta fraudar
  insert into public.sales (establishment_id, service_id, commission_type, amount)
  values (v_est_b, v_svc, 'percent', 80) returning id, partner_id into v_sale_b, v_pid;
  if v_pid <> v_b then raise exception 'FALHA T5a: venda de B ficou com outro parceiro'; end if;
  select id into v_comm_b from public.commissions where sale_id = v_sale_b;

  v_ok := false; begin update public.sales set amount = 1000 where id = v_sale_b; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T5b: parceiro alterou o valor da venda'; end if;
  v_ok := false; begin update public.sales set status = 'paid' where id = v_sale_b; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T5c: parceiro marcou venda como paga'; end if;
  v_n := 0; begin update public.commissions set amount = 999 where id = v_comm_b; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T5d: parceiro alterou comissão'; end if;
  v_ok := false; begin insert into public.commissions (sale_id, partner_id, amount, status) values (v_sale_b, v_b, 999, 'pending'); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T5e: parceiro inseriu comissão'; end if;
  v_ok := false; begin perform public.mark_commission_paid(v_comm_b); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T5f: parceiro pagou comissão via RPC'; end if;

  -- T5g: parceiro pode cancelar venda aguardando pagamento; comissão é cancelada
  update public.sales set status = 'cancelled' where id = v_sale_b;
  select status into v_status from public.commissions where id = v_comm_b;
  if v_status <> 'cancelled' then raise exception 'FALHA T5g: comissão deveria estar cancelada, está %', v_status; end if;
  v_ok := false; begin update public.sales set notes = 'editando cancelada' where id = v_sale_b; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T5h: venda cancelada continuou editável'; end if;

  ---------------------------------------------------------------- T6: A de novo
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.sales;          if v_n <> 1 then raise exception 'FALHA T6a: A vê % vendas (esperado 1)', v_n; end if;
  select count(*) into v_n from public.establishments; if v_n <> 1 then raise exception 'FALHA T6b: A vê % estabelecimentos', v_n; end if;

  update public.sales set notes = 'observação do parceiro' where id = v_sale_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALHA T6c: A não conseguiu editar observação da própria venda'; end if;

  update public.partners set pix_key = 'pix-a' where id = v_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALHA T6d: A não conseguiu atualizar a própria chave pix'; end if;

  v_ok := false; begin insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'super_admin'); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T6e: parceiro criou perfil super_admin'; end if;

  ---------------------------------------------------------------- T7: parceiro inativo
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.establishments; if v_n <> 0 then raise exception 'FALHA T7a: parceiro inativo ainda lê dados'; end if;
  v_ok := false; begin insert into public.establishments (name) values ('Nova C'); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T7b: parceiro inativo conseguiu inserir'; end if;

  ---------------------------------------------------------------- T8: anônimo
  reset role;
  set local role anon;
  v_ok := false; begin select count(*) into v_n from public.sales; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T8: usuário anônimo conseguiu consultar vendas'; end if;

  ---------------------------------------------------------------- T9: SUPER ADMIN
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.sales where id in (v_sale_a, v_sale_b);
  if v_n <> 2 then raise exception 'FALHA T9a: admin vê % das 2 vendas de teste', v_n; end if;
  select count(*) into v_n from public.establishments where id in (v_est_a, v_est_b, v_est_c);
  if v_n <> 3 then raise exception 'FALHA T9b: admin vê % dos 3 estabelecimentos de teste', v_n; end if;

  -- confirma pagamento da venda de A -> comissão vira pendente
  update public.sales set status = 'paid', payment_method = 'pix' where id = v_sale_a;
  select status into v_status from public.commissions where id = v_comm_a;
  if v_status <> 'pending' then raise exception 'FALHA T9c: venda paga deveria gerar comissão pendente, veio %', v_status; end if;
  select count(*) into v_n from public.sales where id = v_sale_a and paid_at is not null;
  if v_n <> 1 then raise exception 'FALHA T9d: paid_at não foi preenchido'; end if;

  -- paga a comissão
  perform public.mark_commission_paid(v_comm_a, now(), 'teste');
  select status into v_status from public.commissions where id = v_comm_a;
  if v_status <> 'paid' then raise exception 'FALHA T9e: comissão não ficou paga'; end if;
  select count(*) into v_n from public.commission_payments where commission_id = v_comm_a and reverted_at is null;
  if v_n <> 1 then raise exception 'FALHA T9f: pagamento não foi registrado'; end if;

  -- não pode pagar duas vezes nem cancelar venda com comissão paga
  v_ok := false; begin perform public.mark_commission_paid(v_comm_a); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T9g: comissão paga duas vezes'; end if;
  v_ok := false; begin update public.sales set status = 'cancelled' where id = v_sale_a; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T9h: cancelou venda com comissão já paga'; end if;

  -- comissão de venda cancelada não pode ser paga
  v_ok := false; begin perform public.mark_commission_paid(v_comm_b); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T9i: pagou comissão de venda cancelada'; end if;

  -- reverte pagamento
  perform public.mark_commission_pending(v_comm_a);
  select status into v_status from public.commissions where id = v_comm_a;
  if v_status <> 'pending' then raise exception 'FALHA T9j: reversão não voltou para pendente'; end if;
  select count(*) into v_n from public.commission_payments where commission_id = v_comm_a and reverted_at is null;
  if v_n <> 0 then raise exception 'FALHA T9k: pagamento revertido continua ativo'; end if;

  ---------------------------------------------------------------- T10: serviço não é hardcoded + snapshot
  update public.services set price = 100, commission_percent = 50 where id = v_svc;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.sales (establishment_id, service_id, commission_type, amount)
  values (v_est_a, v_svc, 'percent', 1) returning id, amount into v_sale_a2, v_amount;
  if v_amount <> 100 then raise exception 'FALHA T10a: nova venda deveria usar o novo preço (100), veio %', v_amount; end if;
  select amount into v_amount from public.commissions where sale_id = v_sale_a2;
  if v_amount <> 50 then raise exception 'FALHA T10b: comissão da nova venda deveria ser 50, veio %', v_amount; end if;

  -- venda antiga mantém snapshot (80 / 30% / 24)
  select amount, commission_percent into v_amount, v_pct from public.sales where id = v_sale_a;
  if v_amount <> 80 or v_pct <> 30 then raise exception 'FALHA T10c: snapshot da venda antiga mudou (% / %)', v_amount, v_pct; end if;
  select amount into v_amount from public.commissions where sale_id = v_sale_a;
  if v_amount <> 24 then raise exception 'FALHA T10d: comissão antiga mudou para %', v_amount; end if;

  ---------------------------------------------------------------- T11: serviço desativado
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.services set active = false where id = v_svc;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.services where id = v_svc;
  if v_n <> 0 then raise exception 'FALHA T11a: parceiro vê serviço desativado'; end if;
  v_ok := false;
  begin insert into public.sales (establishment_id, service_id, commission_type, amount) values (v_est_a, v_svc, 'percent', 80); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T11b: vendeu serviço desativado'; end if;

  ---------------------------------------------------------------- T12: CRM Kanban (leads)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- T12a: partner_id forjado é ignorado; estágio inicial padrão
  insert into public.leads (partner_id, name, stage) values (v_b, 'Lead do A', 'new')
  returning id, partner_id, stage into v_lead_a, v_pid, v_stage;
  if v_pid <> v_a then raise exception 'FALHA T12a: partner_id forjado aceito no lead'; end if;

  -- T12b: mover no funil funciona e atualiza stage_changed_at
  update public.leads set stage = 'negotiation', opportunity_value = 80 where id = v_lead_a;
  select stage into v_stage from public.leads where id = v_lead_a;
  if v_stage <> 'negotiation' then raise exception 'FALHA T12b: não moveu o lead'; end if;

  -- T12c: estágio inválido é recusado
  v_ok := false; begin update public.leads set stage = 'hack' where id = v_lead_a; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T12c: estágio inválido aceito'; end if;

  -- T12d: não troca o dono do lead
  v_ok := false; begin update public.leads set partner_id = v_b where id = v_lead_a; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T12d: parceiro trocou o dono do lead'; end if;

  -- T12e: A vincula a própria venda ao lead; B (abaixo) não poderá vincular a venda de A
  update public.leads set sale_id = v_sale_a, stage = 'won' where id = v_lead_a;
  select count(*) into v_n from public.leads where id = v_lead_a and sale_id = v_sale_a;
  if v_n <> 1 then raise exception 'FALHA T12e: A não vinculou a própria venda'; end if;

  -- T12f: A não lê pedidos de cadastro
  select count(*) into v_n from public.partner_requests;
  if v_n <> 0 then raise exception 'FALHA T12f: parceiro enxerga partner_requests'; end if;

  -- B: nada de A, e não consegue mexer
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.leads where id = v_lead_a;
  if v_n <> 0 then raise exception 'FALHA T12g: B enxerga lead de A'; end if;
  v_n := 0; begin update public.leads set name = 'hack' where id = v_lead_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T12h: B alterou lead de A'; end if;
  v_n := 0; begin delete from public.leads where id = v_lead_a; get diagnostics v_n = row_count; exception when others then v_n := 0; end;
  if v_n <> 0 then raise exception 'FALHA T12i: B apagou lead de A'; end if;

  v_ok := false; begin insert into public.leads (name, sale_id) values ('Lead do B', v_sale_a); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T12j: B vinculou lead à venda de A'; end if;

  insert into public.leads (name) values ('Lead do B') returning id into v_lead_b;

  -- Admin vê os dois
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.leads where id in (v_lead_a, v_lead_b);
  if v_n <> 2 then raise exception 'FALHA T12k: admin vê % dos 2 leads', v_n; end if;

  -- Anônimo não acessa
  reset role;
  set local role anon;
  v_ok := false; begin select count(*) into v_n from public.leads; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T12l: anônimo leu leads'; end if;
  v_ok := false; begin select count(*) into v_n from public.partner_requests; v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T12m: anônimo leu partner_requests'; end if;
  v_ok := false; begin insert into public.partner_requests (full_name, email, phone) values ('Teste', 'x@x.com', '14999990000'); v_ok := true; exception when others then null; end;
  if v_ok then raise exception 'FALHA T12n: anônimo inseriu partner_requests direto'; end if;

  reset role;
end
$test$;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
