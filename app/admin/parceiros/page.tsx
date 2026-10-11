import { approveRequest, createPartner, rejectRequest, resetPartnerPassword, setPartnerActive } from '../actions';
import { Badge, Empty, Flash, PageHeader, Panel } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, dateTimeBR } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Parceiros' };

export default async function AdminPartners({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: partners, error }, { data: commissions }, { data: sales }, { data: requests }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, active, created_at').eq('role', 'partner').order('created_at', { ascending: false }),
    supabase.from('commissions').select('partner_id, amount, status'),
    supabase.from('sales').select('partner_id, status'),
    supabase.from('partner_requests').select('id, full_name, email, phone, city, state, message, created_at').eq('status', 'pending').order('created_at'),
  ]);
  if (error) throw new Error(error.message);

  const agg = new Map<string, { sales: number; pending: number; paid: number }>();
  for (const s of sales ?? []) {
    if (s.status === 'cancelled') continue;
    const a = agg.get(s.partner_id) ?? { sales: 0, pending: 0, paid: 0 };
    a.sales++; agg.set(s.partner_id, a);
  }
  for (const c of commissions ?? []) {
    const a = agg.get(c.partner_id) ?? { sales: 0, pending: 0, paid: 0 };
    if (c.status === 'pending') a.pending += Number(c.amount);
    if (c.status === 'paid') a.paid += Number(c.amount);
    agg.set(c.partner_id, a);
  }
  const rows = partners ?? [];

  return (
    <>
      <PageHeader eyebrow="Equipe comercial" title="Parceiros" description="Não há cadastro público: só você cria parceiros." />
      <Flash ok={sp.ok} erro={sp.erro} />

      {(requests ?? []).length > 0 && (
        <Panel title={`Solicitações de cadastro (${requests!.length})`} subtitle="Defina uma senha provisória para aprovar e criar o acesso." flush>
          <div className="table-wrap"><table>
            <thead><tr><th>Quem pediu</th><th>Contato</th><th>Cidade</th><th>Mensagem</th><th>Pedido em</th><th className="num">Ação</th></tr></thead>
            <tbody>{requests!.map((r) => (
              <tr key={r.id}>
                <td><span className="strong">{r.full_name}</span></td>
                <td>{r.email}<small>{r.phone}</small></td>
                <td>{[r.city, r.state].filter(Boolean).join(' - ') || '—'}</td>
                <td style={{ maxWidth: 260 }}>{r.message ?? '—'}</td>
                <td>{dateTimeBR(r.created_at)}</td>
                <td><div className="row-actions">
                  <form action={approveRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="text" name="password" placeholder="Senha provisória" minLength={8} maxLength={72} autoComplete="off" required />
                    <button className="btn btn-good btn-sm" type="submit">Aprovar</button>
                  </form>
                  <form action={rejectRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn btn-danger btn-sm" type="submit">Recusar</button>
                  </form>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Panel>
      )}

      <Panel title="Novo parceiro" subtitle="Cria o login com uma senha provisória (repasse ao parceiro por canal seguro).">
        <form action={createPartner}>
          <div className="form-grid">
            <label className="field"><span>Nome completo</span><input name="full_name" required maxLength={120} /></label>
            <label className="field"><span>E-mail (login)</span><input name="email" type="email" required /></label>
            <label className="field"><span>Telefone / WhatsApp</span><input name="phone" type="tel" /></label>
            <label className="field"><span>Senha provisória</span><input name="password" type="text" minLength={8} maxLength={72} autoComplete="off" required /><small>Mínimo 8 caracteres.</small></label>
          </div>
          <div className="form-actions"><button className="btn" type="submit">Criar parceiro</button></div>
        </form>
      </Panel>

      <Panel title="Parceiros cadastrados" flush>
        {rows.length === 0 ? <Empty>Nenhum parceiro cadastrado.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Parceiro</th><th>Contato</th><th className="num">Vendas</th><th className="num">Pendente</th><th className="num">Pago</th><th>Status</th><th className="num">Ações</th></tr></thead>
            <tbody>{rows.map((p) => {
              const a = agg.get(p.id) ?? { sales: 0, pending: 0, paid: 0 };
              return (
                <tr key={p.id}>
                  <td><span className="strong">{p.full_name}</span><small>desde {dateTimeBR(p.created_at)}</small></td>
                  <td>{p.email ?? '—'}<small>{p.phone}</small></td>
                  <td className="num">{a.sales}</td>
                  <td className="num">{brl(a.pending)}</td>
                  <td className="num">{brl(a.paid)}</td>
                  <td><Badge tone={p.active ? 'good' : 'bad'}>{p.active ? 'Ativo' : 'Desativado'}</Badge></td>
                  <td><div className="row-actions">
                    <form action={resetPartnerPassword}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="text" name="password" placeholder="Nova senha" minLength={8} maxLength={72} autoComplete="off" required />
                      <button className="btn btn-ghost btn-sm" type="submit">Redefinir senha</button>
                    </form>
                    <form action={setPartnerActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <button className={`btn btn-sm ${p.active ? 'btn-danger' : 'btn-good'}`} type="submit">{p.active ? 'Desativar' : 'Reativar'}</button>
                    </form>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
