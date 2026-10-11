'use server';

import { z } from 'zod';
import { friendly } from '@/lib/errors';
import { UFS } from '@/lib/format';
import { str } from '@/lib/form';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RequestState } from './types';

const schema = z.object({
  full_name: z.string().trim().min(2, 'Informe seu nome completo.').max(120),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email('Informe um e-mail válido.')),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length >= 10 && v.length <= 13, 'Informe um WhatsApp válido com DDD.'),
  city: z.string().trim().max(100),
  state: z.string().refine((v) => v === '' || UFS.includes(v), 'Estado inválido.'),
  message: z.string().trim().max(1000, 'Mensagem muito longa.'),
});

/**
 * Pedido de acesso: NÃO cria login. Só registra a solicitação; o Super Admin aprova.
 * A gravação usa service_role no servidor porque o banco não dá nenhum acesso público às tabelas.
 */
export async function requestAccess(_prev: RequestState, formData: FormData): Promise<RequestState> {
  // Campo-isca invisível: robôs preenchem, pessoas não. Finge sucesso para não dar pista.
  if (str(formData, 'website')) return { ok: true };

  const parsed = schema.safeParse({
    full_name: str(formData, 'full_name'),
    email: str(formData, 'email'),
    phone: str(formData, 'phone'),
    city: str(formData, 'city'),
    state: str(formData, 'state'),
    message: str(formData, 'message'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'Cadastro temporariamente indisponível. Fale com a Córtex.' };
  }

  const { error } = await admin.from('partner_requests').insert({
    full_name: d.full_name,
    email: d.email,
    phone: d.phone,
    city: d.city || null,
    state: d.state || null,
    message: d.message || null,
  });
  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma solicitação em análise para este e-mail.' };
    return { error: friendly(error) };
  }
  return { ok: true };
}
