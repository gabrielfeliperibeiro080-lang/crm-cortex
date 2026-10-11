import { Empty, PageHeader, Panel } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { dateTimeBR, segmentLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Estabelecimentos' };

export default async function PartnerEstablishments() {
  const profile = await requireProfile('partner');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('establishments')
    .select('id, name, responsible_name, whatsapp, email, city, state, segment, created_at')
    .eq('partner_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  return (
    <>
      <PageHeader eyebrow="Carteira" title="Meus estabelecimentos" description={`${rows.length} estabelecimento(s) cadastrado(s) por você.`} />
      <Panel flush>
        {rows.length === 0 ? (
          <Empty>Você ainda não cadastrou estabelecimentos. Eles são criados ao registrar uma venda.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Estabelecimento</th><th>Responsável</th><th>Contato</th><th>Cidade</th><th>Segmento</th><th>Cadastro</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td><span className="strong">{e.name}</span></td>
                    <td>{e.responsible_name ?? '—'}</td>
                    <td>{e.whatsapp ?? '—'}<small>{e.email}</small></td>
                    <td>{[e.city, e.state].filter(Boolean).join(' - ') || '—'}</td>
                    <td>{segmentLabel(e.segment)}</td>
                    <td>{dateTimeBR(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
