import { CommissionBadge, Empty, FilterBar, PageHeader, Panel, SelectFilter, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, COMMISSION_STATUS, COMMISSION_STATUS_OPTIONS, commissionRule, dateBR, dateTimeBR } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { one, type One } from '@/lib/types';

export const metadata = { title: 'Comissões' };

type Row = {
  id: string;
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

export default async function PartnerCommissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await requireProfile('partner');
  const sp = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('commissions')
    .select('id, amount, status, paid_at, sale:sales(amount, sold_at, commission_type, commission_percent, commission_fixed, establishment:establishments(name), service:services(name))')
    .eq('partner_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const all = (data ?? []) as unknown as Row[];
  const sum = (st: string) => all.filter((c) => c.status === st).reduce((s, c) => s + Number(c.amount), 0);
  const rows = sp.status && COMMISSION_STATUS[sp.status] ? all.filter((c) => c.status === sp.status) : all;

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Minhas comissões" description="Somente as suas comissões." />
      <Stats
        lead
        items={[
          { label: 'Pendentes (a receber)', value: brl(sum('pending')), hint: 'Venda paga, repasse aguardando', tone: 'warn' },
          { label: 'Pagas', value: brl(sum('paid')), tone: 'good', hint: 'Já repassadas a você' },
          { label: 'Previstas', value: brl(sum('expected')), hint: 'Vendas aguardando pagamento' },
          { label: 'Canceladas', value: brl(sum('cancelled')), hint: 'Não contam nos totais' },
        ]}
      />
      <FilterBar>
        <SelectFilter name="status" label="Status da comissão" value={sp.status} options={COMMISSION_STATUS_OPTIONS} />
      </FilterBar>
      <Panel flush>
        {rows.length === 0 ? (
          <Empty>Nenhuma comissão encontrada.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data da venda</th><th>Estabelecimento</th><th>Produto</th><th className="num">Valor da venda</th><th className="num">Regra</th><th className="num">Comissão</th><th>Status</th><th>Pago em</th></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const s = one(c.sale);
                  return (
                    <tr key={c.id}>
                      <td>{dateBR(s?.sold_at)}</td>
                      <td><span className="strong">{one(s?.establishment)?.name ?? '—'}</span></td>
                      <td>{one(s?.service)?.name ?? '—'}</td>
                      <td className="num">{brl(s?.amount)}</td>
                      <td className="num">{s ? commissionRule(s.commission_type, s.commission_percent, s.commission_fixed) : '—'}</td>
                      <td className="num"><span className="strong">{brl(c.amount)}</span></td>
                      <td><CommissionBadge status={c.status} /></td>
                      <td>{dateTimeBR(c.paid_at)}</td>
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
