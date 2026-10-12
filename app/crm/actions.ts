'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { friendly } from '@/lib/errors';
import { SEGMENTS, UFS, isUuid } from '@/lib/format';
import { num, str } from '@/lib/form';
import { STAGE_KEYS } from '@/lib/leads';
import { createClient } from '@/lib/supabase/server';
import type { SaveState } from '@/lib/types';

const refresh = () => {
  revalidatePath('/parceiro', 'layout');
  revalidatePath('/admin', 'layout');
};

const optional = (max: number) => z.string().trim().max(max, 'Texto muito longo.');

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da empresa.').max(120),
  contact_name: optional(120),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || (v.length >= 10 && v.length <= 13), 'WhatsApp inválido (informe com DDD).'),
  email: optional(200).refine((v) => v === '' || z.email().safeParse(v).success, 'E-mail inválido.'),
  city: optional(100),
  state: z.string().refine((v) => v === '' || UFS.includes(v), 'Estado inválido.'),
  segment: z.string().refine((v) => SEGMENTS.some((s) => s.value === v), 'Segmento inválido.'),
  source: optional(80),
  stage: z.string().refine((v) => STAGE_KEYS.includes(v), 'Etapa inválida.'),
  opportunity_value: z.number('Valor inválido.').min(0, 'Valor inválido.').max(10_000_000).nullable(),
  next_action: optional(160),
  next_follow_up: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data de follow-up inválida.'),
  notes: optional(2000),
  lost_reason: optional(200),
});

const nn = (v: string) => (v === '' ? null : v);

