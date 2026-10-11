export const brl = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function dateBR(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function dateTimeBR(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export const SALE_STATUS: Record<string, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  cancelled: 'Cancelado',
};
export const SALE_STATUS_OPTIONS = Object.entries(SALE_STATUS).map(([value, label]) => ({ value, label }));

export const COMMISSION_STATUS: Record<string, string> = {
  expected: 'Prevista',
  pending: 'Pendente',
  paid: 'Paga',
  cancelled: 'Cancelada',
};
export const COMMISSION_STATUS_OPTIONS = Object.entries(COMMISSION_STATUS).map(([value, label]) => ({ value, label }));

export const SEGMENTS = [
  { value: 'mecanica', label: 'Mecânica' },
  { value: 'estetica_automotiva', label: 'Estética Automotiva' },
  { value: 'lavacar', label: 'Lavacar' },
  { value: 'auto_center', label: 'Auto Center' },
  { value: 'outro', label: 'Outro' },
];
export const segmentLabel = (v: string | null | undefined) => SEGMENTS.find((s) => s.value === v)?.label ?? '—';

export const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'outro', label: 'Outro' },
];
export const PAYMENT_KEYS = PAYMENT_METHODS.map((p) => p.value);
export const paymentLabel = (v: string | null | undefined) => PAYMENT_METHODS.find((p) => p.value === v)?.label ?? '—';

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function commissionRule(type: string, percent: number | string, fixed: number | string) {
  return type === 'fixed' ? `${brl(fixed)} fixo` : `${Number(percent)}%`;
}

export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
