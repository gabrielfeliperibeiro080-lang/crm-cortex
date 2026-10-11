export const LEAD_STAGES = [
  { value: 'new', label: 'Novo lead' },
  { value: 'contacted', label: 'Contato' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'negotiation', label: 'Negociação' },
  { value: 'won', label: 'Fechado' },
  { value: 'lost', label: 'Perdido' },
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number]['value'];
export const STAGE_KEYS: string[] = LEAD_STAGES.map((s) => s.value);
export const stageLabel = (v: string) => LEAD_STAGES.find((s) => s.value === v)?.label ?? v;

export const TRIAL_STATUSES = [
  { value: 'not_started',    label: 'Não iniciado' },
  { value: 'active',         label: 'Teste ativo' },
  { value: 'ended',          label: 'Teste encerrado' },
  { value: 'converted',      label: 'Convertido' },
  { value: 'not_converted',  label: 'Não convertido' },
] as const;

export type TrialStatus = (typeof TRIAL_STATUSES)[number]['value'];
export const trialLabel = (v: string) => TRIAL_STATUSES.find((s) => s.value === v)?.label ?? v;

export type LeadCard = {
  id: string;
  name: string;
  contact_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  segment: string;
  source: string | null;
  stage: LeadStage;
  opportunity_value: number | null;
  next_action: string | null;
  next_follow_up: string | null;
  notes: string | null;
  lost_reason: string | null;
  sale_id: string | null;
  created_at: string;
  partner_name?: string | null;
  // distribuição
  is_available: boolean;
  partner_id?: string | null;
  assigned_at: string | null;
  // teste de 24h
  trial_status: TrialStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  // solicitação de fechamento
  close_requested_at: string | null;
};

export const LEAD_COLUMNS =
  'id, name, contact_name, whatsapp, email, city, state, segment, source, stage, opportunity_value, next_action, next_follow_up, notes, lost_reason, sale_id, created_at, is_available, partner_id, assigned_at, trial_status, trial_started_at, trial_ends_at, close_requested_at';

const isOpen = (l: LeadCard) => l.stage !== 'won' && l.stage !== 'lost';

export function leadStats(leads: LeadCard[], today: string) {
  const count = (st: LeadStage) => leads.filter((l) => l.stage === st).length;
  const won = count('won');
  const lost = count('lost');
  const negotiating = leads.filter((l) => l.stage === 'proposal' || l.stage === 'negotiation');
  return {
    total: leads.length,
    fresh: count('new'),
    proposals: count('proposal'),
    negotiation: count('negotiation'),
    won,
    lost,
    negotiatingValue: negotiating.reduce((s, l) => s + Number(l.opportunity_value ?? 0), 0),
    conversion: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    followToday: leads.filter((l) => isOpen(l) && l.next_follow_up === today).length,
    overdue: leads.filter((l) => isOpen(l) && l.next_follow_up !== null && l.next_follow_up < today).length,
  };
}
