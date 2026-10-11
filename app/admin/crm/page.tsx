import { KanbanBoard } from '@/components/kanban-board';
import { DistributionToggle } from '@/components/distribution-toggle';
import { FilterBar, PageHeader, SelectFilter, Stats } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl, isUuid } from '@/lib/format';
import { LEAD_COLUMNS, leadStats, type LeadCard } from '@/lib/leads';
import { partnerNames } from '@/lib/partners';
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

  return (
    <>
      <PageHeader eyebrow="CRM" title="Funil de todos os parceiros" description="Visão geral dos leads. Adicione leads, configure distribuição e gerencie o funil." />
      <FilterBar>
        <SelectFilter name="parceiro" label="Parceiro" value={sp.parceiro} options={partnerOptions} />
        <DistributionToggle mode={distributionMode} />
      </FilterBar>
      <Stats
        lead
        items={[
          { label: 'Leads no funil', value: String(s.total - s.won - s.lost), hint: `${s.fresh} novo(s)` },
          { label: 'Disponíveis / Atribuídos', value: `${availableCount} / ${assignedCount}`, hint: 'Leads no pool vs com parceiro' },
          { label: 'Testes ativos', value: String(trialActive), hint: 'Gestão Pro em período de teste', tone: trialActive > 0 ? 'warn' : undefined },
          { label: 'Follow-ups', value: `${s.followToday} hoje`, hint: s.overdue ? `${s.overdue} atrasado(s)` : 'Nenhum atrasado', tone: s.overdue ? 'bad' : undefined },
        ]}
      />
      <KanbanBoard leads={leads} today={today} mode="admin" partnerOptions={partnerOptions} />
    </>
  );
}