export async function saveLead(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const profile = await requireProfile();
  const id = str(formData, 'id');
  if (id && !isUuid(id)) return { error: 'Lead inválido.' };

  // Admin pode criar leads; parceiro também pode criar os seus
  if (!id && profile.role !== 'partner' && profile.role !== 'super_admin') {
    return { error: 'Sem permissão para criar leads.' };
  }

  const rawValue = num(formData, 'opportunity_value');
  const parsed = leadSchema.safeParse({
    name: str(formData, 'name'),
    contact_name: str(formData, 'contact_name'),
    whatsapp: str(formData, 'whatsapp'),
    email: str(formData, 'email'),
    city: str(formData, 'city'),
    state: str(formData, 'state'),
    segment: str(formData, 'segment'),
    source: str(formData, 'source'),
    stage: str(formData, 'stage') || 'new',
    opportunity_value: Number.isNaN(rawValue) ? null : rawValue,
    next_action: str(formData, 'next_action'),
    next_follow_up: str(formData, 'next_follow_up'),
    notes: str(formData, 'notes'),
    lost_reason: str(formData, 'lost_reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  // Verificar duplicidade de telefone antes de criar
  if (!id && nn(d.whatsapp)) {
    const supabase = await createClient();
    const phone = d.whatsapp.replace(/\D/g, '');
    const { data: dup } = await supabase.from('leads').select('id, name').eq('whatsapp', phone).limit(1);
    if (dup && dup.length > 0) {
      const dupName = (dup[0] as { name: string }).name;
      return { error: `Já existe um lead com este WhatsApp: "${dupName}". Verifique antes de criar outro.` };
    }
  }

  const row = {
    name: d.name,
    contact_name: nn(d.contact_name),
    whatsapp: nn(d.whatsapp),
    email: nn(d.email),
    city: nn(d.city),
    state: nn(d.state),
    segment: d.segment,
    source: nn(d.source),
    stage: d.stage,
    opportunity_value: d.opportunity_value,
    next_action: nn(d.next_action),
    next_follow_up: nn(d.next_follow_up),
    notes: nn(d.notes),
    lost_reason: d.stage === 'lost' ? nn(d.lost_reason) : null,
  };

  const supabase = await createClient();

  if (id) {
    // Edição: RLS protege — parceiro só edita o seu, admin edita qualquer
    const { error } = await supabase.from('leads').update(row).eq('id', id);
    if (error) return { error: friendly(error) };
  } else {
    // Criação pelo admin: is_available determina se vai para pool ou fica sem dono
    const isAdmin = profile.role === 'super_admin';
    const assignTo = isAdmin ? str(formData, 'assign_to') : null; // partner_id ou 'available'
    const makeAvailable = isAdmin && assignTo === 'available';
    const partnerId = isAdmin && isUuid(assignTo ?? '') ? assignTo : null;

    // Se admin e modo auto: deixa o banco distribuir após criar como available
    const insertRow = {
      ...row,
      ...(isAdmin && !partnerId ? { is_available: true, partner_id: partnerId } : {}),
      ...(isAdmin && partnerId ? { partner_id: partnerId, is_available: false } : {}),
    };

    if (isAdmin) {
      // Admin cria com service_role para evitar conflito de partner_id no trigger
      const { createAdminClient } = await import('@/lib/supabase/admin');
      let admin: ReturnType<typeof createAdminClient>;
      try { admin = createAdminClient(); } catch { return { error: 'Serviço administrativo indisponível.' }; }

      const finalRow = {
        ...row,
        is_available: makeAvailable || !partnerId,
        partner_id: partnerId,
      };
      const { data: newLead, error } = await admin.from('leads').insert(finalRow).select('id').single();
      if (error || !newLead) return { error: friendly(error) };

      // Se modo auto: tenta distribuição automática
      if (makeAvailable) {
        await supabase.rpc('auto_distribute_lead', { p_lead_id: (newLead as { id: string }).id });
      }
    } else {
      // Parceiro cria normalmente — partner_id definido pelo trigger
      const { error } = await supabase.from('leads').insert(row);
      if (error) return { error: friendly(error) };
    }
  }

  refresh();
  return { ok: true };
}

export async function moveLead(id: string, stage: string): Promise<{ error?: string } | null> {
  await requireProfile();
  if (!isUuid(id) || !STAGE_KEYS.includes(stage)) return { error: 'Movimento inválido.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('leads').update({ stage }).eq('id', id).select('id');
  if (error) return { error: friendly(error) };
  if (!data || data.length === 0) return { error: 'Lead não encontrado.' };
  refresh();
  return null;
}

export async function deleteLead(id: string): Promise<{ error?: string } | null> {
  await requireProfile();
  if (!isUuid(id)) return { error: 'Lead inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Parceiro assume lead disponível (protegido contra race condition no banco) */
export async function claimLead(leadId: string): Promise<{ error?: string } | null> {
  await requireProfile('partner');
  if (!isUuid(leadId)) return { error: 'Lead inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('claim_lead', { p_lead_id: leadId });
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Inicia teste de 24h para um lead na etapa Proposta */
export async function startTrial(leadId: string): Promise<{ error?: string } | null> {
  await requireProfile();
  if (!isUuid(leadId)) return { error: 'Lead inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('start_trial', { p_lead_id: leadId });
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Admin cancela/reseta um teste (para correção de erros) */
export async function cancelTrial(leadId: string): Promise<{ error?: string } | null> {
  await requireProfile('super_admin');
  if (!isUuid(leadId)) return { error: 'Lead inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_trial', { p_lead_id: leadId });
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Parceiro solicita confirmação de fechamento (não fecha venda, só sinaliza admin) */
export async function requestClose(leadId: string): Promise<{ error?: string } | null> {
  const profile = await requireProfile('partner');
  if (!isUuid(leadId)) return { error: 'Lead inválido.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('leads')
    .update({
      close_requested_at: new Date().toISOString(),
      close_requested_by: profile.id,
    })
    .eq('id', leadId)
    .eq('partner_id', profile.id); // RLS extra: só o dono
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Admin transfere lead entre parceiros */
export async function transferLead(leadId: string, toPartnerId: string, reason?: string): Promise<{ error?: string } | null> {
  await requireProfile('super_admin');
  if (!isUuid(leadId) || !isUuid(toPartnerId)) return { error: 'Parâmetros inválidos.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('transfer_lead', {
    p_lead_id: leadId,
    p_to_partner_id: toPartnerId,
    p_reason: reason ?? null,
  });
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Altera modo de distribuição (manual | auto) — somente admin */
export async function setDistributionMode(mode: 'manual' | 'auto'): Promise<{ error?: string } | null> {
  const profile = await requireProfile('super_admin');
  if (mode !== 'manual' && mode !== 'auto') return { error: 'Modo inválido.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('system_settings')
    .update({ value: mode, updated_by: profile.id })
    .eq('key', 'lead_distribution_mode');
  if (error) return { error: friendly(error) };
  refresh();
  return null;
}

/** Admin valida e confirma o fechamento da venda do lead */
export async function confirmSaleFromLead(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireProfile('super_admin');
  const leadId = str(formData, 'lead_id');
  const serviceId = str(formData, 'service_id');
  const paymentMethod = str(formData, 'payment_method');
  const soldAt = str(formData, 'sold_at');
  const notes = str(formData, 'notes');

  if (!isUuid(leadId) || !isUuid(serviceId)) return { error: 'Dados inválidos.' };

  const supabase = await createClient();

  // 1. Obter dados do lead
  const { data: lead, error: lErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (lErr || !lead) return { error: 'Lead não encontrado.' };

  if (!lead.partner_id) {
    return { error: 'O lead precisa estar atribuído a um parceiro para confirmar a venda.' };
  }

  // 2. Obter serviço
  const { data: svc, error: sErr } = await supabase
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();
  if (sErr || !svc || !svc.active) return { error: 'Serviço inválido ou inativo.' };

  // 3. Garantir ou criar estabelecimento do parceiro
  const { createAdminClient } = await import('@/lib/supabase/admin');
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return { error: 'Serviço administrativo indisponível.' }; }

  const { data: existingEst } = await admin
    .from('establishments')
    .select('id, name, city')
    .eq('partner_id', lead.partner_id);

  const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
  const foundEst = (existingEst ?? []).find(
    (e) => norm(e.name) === norm(lead.name) && norm(e.city) === norm(lead.city)
  );

  let establishmentId: string;
  if (foundEst) {
    establishmentId = foundEst.id;
  } else {
    const { data: newEst, error: estErr } = await admin
      .from('establishments')
      .insert({
        partner_id: lead.partner_id,
        name: lead.name,
        responsible_name: lead.contact_name || lead.name,
        whatsapp: lead.whatsapp || '',
        email: lead.email || '',
        city: lead.city || '',
        state: lead.state || '',
        segment: lead.segment || 'outro',
      })
      .select('id')
      .single();
    if (estErr || !newEst) return { error: friendly(estErr) };
    establishmentId = newEst.id;
  }

  // 4. Criar venda (trigger sales_sync_commission calcula e cria a comissão automaticamente)
  const saleDate = /^\d{4}-\d{2}-\d{2}$/.test(soldAt) ? soldAt : new Date().toISOString().slice(0, 10);
  const { data: sale, error: saleError } = await admin
    .from('sales')
    .insert({
      partner_id: lead.partner_id,
      establishment_id: establishmentId,
      service_id: svc.id,
      amount: svc.price,
      sold_at: saleDate,
      payment_method: paymentMethod || 'pix',
      status: 'paid', // Venda validada pelo admin
      notes: notes || `Fechamento validado pelo admin a partir do lead CRM (${lead.name})`,
    })
    .select('id')
    .single();

  if (saleError || !sale) return { error: friendly(saleError) };

  // 5. Atualizar lead para Fechado (won) e vincular a venda
  const { error: leadUpdateErr } = await admin
    .from('leads')
    .update({
      stage: 'won',
      sale_id: sale.id,
      stage_changed_at: new Date().toISOString(),
      opportunity_value: svc.price,
    })
    .eq('id', leadId);

  if (leadUpdateErr) return { error: friendly(leadUpdateErr) };

  refresh();
  return { ok: true };
}

export type LeadImportItem = {
  name: string;
  contact_name?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  source?: string | null;
  stage?: string | null;
  opportunity_value?: number | null;
  notes?: string | null;
};

export type ImportLeadsResult = {
  successCount: number;
  skippedDuplicates: number;
  errors: string[];
};

export async function importLeads(
  leads: LeadImportItem[],
  assignTo: string // 'available' or partner UUID
): Promise<{ ok?: boolean; error?: string; result?: ImportLeadsResult }> {
  const profile = await requireProfile('super_admin');
  if (profile.role !== 'super_admin') {
    return { error: 'Apenas administradores podem importar planilhas.' };
  }

  if (!Array.isArray(leads) || leads.length === 0) {
    return { error: 'Nenhum lead fornecido para importação.' };
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Serviço administrativo indisponível.' };
  }

  const makeAvailable = assignTo === 'available';
  const partnerId = isUuid(assignTo) ? assignTo : null;

  // Carregar todos os Whatsapps existentes para checar duplicidades
  const { data: existingLeads } = await admin.from('leads').select('whatsapp').not('whatsapp', 'is', null);
  const existingPhones = new Set<string>(
    (existingLeads ?? []).map((l: { whatsapp: string | null }) => (l.whatsapp ? l.whatsapp.replace(/\D/g, '') : '')).filter(Boolean)
  );

  let successCount = 0;
  let skippedDuplicates = 0;
  const errors: string[] = [];
  const rowsToInsert: any[] = [];
  const processedInBatchPhones = new Set<string>();

  for (let idx = 0; idx < leads.length; idx++) {
    const item = leads[idx];
    const rowNum = idx + 2; // Considerando linha 1 como cabeçalho

    const name = (item.name ?? '').trim();
    if (!name || name.length < 2) {
      errors.push(`Linha ${rowNum}: Nome da empresa é obrigatório.`);
      continue;
    }

    let phone = (item.whatsapp ?? '').replace(/\D/g, '');
    if (phone) {
      if (phone.length < 10 || phone.length > 13) {
        errors.push(`Linha ${rowNum}: WhatsApp "${item.whatsapp}" inválido (precisa ter DDD).`);
        continue;
      }
      if (existingPhones.has(phone) || processedInBatchPhones.has(phone)) {
        skippedDuplicates++;
        continue;
      }
      processedInBatchPhones.add(phone);
    }

    // Validação ou fallback de segmento
    const rawSegment = (item.segment ?? '').trim().toLowerCase();
    const validSegment = SEGMENTS.some((s) => s.value === rawSegment)
      ? rawSegment
      : SEGMENTS.some((s) => s.label.toLowerCase() === rawSegment)
      ? SEGMENTS.find((s) => s.label.toLowerCase() === rawSegment)!.value
      : 'outro';

    // Validação ou fallback de estado
    const rawState = (item.state ?? '').trim().toUpperCase();
    const validState = UFS.includes(rawState) ? rawState : null;

    // Etapa inicial
    const rawStage = (item.stage ?? '').trim().toLowerCase();
    const validStage = STAGE_KEYS.includes(rawStage) ? rawStage : 'new';

    const row = {
      name: name.slice(0, 120),
      contact_name: item.contact_name ? item.contact_name.trim().slice(0, 120) : null,
      whatsapp: phone || null,
      email: item.email ? item.email.trim().slice(0, 200) : null,
      city: item.city ? item.city.trim().slice(0, 100) : null,
      state: validState,
      segment: validSegment,
      source: item.source ? item.source.trim().slice(0, 80) : 'Planilha',
      stage: validStage,
      opportunity_value: typeof item.opportunity_value === 'number' && item.opportunity_value >= 0 ? item.opportunity_value : null,
      notes: item.notes ? item.notes.trim().slice(0, 2000) : null,
      is_available: makeAvailable || !partnerId,
      partner_id: partnerId,
    };

    rowsToInsert.push(row);
  }

  // Inserção em lotes de 100
  const supabase = await createClient();
  const createdIds: string[] = [];

  for (let i = 0; i < rowsToInsert.length; i += 100) {
    const chunk = rowsToInsert.slice(i, i + 100);
    const { data: inserted, error: insertErr } = await admin.from('leads').insert(chunk).select('id');
    if (insertErr) {
      errors.push(`Erro ao salvar lote: ${insertErr.message}`);
    } else if (inserted) {
      successCount += inserted.length;
      inserted.forEach((r: { id: string }) => createdIds.push(r.id));
    }
  }

  // Se foram para a fila disponível, tenta distribuição automática se estiver ativo
  if (makeAvailable && createdIds.length > 0) {
    for (const leadId of createdIds) {
      try {
        await supabase.rpc('auto_distribute_lead', { p_lead_id: leadId });
      } catch {
        // Ignora erro de distribuição silenciosamente
      }
    }
  }

  refresh();

  return {
    ok: true,
    result: {
      successCount,
      skippedDuplicates,
      errors,
    },
  };
}

