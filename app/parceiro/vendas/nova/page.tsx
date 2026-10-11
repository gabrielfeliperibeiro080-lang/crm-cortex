import { PageHeader, Panel, Empty } from '@/components/ui';
import { isUuid } from '@/lib/format';
import { requireProfile } from '@/lib/auth';
import { todaySP } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';
import { SaleForm, type SaleDefaults, type ServiceOption } from './sale-form';

export const metadata = { title: 'Nova venda' };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const profile = await requireProfile('partner');
  const { lead } = await searchParams;
  const supabase = await createClient();

  // Pré-preenche com os dados do lead (somente se for do próprio parceiro e ainda sem venda).
  let defaults: SaleDefaults | undefined;
  let leadId: string | undefined;
  if (lead && isUuid(lead)) {
    const { data: l } = await supabase
      .from('leads')
      .select('id, name, contact_name, whatsapp, email, city, state, segment, sale_id')
      .eq('id', lead)
      .eq('partner_id', profile.id)
      .maybeSingle();
    if (l && !l.sale_id) {
      leadId = l.id;
      defaults = {
        name: l.name ?? '',
        responsible_name: l.contact_name ?? '',
        whatsapp: l.whatsapp ?? '',
        email: l.email ?? '',
        city: l.city ?? '',
        state: l.state ?? '',
        segment: l.segment ?? 'mecanica',
      };
    }
  }

  const { data, error } = await supabase
    .from('services')
    .select('id, name, price, commission_type, commission_percent, commission_fixed')
    .eq('active', true)
    .order('name');
  if (error) throw new Error(error.message);

  const services: ServiceOption[] = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    price: Number(s.price),
    commission_type: s.commission_type,
    commission_percent: Number(s.commission_percent),
    commission_fixed: Number(s.commission_fixed),
  }));

  return (
    <>
      <PageHeader eyebrow="Vendas" title="Nova venda" description="Informe os dados do estabelecimento e da venda. Você é identificado automaticamente." />
      <Panel>
        {services.length === 0 ? <Empty>Nenhum produto disponível no momento. Fale com a Córtex.</Empty> : <SaleForm services={services} today={todaySP()} defaults={defaults} leadId={leadId} />}
      </Panel>
    </>
  );
}
