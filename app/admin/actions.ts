'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { friendly } from '@/lib/errors';
import { flash, safeBack } from '@/lib/flash';
import { PAYMENT_KEYS, SALE_STATUS, isUuid } from '@/lib/format';
import { checked, num, str } from '@/lib/form';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const done = () => revalidatePath('/admin', 'layout');

/* ---------------- Vendas ---------------- */
export async function setSaleStatus(formData: FormData) {
  await requireProfile('super_admin');
  const back = safeBack(str(formData, 'back'), '/admin', '/admin/vendas');
  const id = str(formData, 'id');
  const status = str(formData, 'status');
  const method = str(formData, 'payment_method');
  if (!isUuid(id) || !SALE_STATUS[status]) flash(back, 'erro', 'Dados inválidos.');
  if (method && !PAYMENT_KEYS.includes(method)) flash(back, 'erro', 'Forma de pagamento inválida.');

  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (method) patch.payment_method = method;
  const { error } = await supabase.from('sales').update(patch).eq('id', id);
  if (error) flash(back, 'erro', friendly(error));

  done();
  flash(back, 'ok', 'Status da venda atualizado.');
}

/* ---------------- Comissões ---------------- */
export async function payCommission(formData: FormData) {
  await requireProfile('super_admin');
  const back = safeBack(str(formData, 'back'), '/admin', '/admin/comissoes');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash(back, 'erro', 'Comissão inválida.');
  const date = str(formData, 'paid_at');
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00-03:00` : new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_commission_paid', { p_commission_id: id, p_paid_at: paidAt, p_notes: str(formData, 'notes') || null });
  if (error) flash(back, 'erro', friendly(error));
  done();
  flash(back, 'ok', 'Comissão marcada como paga.');
}

export async function revertCommission(formData: FormData) {
  await requireProfile('super_admin');
  const back = safeBack(str(formData, 'back'), '/admin', '/admin/comissoes');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash(back, 'erro', 'Comissão inválida.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_commission_pending', { p_commission_id: id });
  if (error) flash(back, 'erro', friendly(error));
  done();
  flash(back, 'ok', 'Pagamento revertido: comissão voltou para pendente.');
}

/* ---------------- Serviços ---------------- */
const serviceSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do serviço.').max(120),
    description: z.string().trim().max(500),
    price: z.number('Informe um preço válido.').min(0, 'Preço inválido.').max(1_000_000),
    billing_period: z.enum(['monthly', 'one_time']),
    commission_type: z.enum(['percent', 'fixed']),
    commission_percent: z.number('Informe um percentual válido.').min(0, 'Percentual inválido.').max(100, 'Percentual inválido.'),
    commission_fixed: z.number('Informe uma comissão fixa válida.').min(0, 'Comissão fixa inválida.'),
  })
  .refine((v) => v.commission_type !== 'fixed' || v.commission_fixed <= v.price, { message: 'A comissão fixa não pode ser maior que o preço.' });

function readService(fd: FormData) {
  const type = str(fd, 'commission_type');
  const pct = num(fd, 'commission_percent');
  const fix = num(fd, 'commission_fixed');
  return serviceSchema.safeParse({
    name: str(fd, 'name'),
    description: str(fd, 'description'),
    price: num(fd, 'price'),
    billing_period: str(fd, 'billing_period'),
    commission_type: type,
    commission_percent: type === 'percent' ? (Number.isNaN(pct) ? NaN : pct) : 0,
    commission_fixed: type === 'fixed' ? (Number.isNaN(fix) ? NaN : fix) : 0,
  });
}

export async function createService(formData: FormData) {
  await requireProfile('super_admin');
  const parsed = readService(formData);
  if (!parsed.success) flash('/admin/servicos', 'erro', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const supabase = await createClient();
  const { error } = await supabase.from('services').insert({ ...parsed.data, description: parsed.data.description || null });
  if (error) flash('/admin/servicos', 'erro', friendly(error));
  done();
  flash('/admin/servicos', 'ok', 'Serviço cadastrado.');
}

export async function updateService(formData: FormData) {
  await requireProfile('super_admin');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash('/admin/servicos', 'erro', 'Serviço inválido.');
  const parsed = readService(formData);
  if (!parsed.success) flash('/admin/servicos', 'erro', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const supabase = await createClient();
  const { error } = await supabase
    .from('services')
    .update({ ...parsed.data, description: parsed.data.description || null, active: checked(formData, 'active') })
    .eq('id', id);
  if (error) flash('/admin/servicos', 'erro', friendly(error));
  done();
  flash('/admin/servicos', 'ok', 'Serviço atualizado. Vendas já registradas mantêm a regra da época.');
}

export async function toggleService(formData: FormData) {
  await requireProfile('super_admin');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash('/admin/servicos', 'erro', 'Serviço inválido.');
  const supabase = await createClient();
  const { error } = await supabase.from('services').update({ active: str(formData, 'active') === 'true' }).eq('id', id);
  if (error) flash('/admin/servicos', 'erro', friendly(error));
  done();
  flash('/admin/servicos', 'ok', 'Serviço atualizado.');
}

/* ---------------- Parceiros (service_role, só após checar super_admin) ---------------- */
const partnerSchema = z.object({
  full_name: z.string().trim().min(2, 'Informe o nome do parceiro.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  phone: z.string().trim().max(30),
  password: z.string().min(8, 'A senha provisória precisa ter pelo menos 8 caracteres.').max(72),
});

async function provisionPartner(d: { full_name: string; email: string; phone: string; password: string }): Promise<string | null> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.';
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name },
  });
  if (authError || !created.user) {
    return /already|registered|exists/i.test(authError?.message ?? '') ? 'Já existe um usuário com este e-mail.' : 'Não foi possível criar o usuário.';
  }
  const userId = created.user.id;

  const { error: pErr } = await admin.from('profiles').insert({ id: userId, full_name: d.full_name, email: d.email, phone: d.phone || null, role: 'partner', active: true });
  const { error: partErr } = pErr ? { error: pErr } : await admin.from('partners').insert({ id: userId });
  if (pErr || partErr) {
    await admin.auth.admin.deleteUser(userId); // desfaz para não deixar usuário órfão
    return 'Não foi possível concluir o cadastro do parceiro.';
  }
  return null;
}

export async function createPartner(formData: FormData) {
  await requireProfile('super_admin');
  const parsed = partnerSchema.safeParse({
    full_name: str(formData, 'full_name'),
    email: str(formData, 'email'),
    phone: str(formData, 'phone'),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) flash('/admin/parceiros', 'erro', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data!;

  const err = await provisionPartner(d);
  if (err) flash('/admin/parceiros', 'erro', err);

  done();
  flash('/admin/parceiros', 'ok', `Parceiro criado. Envie a ele o e-mail ${d.email} e a senha provisória.`);
}

/* ---- Pedidos de cadastro feitos na tela pública ---- */
export async function approveRequest(formData: FormData) {
  const me = await requireProfile('super_admin');
  const id = str(formData, 'id');
  const password = String(formData.get('password') ?? '');
  if (!isUuid(id)) flash('/admin/parceiros', 'erro', 'Solicitação inválida.');
  if (password.length < 8 || password.length > 72) flash('/admin/parceiros', 'erro', 'A senha provisória precisa ter de 8 a 72 caracteres.');

  const supabase = await createClient();
  const { data: req } = await supabase.from('partner_requests').select('id, full_name, email, phone').eq('id', id).eq('status', 'pending').maybeSingle();
  if (!req) flash('/admin/parceiros', 'erro', 'Solicitação não encontrada ou já analisada.');

  const err = await provisionPartner({ full_name: req!.full_name, email: String(req!.email).toLowerCase(), phone: req!.phone, password });
  if (err) flash('/admin/parceiros', 'erro', err);

  await supabase.from('partner_requests').update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: me.id }).eq('id', id);
  done();
  flash('/admin/parceiros', 'ok', `Parceiro aprovado. Envie a ${req!.email} a senha provisória.`);
}

export async function rejectRequest(formData: FormData) {
  const me = await requireProfile('super_admin');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash('/admin/parceiros', 'erro', 'Solicitação inválida.');
  const supabase = await createClient();
  const { error } = await supabase.from('partner_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: me.id }).eq('id', id).eq('status', 'pending');
  if (error) flash('/admin/parceiros', 'erro', friendly(error));
  done();
  flash('/admin/parceiros', 'ok', 'Solicitação recusada.');
}

export async function setPartnerActive(formData: FormData) {
  const me = await requireProfile('super_admin');
  const id = str(formData, 'id');
  if (!isUuid(id) || id === me.id) flash('/admin/parceiros', 'erro', 'Operação inválida.');
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ active: str(formData, 'active') === 'true' }).eq('id', id).eq('role', 'partner');
  if (error) flash('/admin/parceiros', 'erro', friendly(error));
  done();
  flash('/admin/parceiros', 'ok', 'Parceiro atualizado.');
}

export async function resetPartnerPassword(formData: FormData) {
  await requireProfile('super_admin');
  const id = str(formData, 'id');
  const password = String(formData.get('password') ?? '');
  if (!isUuid(id)) flash('/admin/parceiros', 'erro', 'Parceiro inválido.');
  if (password.length < 8 || password.length > 72) flash('/admin/parceiros', 'erro', 'A nova senha precisa ter de 8 a 72 caracteres.');

  const supabase = await createClient();
  const { data: target } = await supabase.from('profiles').select('role').eq('id', id).maybeSingle();
  if (target?.role !== 'partner') flash('/admin/parceiros', 'erro', 'Parceiro não encontrado.');

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    flash('/admin/parceiros', 'erro', 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
  }
  const { error } = await admin!.auth.admin.updateUserById(id, { password });
  if (error) flash('/admin/parceiros', 'erro', 'Não foi possível redefinir a senha.');
  flash('/admin/parceiros', 'ok', 'Senha redefinida.');
}

/* ---------------- Custos ---------------- */
const costSchema = z.object({
  description: z.string().trim().min(2, 'Informe a descrição.').max(160),
  category: z.string().trim().max(60),
  amount: z.number('Informe um valor válido.').min(0).max(10_000_000),
  cost_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  recurrence: z.enum(['none', 'monthly']),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),
});

export async function createCost(formData: FormData) {
  await requireProfile('super_admin');
  const parsed = costSchema.safeParse({
    description: str(formData, 'description'),
    category: str(formData, 'category'),
    amount: num(formData, 'amount'),
    cost_date: str(formData, 'cost_date'),
    recurrence: str(formData, 'recurrence') || 'none',
    ends_on: str(formData, 'ends_on'),
  });
  if (!parsed.success) flash('/admin/custos', 'erro', parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  const d = parsed.data!;
  const supabase = await createClient();
  const { error } = await supabase.from('costs').insert({ description: d.description, category: d.category || null, amount: d.amount, cost_date: d.cost_date, recurrence: d.recurrence, ends_on: d.recurrence === 'monthly' && d.ends_on ? d.ends_on : null });
  if (error) flash('/admin/custos', 'erro', friendly(error));
  done();
  flash('/admin/custos', 'ok', 'Custo cadastrado.');
}

export async function deleteCost(formData: FormData) {
  await requireProfile('super_admin');
  const id = str(formData, 'id');
  if (!isUuid(id)) flash('/admin/custos', 'erro', 'Custo inválido.');
  const supabase = await createClient();
  const { error } = await supabase.from('costs').delete().eq('id', id);
  if (error) flash('/admin/custos', 'erro', friendly(error));
  done();
  flash('/admin/custos', 'ok', 'Custo removido.');
}
