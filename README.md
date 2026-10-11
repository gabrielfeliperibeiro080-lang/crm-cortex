# Córtex Partners

CRM de gestão de parceiros da Córtex Studios. Next.js 16 (App Router) + Supabase (Auth + Postgres com RLS) + Vercel.

## Como funciona

- **Super Admin**: vê toda a operação, confirma pagamentos de vendas, paga comissões, cadastra parceiros, serviços e custos.
- **Parceiro**: registra vendas e vê **somente** os próprios dados (garantido por RLS no banco, não só na interface).
- Não há cadastro automático nem código de indicação. Todo parceiro passa por aprovação do Super Admin (ele cria o parceiro ou aprova um pedido).

### Módulos

- **CRM · Funil (Kanban)**: cada parceiro gerencia os próprios leads em colunas (Novo lead → Contato → Qualificado → Reunião → Proposta → Negociação → Fechado, mais Perdido), com arrastar e soltar, follow-ups (hoje/atrasados), valor da oportunidade e WhatsApp com um clique. Ao fechar, o botão **Registrar venda** abre a Nova venda já preenchida e vincula a venda ao lead. O Super Admin vê o funil de todos (com filtro por parceiro).
- **Quero ser parceiro**: o login tem um botão que leva a `/cadastro`. O pedido **não cria acesso**: vai para *Parceiros → Solicitações de cadastro*, onde só o Super Admin aprova (definindo uma senha provisória) ou recusa.

### Regras de negócio (todas aplicadas no banco)

| Regra | Comportamento |
|---|---|
| Parceiro, valor, comissão e status inicial | Definidos por triggers. O parceiro nunca os informa. |
| Status da venda | Aguardando pagamento → Pago → (Cancelado). Só o Super Admin confirma pagamento. |
| Parceiro pode | Cancelar vendas ainda **aguardando pagamento**. |
| Comissão | Prevista (venda aguardando) → Pendente (venda paga) → Paga. Cancelada sai de todos os totais. |
| Comissão paga | Não dá para cancelar/alterar a venda sem antes reverter o pagamento da comissão. |
| Serviços | Preço e comissão (percentual ou fixa) cadastráveis. Cada venda guarda a regra vigente na época. |
| Faturamento bruto | Soma das vendas **pagas**. |
| Receita líquida | Faturamento bruto − comissões válidas. |
| Lucro estimado | Receita líquida − custos cadastrados. |
| Projeção | Realizado ÷ dias decorridos × dias do mês. |

Gestão Pro (R$ 80, 30% = R$ 24; Córtex fica com R$ 56) vem cadastrado como serviço inicial.

## Instalação

### 1. Supabase
1. Crie um projeto em supabase.com.
2. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**.
3. **SQL Editor**: rode `supabase/schema.sql`. (Se já rodou a versão antiga, rode antes `supabase/reset_v1.sql`, que apaga as tabelas antigas.)
4. Rode `supabase/tests/rls.sql`. Deve terminar com `TODOS OS TESTES PASSARAM`. Ele roda em transação com ROLLBACK e não grava dados.
5. **Authentication → Users → Add user** (e-mail + senha, marque *Auto Confirm User*).
6. Edite o e-mail/nome em `supabase/bootstrap_admin.sql` e rode para transformar esse usuário em Super Admin.

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha (Project Settings → API):

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL (sem `/rest/v1/`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — chave anon/publishable
- `SUPABASE_SERVICE_ROLE_KEY` — chave service_role (**segredo total**, só servidor; usada para criar parceiros e redefinir senhas)

### 3. Rodar localmente
```bash
npm install
npm run typecheck
npm run build
npm run dev
```
Acesse http://localhost:3000 e entre com o usuário admin.

## Deploy na Vercel
1. Suba o projeto para o GitHub (o `.gitignore` já exclui `.env.local`).
2. Na Vercel: **Add New → Project** e importe o repositório (framework: Next.js, sem configuração extra).
3. **Settings → Environment Variables**: cadastre as 3 variáveis acima em Production (e Preview, se quiser).
4. Faça o deploy. Depois, no Supabase em **Authentication → URL Configuration**, coloque a URL da Vercel em *Site URL*.
5. Se o login funcionar mas "Criar parceiro" falhar, confira `SUPABASE_SERVICE_ROLE_KEY` na Vercel e faça redeploy.

## Segurança
- RLS ativo em todas as tabelas (inclusive `leads` e `partner_requests`); `anon` sem acesso a nada.
- Comissões e pagamentos só são escritos por triggers e funções restritas ao Super Admin.
- Parceiro inativo perde o acesso (no banco e no login).
- `service_role` fica apenas no servidor: na aprovação de parceiros (após checar o Super Admin) e na gravação do pedido de cadastro público (que só insere uma solicitação, sem criar login).
- Cabeçalhos de segurança configurados em `next.config.ts`.
- **Nunca** coloque a `service_role` no código, em chat ou no GitHub. Se ela vazar, gere uma nova no Supabase.

## Estrutura
```
app/            rotas (login, /admin/*, /parceiro/*) e server actions
components/     shell, UI, gráfico
lib/            clientes Supabase, auth, finanças, formatação
supabase/       schema.sql, reset_v1.sql, bootstrap_admin.sql, tests/rls.sql
proxy.ts        renovação de sessão e proteção de rotas (Next 16)
```
