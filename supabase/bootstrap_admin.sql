-- =====================================================================
-- CÓRTEX PARTNERS · CRIAR O PRIMEIRO SUPER ADMIN
--
-- 1. No painel do Supabase: Authentication > Users > Add user
--    (informe e-mail e senha e marque "Auto Confirm User").
-- 2. Troque o e-mail e o nome abaixo e rode no SQL Editor.
--
-- Os demais parceiros serão criados pela tela de Parceiros do sistema
-- (somente o Super Admin consegue). Não existe cadastro público.
-- =====================================================================
insert into public.profiles (id, full_name, email, role, active)
select id, 'SEU NOME AQUI', email, 'super_admin', true
from auth.users
where email = 'seu-email@exemplo.com'
on conflict (id) do update set role = 'super_admin', active = true;

-- Conferência: deve retornar 1 linha com role = super_admin
select id, full_name, email, role, active from public.profiles where role = 'super_admin';
