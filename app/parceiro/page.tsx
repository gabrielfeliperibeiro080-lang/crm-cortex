import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PixKeyForm, RegionForm } from '@/components/partner-settings';
import { RevenueChart } from '@/components/revenue-chart';
import { Empty, PageHeader, Panel, SaleBadge, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { dailyRevenue, projection, summarize } from '@/lib/finance';
import { brl, dateBR } from '@/lib/format';
import { getPeriod } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';
import { one, type One, type SaleLite } from '@/lib/types';

export const metadata = { title: 'Meu desempenho' };

type Row = SaleLite & {
  establishment: One<{ name: string; city: string | null; state: string | null }>;
  service: One<{ name: string }>;
};

export default async function PartnerDashboard() {
  const profile = await requireProfile('partner');
  const period = getPeriod();
  const supabase = await createClient();

  // RLS já limita ao próprio parceiro; o filtro explícito é só defesa extra.
  const { data, error } = await supabase
    .from('sales')
    .select('id, partner_id, service_id, amount, status, sold_at, establishment:establishments(name, city, state), service:services(name), commissions(amount, status)')
    .eq('partner_id', profile.id)
    .gte('sold_at', period.start)
    .lt('sold_at', period.end)
    .order('sold_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const { count: estCount } = await supabase.from('establishments').select('id', { count: 'exact', head: true }).eq('partner_id', profile.id);

  // Dados do parceiro (Pix e região)
  const { data: partnerData } = await supabase
    .from('partners')
    .select('pix_key, pix_key_type, city, state')
    .eq('id', profile.id)
    .single();

  const s = summarize(rows);
  const proj = projection(s.commissionsTotal, period.elapsed, period.daysInMonth);
  const projSales = projection(s.gross, period.elapsed, period.daysInMonth);

  return (
    <>
      <PageHeader
        eyebrow="Área do parceiro"
        title="Meu desempenho"
        description={`Somente as suas vendas e comissões · ${period.label}`}
        actions={<Link className="btn" href="/parceiro/vendas/nova"><Plus size={17} /> Nova venda</Link>}
      />

      <Stats
        lead
        items={[
          { label: 'Vendas no mês', value: String(s.validCount), hint: `${s.paidCount} paga(s)` },
          { label: 'Valor vendido (pago)', value: brl(s.gross), hint: `A receber: ${brl(s.receivable)}` },
          { label: 'Minhas comissões', value: brl(s.commissionsTotal), hint: `Previstas: ${brl(s.commissionsExpected)}` },
          { label: 'Comissões pendentes', value: brl(s.commissionsPending), tone: 'warn', hint: `Pagas: ${brl(s.commissionsPaid)}` },
        ]}
      />

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Panel title="Minhas vendas por dia" subtitle="Vendas pagas">
          <RevenueChart data={dailyRevenue(rows, period)} />
        </Panel>
        <Panel title="Minha projeção" subtitle="Estimativa pelo ritmo atual do mês">
          <div className="kv"><span>Comissão realizada</span><b>{brl(s.commissionsTotal)}</b></div>
          <div className="kv"><span>Média diária (comissão)</span><b>{brl(proj.dailyAvg)}</b></div>
          <div className="kv total"><span>Projeção de comissão</span><b>{brl(proj.projected)}</b></div>
          <div className="kv"><span>Projeção de vendas pagas</span><b>{brl(projSales.projected)}</b></div>
          <div className="kv"><span>Estabelecimentos cadastrados</span><b>{estCount ?? 0}</b></div>
          <p className="note">Comissão só conta depois que a Córtex confirma o pagamento da venda.</p>
        </Panel>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Panel title="Chave Pix" subtitle="Para recebimento de comissões">
          <PixKeyForm currentKey={partnerData?.pix_key ?? null} currentType={partnerData?.pix_key_type ?? null} />
        </Panel>
        <Panel title="Região de atuação" subtitle="Usada na distribuição automática de leads">
          <RegionForm currentCity={partnerData?.city ?? null} currentState={partnerData?.state ?? null} />
        </Panel>
      </div>

      <Panel title="Vendas do mês" action={<Link className="btn btn-ghost btn-sm" href="/parceiro/vendas">Ver histórico</Link>} flush>
        {rows.length === 0 ? (
          <Empty>Nenhuma venda neste mês ainda.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Estabelecimento</th><th>Produto</th><th className="num">Valor</th><th className="num">Comissão</th><th>Status</th></tr></thead>
              <tbody>
                {rows.slice(0, 8).map((r) => {
                  const est = one(r.establishment);
                  return (
                    <tr key={r.id}>
                      <td>{dateBR(r.sold_at)}</td>
                      <td><span className="strong">{est?.name}</span><small>{[est?.city, est?.state].filter(Boolean).join(' - ')}</small></td>
                      <td>{one(r.service)?.name}</td>
                      <td className="num">{brl(r.amount)}</td>
                      <td className="num">{r.status === 'cancelled' ? '—' : brl(one(r.commissions)?.amount)}</td>
                      <td><SaleBadge status={r.status} /></td>
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
