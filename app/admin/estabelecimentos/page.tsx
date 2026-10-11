import { Empty, FilterBar, PageHeader, Panel, SelectFilter } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { dateTimeBR, isUuid, SEGMENTS, segmentLabel } from '@/lib/format';
import { partnerNames } from '@/lib/partners';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Estabelecimentos' };

export default async function AdminEstablishments({ searchParams }: { searchParams: Promise<{ parceiro?: string; segmento?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const supabase = await createClient();
  const names = await partnerNames(supabase);

  let q = supabase
    .from('establishments')
    .select('id, partner_id, name, responsible_name, whatsapp, email, city, state, segment, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (sp.parceiro && isUuid(sp.parceiro)) q = q.eq('partner_id', sp.parceiro);
  if (sp.segmento && SEGMENTS.some((s) => s.value === sp.segmento)) q = q.eq('segment', sp.segmento);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  return (
    <>
      <PageHeader eyebrow="Carteira" title="Estabelecimentos" description={`${rows.length} estabelecimento(s) exibido(s).`} />
      <FilterBar>
        <SelectFilter name="parceiro" label="Parceiro" value={sp.parceiro} options={[...names.entries()].map(([value, label]) => ({ value, label }))} />
        <SelectFilter name="segmento" label="Segmento" value={sp.segmento} options={SEGMENTS} />
      </FilterBar>
      <Panel flush>
        {rows.length === 0 ? <Empty>Nenhum estabelecimento encontrado.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Estabelecimento</th><th>Parceiro</th><th>Responsável</th><th>Contato</th><th>Cidade</th><th>Segmento</th><th>Cadastro</th></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.id}>
                <td><span className="strong">{e.name}</span></td>
                <td>{names.get(e.partner_id) ?? '—'}</td>
                <td>{e.responsible_name ?? '—'}</td>
                <td>{e.whatsapp ?? '—'}<small>{e.email}</small></td>
                <td>{[e.city, e.state].filter(Boolean).join(' - ') || '—'}</td>
                <td>{segmentLabel(e.segment)}</td>
                <td>{dateTimeBR(e.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
