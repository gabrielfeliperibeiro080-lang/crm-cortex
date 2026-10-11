export type SaleStatus = 'pending_payment' | 'paid' | 'cancelled';
export type CommissionStatus = 'expected' | 'pending' | 'paid' | 'cancelled';

export type FormState = { error?: string } | null;

/** PostgREST pode devolver relação 1:1 como objeto ou lista; normalizamos. */
export type One<T> = T | T[] | null | undefined;
export function one<T>(v: One<T>): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export type CommissionLite = { amount: number | string; status: CommissionStatus };

export type SaleLite = {
  id: string;
  partner_id: string;
  service_id: string;
  amount: number | string;
  status: SaleStatus;
  sold_at: string;
  commissions: One<CommissionLite>;
};

export type SaveState = { error?: string; ok?: boolean } | null;
