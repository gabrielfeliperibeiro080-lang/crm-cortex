import { createService, toggleService, updateService } from '../actions';
import { Badge, Empty, Flash, PageHeader, Panel } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, commissionRule } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Serviços' };

type Svc = {
  id: string; name: string; description: string | null; price: number; billing_period: string;
  commission_type: string; commission_percent: number; commission_fixed: number; active: boolean;
};

function ServiceFields({ s }: { s?: Svc }) {
  return (
    <div className="form-grid">
      <label className="field"><span>Nome</span><input name="name" defaultValue={s?.name} required maxLength={120} /></label>
      <label className="field"><span>Preço (R$)</span><input name="price" inputMode="decimal" defaultValue={s ? String(s.price).replace('.', ',') : ''} required /></label>
      <label className="field"><span>Cobrança</span>
        <select name="billing_period" defaultValue={s?.billing_period ?? 'monthly'}><option value="monthly">Mensal</option><option value="one_time">Única</option></select>
      </label>
      <label className="field"><span>Tipo de comissão</span>
        <select name="commission_type" defaultValue={s?.commission_type ?? 'percent'}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select>
      </label>
      <label className="field"><span>Percentual (%)</span><input name="commission_percent" inputMode="decimal" defaultValue={s ? String(s.commission_percent).replace('.', ',') : '30'} /><small>Usado se o tipo for percentual.</small></label>
      <label className="field"><span>Comissão fixa (R$)</span><input name="commission_fixed" inputMode="decimal" defaultValue={s ? String(s.commission_fixed).replace('.', ',') : ''} /><small>Usado se o tipo for valor fixo.</small></label>
      <label className="field full"><span>Descrição</span><input name="description" defaultValue={s?.description ?? ''} maxLength={500} /></label>
      {s && <label className="field-check full"><input type="checkbox" name="active" defaultChecked={s.active} /> Ativo (disponível para novas vendas)</label>}
    </div>
  );
}

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from('services').select('*').order('created_at');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Svc[];

  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Serviços" description="Produtos/planos vendidos pelos parceiros. Alterar preço ou comissão afeta só vendas novas." />
      <Flash ok={sp.ok} erro={sp.erro} />

      <Panel title="Novo serviço">
        <form action={createService}>
          <ServiceFields />
          <div className="form-actions"><button className="btn" type="submit">Cadastrar serviço</button></div>
        </form>
      </Panel>

      <Panel flush title="Serviços cadastrados">
        {rows.length === 0 ? <Empty>Nenhum serviço cadastrado.</Empty> : rows.map((s) => (
          <div key={s.id}>
            <div className="table-wrap"><table><tbody><tr>
              <td><span className="strong">{s.name}</span><small>{s.description}</small></td>
              <td className="num">{brl(s.price)}<small>{s.billing_period === 'monthly' ? 'por mês' : 'cobrança única'}</small></td>
              <td className="num">{commissionRule(s.commission_type, s.commission_percent, s.commission_fixed)}<small>comissão</small></td>
              <td><Badge tone={s.active ? 'good' : undefined}>{s.active ? 'Ativo' : 'Inativo'}</Badge></td>
              <td><div className="row-actions"><form action={toggleService}>
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={String(!s.active)} />
                <button className="btn btn-ghost btn-sm" type="submit">{s.active ? 'Desativar' : 'Ativar'}</button>
              </form></div></td>
            </tr></tbody></table></div>
            <details className="edit"><summary>Editar</summary>
              <div className="panel-body"><form action={updateService}>
                <input type="hidden" name="id" value={s.id} />
                <ServiceFields s={s} />
                <div className="form-actions"><button className="btn" type="submit">Salvar alterações</button></div>
              </form></div>
            </details>
          </div>
        ))}
      </Panel>
    </>
  );
}
