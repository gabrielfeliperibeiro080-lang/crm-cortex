import { KanbanBoard } from '@/components/kanban-board';
import { PageHeader, Stats, TrialAlerts } from '@/components/ui';
import { requireProfile } from '@/lib/auth';
import { brl } from '@/lib/format';
import { LEAD_COLUMNS, leadStats, type LeadCard } from '@/lib/leads';
import { todaySP } from '@/lib/period';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'CRM · Funil' };

export default async function PartnerCrm() {
  const profile = await requireProfile('partner');
  const supabase = await createClient();

  // Busca leads do parceiro + leads disponíveis no pool
  // RLS já permite isso: (partner_id = uid) OR (is_available = true)
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_COLUMNS)
    .or(`partner_id.eq.${profile.id},is_available.eq.true`)
    .order('stage_changed_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const allLeads = (data ?? []) as unknown as LeadCard[];
  const myLeads = allLeads.filter((l) => l.partner_id === profile.id);
  const today = todaySP();
  const s = leadStats(myLeads, today);

  // Alertas de teste de 24h
  const now = Date.now();
  const trialAlerts = myLeads
    .filter((l) => l.trial_status === 'active' && l.trial_ends_at)
    .map((l) => {
      const endsMs = new Date(l.trial_ends_at!).getTime();
      const diffH = (endsMs - now) / 3600000;
      let alertLevel: '12h' | '6h' | '1h' | 'ended' | null = null;
      if (diffH <= 0) alertLevel = 'ended';
      else if (diffH <= 1) alertLevel = '1h';
      else if (diffH <= 6) alertLevel = '6h';
      else if (diffH <= 12) alertLevel = '12h';
      return { lead: l, alertLevel };
    })
    .filter((a) => a.alertLevel !== null);

  const trialEnded = myLeads.filter((l) => l.trial_status === 'active' && l.trial_ends_at && new Date(l.trial_ends_at).getTime() <= now);
  const availableCount = allLeads.filter((l) => l.is_available && l.partner_id !== profile.id).length;

  return (
    <>
      <PageHeader eyebrow="CRM" title="Funil de vendas" description="Gerencie seus leads. Confira os leads disponíveis para assumir abaixo do Kanban." />

      <TrialAlerts alerts={trialAlerts} />

      <Stats
        lead
        items={[
          { label: 'Meus leads no funil', value: String(s.total - s.won - s.lost), hint: `${s.fresh} novo(s)` },
          { label: 'Disponíveis para assumir', value: String(availableCount), hint: 'Leads no pool aguardando parceiro', tone: availableCount > 0 ? 'warn' : undefined },
          { label: 'Testes ativos', value: String(myLeads.filter((l) => l.trial_status === 'active').length), hint: `${trialEnded.length} aguardando resultado`, tone: trialEnded.length > 0 ? 'bad' : undefined },
          { label: 'Follow-ups', value: `${s.followToday} hoje`, hint: s.overdue ? `${s.overdue} atrasado(s)` : 'Nenhum atrasado', tone: s.overdue ? 'bad' : undefined },
        ]}
      />
      <KanbanBoard leads={allLeads} today={today} mode="partner" currentPartnerId={profile.id} />
    </>
  );
}
