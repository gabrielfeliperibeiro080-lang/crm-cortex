import { KanbanBoard, type KanbanPartnerDetail, type KanbanService } from '@/components/kanban-board';
import { DistributionToggle } from '@/components/distribution-toggle';
import { FilterBar, PageHeader, SelectFilter, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, isUuid } from '@/lib/format';
import { LEAD_COLUMNS, leadStats, type LeadCard } from '@/lib/leads';
import { partnerDetails, partnerNames } from '@/lib/partners';
import { todaySP } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'CRM · Funil' };

export default async function AdminCrm({ searchParams }: { searchParams: Promise<{ parceiro?: string }> }) {
  await requireProfile('super_admin');
  const sp = await searchParams;
  const supabase = await createClient();
  const names = await partnerNames(supabase);

  // Modo de distribuição
  const { data: setting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'lead_distribution_mode')
    .single();
  const distributionMode = (setting?.value ?? 'manual') as 'manual' | 'auto';

  // Serviços ativos para confirmação de venda
  const { data: servicesData } = await supabase
    .from('services')
    .select('id, name, price, commission_type, commission_percent, commission_fixed')
    .eq('active', true)
    .order('price');

  const services: KanbanService[] = (servicesData ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    price: Number(s.price),
    commission_type: s.commission_type as 'percent' | 'fixed',
    commission_percent: Number(s.commission_percent),
    commission_fixed: Number(s.commission_fixed),
  }));

  // Detalhes dos parceiros com chaves Pix
  const pMap = await partnerDetails(supabase);
  const partnerDetailsRecord: Record<string, KanbanPartnerDetail> = {};
  pMap.forEach((v, k) => {
    partnerDetailsRecord[k] = v;
  });

  let q = supabase
    .from('leads')
    .select(`${LEAD_COLUMNS}`)
    .order('stage_changed_at', { ascending: false })
    .limit(1000);
  if (sp.parceiro && isUuid(sp.parceiro)) q = q.eq('partner_id', sp.parceiro);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const leads = ((data ?? []) as unknown as (LeadCard & { partner_id: string })[]).map((l) => ({
    ...l,
    partner_name: names.get(l.partner_id) ?? null,
  }));
  const today = todaySP();
  const s = leadStats(leads, today);

  const partnerOptions = [...names.entries()].map(([value, label]) => ({ value, label }));

  const availableCount = leads.filter((l) => l.is_available).length;
  const assignedCount = leads.filter((l) => !l.is_available).length;
  const trialActive = leads.filter((l) => l.trial_status === 'active').length;
  const closeRequestsCount = leads.filter(
    (l) => l.close_requested_at && l.stage !== 'won' && !l.sale_id
  ).length;

  return (
    <>
      <PageHeader eyebrow="CRM" title="Funil de todos os parceiros" description="Visão geral dos leads. Adicione leads, configure distribuição e gerencie o funil." />

      {closeRequestsCount > 0 && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ color: '#eab308' }}>🔔 {closeRequestsCount} solicitação(ões) de confirmação de venda aguardando aprovação!</strong>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
              Os afiliados solicitaram validação para fechamento de venda. Localize o card com a tag <strong>"🔔 Fechamento solicitado"</strong> e clique em <strong>"Confirmar Fechamento"</strong> para aprovar a venda e liberar a comissão.
            </p>
          </div>
        </div>
      )}

      <FilterBar>
        <SelectFilter name="parceiro" label="Parceiro" value={sp.parceiro} options={partnerOptions} />
        <DistributionToggle mode={distributionMode} />
      </FilterBar>
      <Stats
        lead
        items={[
          { label: 'Leads no funil', value: String(s.total - s.won - s.lost), hint: `${s.fresh} novo(s)` },
          { label: 'Disponíveis / Atribuídos', value: `${availableCount} / ${assignedCount}`, hint: 'Leads no pool vs com parceiro' },
          {
            label: 'Fechamentos solicitados',
            value: String(closeRequestsCount),
            hint: closeRequestsCount > 0 ? 'Aguardando sua validação' : 'Nenhuma pendência',
            tone: closeRequestsCount > 0 ? 'bad' : undefined,
          },
          { label: 'Testes ativos', value: String(trialActive), hint: 'Gestão Pro em período de teste', tone: trialActive > 0 ? 'warn' : undefined },
          { label: 'Follow-ups', value: `${s.followToday} hoje`, hint: s.overdue ? `${s.overdue} atrasado(s)` : 'Nenhum atrasado', tone: s.overdue ? 'bad' : undefined },
        ]}
      />
      <KanbanBoard
        leads={leads}
        today={today}
        mode="admin"
        partnerOptions={partnerOptions}
        services={services}
        partnerDetails={partnerDetailsRecord}
      />
    </>
  );
}

