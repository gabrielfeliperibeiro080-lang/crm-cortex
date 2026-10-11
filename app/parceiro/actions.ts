'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { friendly } from '@/lib/errors';
import { flash, safeBack } from '@/lib/flash';
import { PAYMENT_KEYS, SEGMENTS, isUuid, UFS } from '@/lib/format';
import { str } from '@/lib/form';
import { createClient } from '@/lib/supabase/server';
import type { FormState, SaveState } from '@/lib/types';

const PIX_KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const;

const saleSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do estabelecimento.').max(120),
  responsible_name: z.string().trim().min(2, 'Informe o nome do responsável.').max(120),
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 10 && v.length <= 13, 'Informe um WhatsApp válido com DDD.'),
  email: z.string().trim().email('Informe um e-mail válido.').max(200),
  city: z.string().trim().min(2, 'Informe a cidade.').max(100),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Selecione o estado.')
    .transform((v) => v.toUpperCase()),
  segment: z.string().refine((v) => SEGMENTS.some((s) => s.value === v), 'Selecione o segmento.'),
  service_id: z.string().refine(isUuid, 'Selecione o produto/plano.'),
  sold_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data da venda.'),
  payment_method: z.string().refine((v) => v === '' || PAYMENT_KEYS.includes(v), 'Forma de pagamento inválida.'),
  notes: z.string().trim().max(1000, 'Observações muito longas.'),
});

export async function createSale(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile('partner');

  const parsed = saleSchema.safeParse({
    name: str(formData, 'name'),
    responsible_name: str(formData, 'responsible_name'),
    whatsapp: str(formData, 'whatsapp'),
    email: str(formData, 'email'),
    city: str(formData, 'city'),
    state: str(formData, 'state'),
    segment: str(formData, 'segment'),
    service_id: str(formData, 'service_id'),
    sold_at: str(formData, 'sold_at'),
    payment_method: str(formData, 'payment_method'),
    notes: str(formData, 'notes'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  const supabase = await createClient();

  // Reaproveita o estabelecimento do próprio parceiro (mesmo nome + cidade) ou cria um novo.
  const { data: existing, error: listError } = await supabase
    .from('establishments')
    .select('id, name, city')
    .eq('partner_id', profile.id);
  if (listError) return { error: friendly(listError) };

  const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
  const found = (existing ?? []).find((e) => norm(e.name) === norm(d.name) && norm(e.city) === norm(d.city));

  const fields = {
    name: d.name,
    responsible_name: d.responsible_name,
    whatsapp: d.whatsapp,
    email: d.email,
    city: d.city,
    state: d.state,
    segment: d.segment,
  };

  let establishmentId: string;
  if (found) {
    const { error } = await supabase.from('establishments').update(fields).eq('id', found.id);
    if (error) return { error: friendly(error) };
    establishmentId = found.id;
  } else {
    const { data, error } = await supabase.from('establishments').insert(fields).select('id').single();
    if (error || !data) return { error: friendly(error) };
    establishmentId = data.id;
  }

  // Valor, comissão, status e parceiro são definidos pelo banco (trigger).
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      establishment_id: establishmentId,
      service_id: d.service_id,
      sold_at: d.sold_at,
      payment_method: d.payment_method || null,
      notes: d.notes || null,
    })
    .select('id')
    .single();
  if (saleError || !sale) return { error: friendly(saleError) };

  // Se a venda veio de um lead do funil, marca o lead como Fechado e vincula a venda.
  const leadId = str(formData, 'lead_id');
  if (isUuid(leadId)) {
    await supabase.from('leads').update({ stage: 'won', sale_id: sale.id }).eq('id', leadId);
  }

  revalidatePath('/parceiro', 'layout');
  redirect('/parceiro/vendas?ok=' + encodeURIComponent('Venda registrada. Aguardando confirmação do pagamento pela Córtex.'));
}

export async function cancelSale(formData: FormData) {
  await requireProfile('partner');
  const back = safeBack(str(formData, 'back'), '/parceiro', '/parceiro/vendas');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash(back, 'erro', 'Venda inválida.');

  const supabase = await createClient();
  const { error } = await supabase.from('sales').update({ status: 'cancelled' }).eq('id', id);
  if (error) flash(back, 'erro', friendly(error));

  revalidatePath('/parceiro', 'layout');
  flash(back, 'ok', 'Venda cancelada.');
}

/** Salva / atualiza chave Pix do parceiro */
export async function savePixKey(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const profile = await requireProfile('partner');
  const pixKey = str(formData, 'pix_key').trim();
  const pixKeyType = str(formData, 'pix_key_type');

  if (pixKey && !PIX_KEY_TYPES.includes(pixKeyType as typeof PIX_KEY_TYPES[number])) {
    return { error: 'Selecione o tipo da chave Pix.' };
  }
  if (pixKey.length > 150) return { error: 'Chave Pix muito longa.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('partners')
    .update({
      pix_key: pixKey || null,
      pix_key_type: pixKey ? pixKeyType || null : null,
    })
    .eq('id', profile.id);

  if (error) return { error: friendly(error) };
  revalidatePath('/parceiro', 'layout');
  return { ok: true };
}

/** Salva cidade/estado do parceiro (para distribuição geográfica de leads) */
export async function savePartnerRegion(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const profile = await requireProfile('partner');
  const city = str(formData, 'city').trim();
  const state = str(formData, 'state').trim().toUpperCase();

  if (state && !UFS.includes(state)) return { error: 'Estado inválido.' };
  if (city.length > 100) return { error: 'Cidade muito longa.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('partners')
    .update({ city: city || null, state: state || null })
    .eq('id', profile.id);

  if (error) return { error: friendly(error) };
  revalidatePath('/parceiro', 'layout');
  return { ok: true };
}
