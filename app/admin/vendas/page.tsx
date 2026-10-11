import { setSaleStatus } from '../actions';
import { Empty, FilterBar, Flash, MonthSelect, PageHeader, Panel, SaleBadge, SelectFilter, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, dateBR, paymentLabel, PAYMENT_METHODS, SALE_STATUS, SALE_STATUS_OPTIONS } from '@/lib/format';
import { getPeriod, monthOptions } from '@/lib/period';
import { partnerNames } from '@/lib/partners';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/format';
import { one, type One } from '@/lib/types';

export const metadata = { title: 'Vendas' };

type Row = {
  id: string;
  partner_id: string;
  amount: number;
  status: string;
  sold_at: string;
  payment_method: string | null;
  notes: string | null;
  establishment: One<{ name: string; city: string | null; state: string | null }>;
  service: One<{ name: string }>;
  commissions: One<{ amount: number; status: string }>;
};

export default async function AdminSales({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string; parceiro?: string; ok?: string; erro?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const mes = sp.mes ?? 'todos';
  const supabase = await createClient();
  const names = await partnerNames(supabase);

  let q = supabase
    .from('sales')
    .select('id, partner_id, amount, status, sold_at, payment_method, notes, establishment:establishments(name, city, state), service:services(name), commissions(amount, status)')
    .order('sold_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (mes !== 'todos') {
    const p = getPeriod(mes);
    q = q.gte('sold_at', p.start).lt('sold_at', p.end);
  }
  if (sp.status && SALE_STATUS[sp.status]) q = q.eq('status', sp.status);
  if (sp.parceiro && isUuid(sp.parceiro)) q = q.eq('partner_id', sp.parceiro);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const paid = rows.filter((r) => r.status === 'paid');
  const gross = paid.reduce((s, r) => s + Number(r.amount), 0);
  const waiting = rows.filter((r) => r.status === 'pending_payment');
  const qs = new URLSearchParams(Object.entries({ mes: sp.mes, status: sp.status, parceiro: sp.parceiro }).filter(([, v]) => v) as [string, string][]).toString();
  const back = `/admin/vendas${qs ? `?${qs}` : ''}`;

  return (
    <>
      <PageHeader eyebrow="Operação" title="Vendas" description="Confirme pagamentos e acompanhe todas as vendas." />
      <Flash ok={sp.ok} erro={sp.erro} />
      <FilterBar>
        <MonthSelect value={mes} options={monthOptions(12)} allowAll />
        <SelectFilter name="status" label="Status" value={sp.status} options={SALE_STATUS_OPTIONS} />
        <SelectFilter name="parceiro" label="Parceiro" value={sp.parceiro} options={[...names.entries()].map(([value, label]) => ({ value, label }))} />
      </FilterBar>
      <Stats items={[
        { label: 'Vendas exibidas', value: String(rows.length) },
        { label: 'Pagas', value: String(paid.length), hint: brl(gross), tone: 'good' },
        { label: 'Aguardando pagamento', value: String(waiting.length), hint: brl(waiting.reduce((s, r) => s + Number(r.amount), 0)), tone: waiting.length ? 'warn' : undefined },
        { label: 'Canceladas', value: String(rows.filter((r) => r.status === 'cancelled').length) },
      ]} />
      <Panel flush>
        {rows.length === 0 ? <Empty>Nenhuma venda encontrada.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Data</th><th>Estabelecimento</th><th>Parceiro</th><th>Serviço</th><th className="num">Valor</th><th className="num">Comissão</th><th>Status</th><th className="num">Ação</th></tr></thead>
            <tbody>{rows.map((r) => {
              const est = one(r.establishment);
              return (
                <tr key={r.id}>
                  <td>{dateBR(r.sold_at)}<small>{paymentLabel(r.payment_method)}</small></td>
                  <td><span className="strong">{est?.name}</span><small>{[est?.city, est?.state].filter(Boolean).join(' - ')}</small></td>
                  <td>{names.get(r.partner_id) ?? '—'}</td>
                  <td>{one(r.service)?.name}</td>
                  <td className="num">{brl(r.amount)}</td>
                  <td className="num">{r.status === 'cancelled' ? '—' : brl(one(r.commissions)?.amount)}</td>
                  <td><SaleBadge status={r.status} /></td>
                  <td>
                    <div className="row-actions">
                      <form action={setSaleStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={back} />
                        {r.status === 'pending_payment' && (
                          <select name="payment_method" defaultValue={r.payment_method ?? 'pix'} aria-label="Forma de pagamento">
                            {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        )}
                        {r.status === 'pending_payment' && <button className="btn btn-good btn-sm" name="status" value="paid" type="submit">Confirmar pagamento</button>}
                        {r.status === 'pending_payment' && <button className="btn btn-danger btn-sm" name="status" value="cancelled" type="submit">Cancelar</button>}
                        {r.status === 'paid' && <button className="btn btn-ghost btn-sm" name="status" value="pending_payment" type="submit">Voltar p/ aguardando</button>}
                        {r.status === 'cancelled' && <button className="btn btn-ghost btn-sm" name="status" value="pending_payment" type="submit">Reabrir</button>}
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
