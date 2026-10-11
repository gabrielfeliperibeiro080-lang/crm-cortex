import { one, type SaleLite } from './types';
import type { Period } from './period';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Regras (definidas no schema):
 *  - Faturamento bruto = vendas PAGAS.
 *  - Comissão válida   = comissões pendentes + pagas (venda paga). Prevista = venda aguardando pagamento.
 *  - Venda cancelada   = fora de todos os totais.
 *  - Receita líquida   = faturamento bruto − comissões válidas (não é lucro).
 */
export function summarize(rows: SaleLite[]) {
  let gross = 0, paidCount = 0, validCount = 0, receivable = 0;
  let commissionsTotal = 0, commissionsPaid = 0, commissionsPending = 0, commissionsExpected = 0;

  for (const r of rows) {
    const amount = Number(r.amount);
    const c = one(r.commissions);
    const cAmount = Number(c?.amount ?? 0);
    if (r.status !== 'cancelled') validCount++;
    if (r.status === 'paid') {
      gross += amount;
      paidCount++;
      if (c?.status === 'paid') { commissionsPaid += cAmount; commissionsTotal += cAmount; }
      else if (c?.status === 'pending') { commissionsPending += cAmount; commissionsTotal += cAmount; }
    } else if (r.status === 'pending_payment') {
      receivable += amount;
      commissionsExpected += cAmount;
    }
  }

  return {
    gross: r2(gross),
    paidCount,
    validCount,
    receivable: r2(receivable),
    commissionsTotal: r2(commissionsTotal),
    commissionsPaid: r2(commissionsPaid),
    commissionsPending: r2(commissionsPending),
    commissionsExpected: r2(commissionsExpected),
    net: r2(gross - commissionsTotal),
    ticket: paidCount ? r2(gross / paidCount) : 0,
  };
}

export function projection(value: number, elapsed: number, daysInMonth: number) {
  if (elapsed <= 0) return { dailyAvg: 0, projected: 0 };
  const dailyAvg = value / elapsed;
  return { dailyAvg: r2(dailyAvg), projected: r2(dailyAvg * daysInMonth) };
}

export type CostRow = { amount: number | string; cost_date: string; recurrence: 'none' | 'monthly'; ends_on: string | null };

export function costsInPeriod(rows: CostRow[], period: Period) {
  let total = 0;
  for (const c of rows) {
    const a = Number(c.amount);
    if (c.recurrence === 'none') {
      if (c.cost_date >= period.start && c.cost_date < period.end) total += a;
    } else if (c.cost_date < period.end && (!c.ends_on || c.ends_on >= period.start)) {
      total += a;
    }
  }
  return r2(total);
}

export function dailyRevenue(rows: SaleLite[], period: Period) {
  const days = Array.from({ length: period.daysInMonth }, (_, i) => ({ dia: String(i + 1).padStart(2, '0'), valor: 0 }));
  for (const r of rows) {
    if (r.status !== 'paid') continue;
    const d = Number(r.sold_at.slice(8, 10));
    if (days[d - 1]) days[d - 1].valor = r2(days[d - 1].valor + Number(r.amount));
  }
  return days;
}
