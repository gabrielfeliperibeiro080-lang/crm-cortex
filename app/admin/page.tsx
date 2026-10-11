import Link from 'next/link';
import { RevenueChart } from '@/components/revenue-chart';
import { Empty, FilterBar, MonthSelect, PageHeader, Panel, SaleBadge, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { costsInPeriod, dailyRevenue, projection, summarize, type CostRow } from '@/lib/finance';
import { brl, dateBR } from '@/lib/format';
import { getPeriod, monthOptions } from '@/lib/period';
import { partnerNames } from '@/lib/partners';
import { createClient } from '@/lib/supabase/server';
import { one, type One, type SaleLite } from '@/lib/types';

export const metadata = { title: 'Dashboard' };

type Row = SaleLite & {
  service: One<{ name: string }>;
  establishment: One<{ name: string; city: string | null; state: string | null }>;
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const period = getPeriod(sp.mes);
  const supabase = await createClient();

  const [names, salesRes, costsRes, partnersRes] = await Promise.all([
    partnerNames(supabase),
    supabase
      .from('sales')
      .select('id, partner_id, service_id, amount, status, sold_at, service:services(name), establishment:establishments(name, city, state), commissions(amount, status)')
      .gte('sold_at', period.start)
      .lt('sold_at', period.end)
      .order('sold_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('costs').select('amount, cost_date, recurrence, ends_on'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'partner').eq('active', true),
  ]);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (costsRes.error) throw new Error(costsRes.error.message);

  const rows = (salesRes.data ?? []) as unknown as Row[];
  const s = summarize(rows);
  const costs = costsInPeriod((costsRes.data ?? []) as CostRow[], period);
  const profit = Math.round((s.net - costs) * 100) / 100;
  const pGross = projection(s.gross, period.elapsed, period.daysInMonth);
  const pComm = projection(s.commissionsTotal, period.elapsed, period.daysInMonth);
  const pNet = Math.round((pGross.projected - pComm.projected) * 100) / 100;

  const byPartner = new Map<string, { name: string; count: number; gross: number; comm: number }>();
  const byService = new Map<string, { name: string; count: number; gross: number }>();
  for (const r of rows) {
    if (r.status !== 'paid') continue;
    const pn = names.get(r.partner_id) ?? '—';
    const p = byPartner.get(r.partner_id) ?? { name: pn, count: 0, gross: 0, comm: 0 };
    p.count++; p.gross += Number(r.amount); p.comm += Number(one(r.commissions)?.amount ?? 0);
    byPartner.set(r.partner_id, p);
    const sn = one(r.service)?.name ?? '—';
    const sv = byService.get(r.service_id) ?? { name: sn, count: 0, gross: 0 };
    sv.count++; sv.gross += Number(r.amount);
    byService.set(r.service_id, sv);
  }
  const partnerRank = [...byPartner.values()].sort((a, b) => b.gross - a.gross);
  const serviceRank = [...byService.values()].sort((a, b) => b.gross - a.gross);

  return (
    <>
      <PageHeader eyebrow="Visão executiva" title="Dashboard geral" description={`Operação comercial da Córtex · ${period.label}`} />
      <FilterBar><MonthSelect value={period.key} options={monthOptions(12)} /></FilterBar>

      <Stats lead items={[
        { label: 'Faturamento bruto', value: brl(s.gross), hint: `${s.paidCount} venda(s) paga(s)` },
        { label: 'Comissões', value: brl(s.commissionsTotal), hint: `Pendentes ${brl(s.commissionsPending)} · pagas ${brl(s.commissionsPaid)}`, tone: s.commissionsPending > 0 ? 'warn' : undefined },
        { label: 'Receita líquida', value: brl(s.net), hint: 'Bruto − comissões' },
        { label: 'Lucro estimado', value: brl(profit), hint: costs > 0 ? `Custos do período: ${brl(costs)}` : 'Sem custos cadastrados no período', tone: profit < 0 ? 'bad' : undefined },
      ]} />
      <Stats items={[
        { label: 'Parceiros ativos', value: String(partnersRes.count ?? 0) },
        { label: 'Vendas no mês', value: String(s.validCount), hint: 'Sem canceladas' },
        { label: 'Ticket médio', value: brl(s.ticket), hint: 'Vendas pagas' },
        { label: 'A receber', value: brl(s.receivable), hint: `Comissões previstas ${brl(s.commissionsExpected)}` },
      ]} />

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Panel title="Faturamento por dia" subtitle="Vendas pagas"><RevenueChart data={dailyRevenue(rows, period)} /></Panel>
        <Panel title="Projeção mensal" subtitle={period.isCurrent ? `Ritmo atual: ${period.elapsed} de ${period.daysInMonth} dias` : 'Mês encerrado: projeção = realizado'}>
          <div className="kv"><span>Faturamento realizado</span><b>{brl(s.gross)}</b></div>
          <div className="kv"><span>Média diária</span><b>{brl(pGross.dailyAvg)}</b></div>
          <div className="kv total"><span>Projeção de faturamento</span><b>{brl(pGross.projected)}</b></div>
          <div className="kv"><span>Projeção de comissão</span><b>{brl(pComm.projected)}</b></div>
          <div className="kv"><span>Projeção de receita líquida</span><b>{brl(pNet)}</b></div>
        </Panel>
      </div>

      <div className="grid-eq">
        <Panel title="Vendas por parceiro" subtitle="Somente vendas pagas" flush>
          {partnerRank.length === 0 ? <Empty>Sem vendas pagas no período.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Parceiro</th><th className="num">Vendas</th><th className="num">Valor</th><th className="num">Comissão</th></tr></thead>
              <tbody>{partnerRank.map((p) => <tr key={p.name}><td><span className="strong">{p.name}</span></td><td className="num">{p.count}</td><td className="num">{brl(p.gross)}</td><td className="num">{brl(p.comm)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Vendas por serviço" subtitle="Somente vendas pagas" flush>
          {serviceRank.length === 0 ? <Empty>Sem vendas pagas no período.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Serviço</th><th className="num">Vendas</th><th className="num">Valor</th></tr></thead>
              <tbody>{serviceRank.map((p) => <tr key={p.name}><td><span className="strong">{p.name}</span></td><td className="num">{p.count}</td><td className="num">{brl(p.gross)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Panel>
      </div>

      <Panel title="Vendas recentes" action={<Link className="btn btn-ghost btn-sm" href="/admin/vendas">Ver todas</Link>} flush>
        {rows.length === 0 ? <Empty>Nenhuma venda neste período.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Data</th><th>Estabelecimento</th><th>Parceiro</th><th>Serviço</th><th className="num">Valor</th><th className="num">Comissão</th><th>Status</th></tr></thead>
            <tbody>{rows.slice(0, 8).map((r) => {
              const est = one(r.establishment);
              return (
                <tr key={r.id}>
                  <td>{dateBR(r.sold_at)}</td>
                  <td><span className="strong">{est?.name}</span><small>{[est?.city, est?.state].filter(Boolean).join(' - ')}</small></td>
                  <td>{names.get(r.partner_id) ?? '—'}</td><td>{one(r.service)?.name}</td>
                  <td className="num">{brl(r.amount)}</td>
                  <td className="num">{r.status === 'cancelled' ? '—' : brl(one(r.commissions)?.amount)}</td>
                  <td><SaleBadge status={r.status} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
