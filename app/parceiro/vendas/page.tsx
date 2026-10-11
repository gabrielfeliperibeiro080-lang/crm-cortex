import Link from 'next/link';
import { cancelSale } from '../actions';
import { Empty, FilterBar, Flash, MonthSelect, PageHeader, Panel, SaleBadge, SelectFilter, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, dateBR, paymentLabel, SALE_STATUS, SALE_STATUS_OPTIONS } from '@/lib/format';
import { getPeriod, monthOptions } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';
import { one, type One } from '@/lib/types';

export const metadata = { title: 'Minhas vendas' };

type Row = {
  id: string;
  amount: number;
  status: string;
  sold_at: string;
  payment_method: string | null;
  establishment: One<{ name: string; city: string | null; state: string | null }>;
  service: One<{ name: string }>;
  commissions: One<{ amount: number; status: string }>;
};

export default async function PartnerSales({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string; ok?: string; erro?: string }> }) {
  const profile = await requireProfile('partner');
  const sp = await searchParams;
  const mes = sp.mes ?? 'todos';
  const supabase = await createClient();

  let q = supabase
    .from('sales')
    .select('id, amount, status, sold_at, payment_method, establishment:establishments(name, city, state), service:services(name), commissions(amount, status)')
    .eq('partner_id', profile.id)
    .order('sold_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (mes !== 'todos') {
    const p = getPeriod(mes);
    q = q.gte('sold_at', p.start).lt('sold_at', p.end);
  }
  if (sp.status && SALE_STATUS[sp.status]) q = q.eq('status', sp.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const valid = rows.filter((r) => r.status !== 'cancelled');
  const total = valid.reduce((s, r) => s + Number(r.amount), 0);
  const qs = new URLSearchParams({ ...(sp.mes ? { mes: sp.mes } : {}), ...(sp.status ? { status: sp.status } : {}) }).toString();
  const back = `/parceiro/vendas${qs ? `?${qs}` : ''}`;

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Minhas vendas"
        description="Histórico das suas vendas."
        actions={<Link className="btn" href="/parceiro/vendas/nova">Nova venda</Link>}
      />
      <Flash ok={sp.ok} erro={sp.erro} />
      <FilterBar>
        <MonthSelect value={mes} options={monthOptions(12)} allowAll />
        <SelectFilter name="status" label="Status" value={sp.status} options={SALE_STATUS_OPTIONS} />
      </FilterBar>
      <Stats items={[
        { label: 'Vendas (sem canceladas)', value: String(valid.length) },
        { label: 'Valor das vendas', value: brl(total) },
        { label: 'Registros exibidos', value: String(rows.length) },
        { label: 'Aguardando pagamento', value: String(rows.filter((r) => r.status === 'pending_payment').length) },
      ]} />
      <Panel flush>
        {rows.length === 0 ? (
          <Empty>Nenhuma venda encontrada para os filtros escolhidos.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Data</th><th>Estabelecimento</th><th>Produto</th><th>Pagamento</th><th className="num">Valor</th><th className="num">Minha comissão</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const est = one(r.establishment);
                  const c = one(r.commissions);
                  return (
                    <tr key={r.id}>
                      <td>{dateBR(r.sold_at)}</td>
                      <td><span className="strong">{est?.name ?? '—'}</span><small>{[est?.city, est?.state].filter(Boolean).join(' - ')}</small></td>
                      <td>{one(r.service)?.name ?? '—'}</td>
                      <td>{paymentLabel(r.payment_method)}</td>
                      <td className="num">{brl(r.amount)}</td>
                      <td className="num">{r.status === 'cancelled' ? '—' : brl(c?.amount)}</td>
                      <td><SaleBadge status={r.status} /></td>
                      <td>
                        {r.status === 'pending_payment' && (
                          <div className="row-actions">
                            <form action={cancelSale}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="back" value={back} />
                              <button className="btn btn-danger btn-sm" type="submit">Cancelar</button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
