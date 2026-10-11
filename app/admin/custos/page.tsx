import { createCost, deleteCost } from '../actions';
import { Badge, Empty, Flash, PageHeader, Panel, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { costsInPeriod, type CostRow } from '@/lib/finance';
import { brl, dateBR } from '@/lib/format';
import { getPeriod, todaySP } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Custos' };

type Cost = CostRow & { id: string; description: string; category: string | null };

export default async function AdminCosts({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from('costs').select('id, description, category, amount, cost_date, recurrence, ends_on').order('cost_date', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Cost[];
  const period = getPeriod();

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Custos internos" description="Usados para calcular o lucro estimado (receita líquida − custos)." />
      <Flash ok={sp.ok} erro={sp.erro} />
      <Stats items={[{ label: `Custos em ${period.label}`, value: brl(costsInPeriod(rows, period)), hint: 'Inclui custos mensais recorrentes' }, { label: 'Lançamentos', value: String(rows.length) }, { label: 'Recorrentes', value: String(rows.filter((r) => r.recurrence === 'monthly').length) }, { label: 'Pontuais', value: String(rows.filter((r) => r.recurrence === 'none').length) }]} />

      <Panel title="Novo custo">
        <form action={createCost}>
          <div className="form-grid">
            <label className="field"><span>Descrição</span><input name="description" required maxLength={160} /></label>
            <label className="field"><span>Categoria</span><input name="category" maxLength={60} placeholder="Ex.: Infraestrutura, Marketing" /></label>
            <label className="field"><span>Valor (R$)</span><input name="amount" inputMode="decimal" required /></label>
            <label className="field"><span>Data (ou início)</span><input name="cost_date" type="date" defaultValue={todaySP()} required /></label>
            <label className="field"><span>Recorrência</span><select name="recurrence" defaultValue="none"><option value="none">Pontual</option><option value="monthly">Mensal</option></select></label>
            <label className="field"><span>Fim da recorrência</span><input name="ends_on" type="date" /><small>Opcional; só para custos mensais.</small></label>
          </div>
          <div className="form-actions"><button className="btn" type="submit">Cadastrar custo</button></div>
        </form>
      </Panel>

      <Panel title="Lançamentos" flush>
        {rows.length === 0 ? <Empty>Nenhum custo cadastrado.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}>
                <td>{dateBR(c.cost_date)}</td>
                <td><span className="strong">{c.description}</span></td>
                <td>{c.category ?? '—'}</td>
                <td><Badge>{c.recurrence === 'monthly' ? `Mensal${c.ends_on ? ` até ${dateBR(c.ends_on)}` : ''}` : 'Pontual'}</Badge></td>
                <td className="num">{brl(c.amount)}</td>
                <td><div className="row-actions"><form action={deleteCost}><input type="hidden" name="id" value={c.id} /><button className="btn btn-danger btn-sm" type="submit">Remover</button></form></div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
