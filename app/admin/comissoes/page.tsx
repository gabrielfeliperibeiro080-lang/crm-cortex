import { payCommission, revertCommission } from '../actions';
import { CommissionBadge, Empty, FilterBar, Flash, MonthSelect, PageHeader, Panel, SelectFilter, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, COMMISSION_STATUS, COMMISSION_STATUS_OPTIONS, commissionRule, dateBR, dateTimeBR, isUuid } from '@/lib/format';
import { partnerNames } from '@/lib/partners';
import { getPeriod, monthOptions, todaySP } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';
import { one, type One } from '@/lib/types';

export const metadata = { title: 'Comissões' };

type Row = {
  id: string;
  partner_id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  sale: One<{
    amount: number;
    sold_at: string;
    commission_type: string;
    commission_percent: number;
    commission_fixed: number;
    establishment: One<{ name: string }>;
    service: One<{ name: string }>;
  }>;
};

export default async function AdminCommissions({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string; parceiro?: string; ok?: string; erro?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const mes = sp.mes ?? 'todos';
  const supabase = await createClient();
  const names = await partnerNames(supabase);

  const { data, error } = await supabase
    .from('commissions')
    .select('id, partner_id, amount, status, paid_at, sale:sales!inner(amount, sold_at, commission_type, commission_percent, commission_fixed, establishment:establishments(name), service:services(name))')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  let all = (data ?? []) as unknown as Row[];
  if (mes !== 'todos') {
    const p = getPeriod(mes);
    all = all.filter((c) => {
      const d = one(c.sale)?.sold_at ?? '';
      return d >= p.start && d < p.end;
    });
  }
  if (sp.parceiro && isUuid(sp.parceiro)) all = all.filter((c) => c.partner_id === sp.parceiro);
  const rows = sp.status && COMMISSION_STATUS[sp.status] ? all.filter((c) => c.status === sp.status) : all;
  const sum = (st: string) => all.filter((c) => c.status === st).reduce((s, c) => s + Number(c.amount), 0);

  const qs = new URLSearchParams(Object.entries({ mes: sp.mes, status: sp.status, parceiro: sp.parceiro }).filter(([, v]) => v) as [string, string][]).toString();
  const back = `/admin/comissoes${qs ? `?${qs}` : ''}`;
  const today = todaySP();

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Comissões" description="Marque como paga quando repassar ao parceiro. Só você confirma pagamentos." />
      <Flash ok={sp.ok} erro={sp.erro} />
      <Stats lead items={[
        { label: 'Pendentes (a pagar)', value: brl(sum('pending')), tone: 'warn', hint: 'Vendas já pagas' },
        { label: 'Pagas', value: brl(sum('paid')), tone: 'good' },
        { label: 'Previstas', value: brl(sum('expected')), hint: 'Vendas aguardando pagamento' },
        { label: 'Canceladas', value: brl(sum('cancelled')), hint: 'Fora dos totais' },
      ]} />
      <FilterBar>
        <MonthSelect value={mes} options={monthOptions(12)} allowAll />
        <SelectFilter name="status" label="Status" value={sp.status} options={COMMISSION_STATUS_OPTIONS} />
        <SelectFilter name="parceiro" label="Parceiro" value={sp.parceiro} options={[...names.entries()].map(([value, label]) => ({ value, label }))} />
      </FilterBar>
      <Panel flush>
        {rows.length === 0 ? <Empty>Nenhuma comissão encontrada.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Data</th><th>Parceiro</th><th>Estabelecimento</th><th>Produto</th><th className="num">Venda</th><th className="num">Regra</th><th className="num">Comissão</th><th>Status</th><th className="num">Ação</th></tr></thead>
            <tbody>{rows.map((c) => {
              const s = one(c.sale);
              return (
                <tr key={c.id}>
                  <td>{dateBR(s?.sold_at)}</td>
                  <td><span className="strong">{names.get(c.partner_id) ?? '—'}</span></td>
                  <td>{one(s?.establishment)?.name ?? '—'}</td>
                  <td>{one(s?.service)?.name ?? '—'}</td>
                  <td className="num">{brl(s?.amount)}</td>
                  <td className="num">{s ? commissionRule(s.commission_type, s.commission_percent, s.commission_fixed) : '—'}</td>
                  <td className="num"><span className="strong">{brl(c.amount)}</span></td>
                  <td><CommissionBadge status={c.status} />{c.paid_at && <small>{dateTimeBR(c.paid_at)}</small>}</td>
                  <td>
                    <div className="row-actions">
                      {c.status === 'pending' && (
                        <form action={payCommission}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="back" value={back} />
                          <input type="date" name="paid_at" defaultValue={today} max={today} aria-label="Data do pagamento" />
                          <button className="btn btn-good btn-sm" type="submit">Marcar paga</button>
                        </form>
                      )}
                      {c.status === 'paid' && (
                        <form action={revertCommission}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="back" value={back} />
                          <button className="btn btn-ghost btn-sm" type="submit">Voltar p/ pendente</button>
                        </form>
                      )}
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
