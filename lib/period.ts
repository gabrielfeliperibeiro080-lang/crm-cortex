const TZ = 'America/Sao_Paulo';

export function todaySP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const currentMonthKey = () => todaySP().slice(0, 7);

export type Period = {
  key: string;
  start: string; // primeiro dia (inclusivo)
  end: string; // primeiro dia do mês seguinte (exclusivo)
  label: string;
  daysInMonth: number;
  elapsed: number; // dias decorridos usados na projeção
  isCurrent: boolean;
};

export function getPeriod(param?: string): Period {
  const current = currentMonthKey();
  const key = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : current;
  const [y, m] = key.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let elapsed = 0;
  if (key === current) elapsed = Number(todaySP().slice(8, 10));
  else if (key < current) elapsed = daysInMonth;
  return { key, start: `${key}-01`, end, label, daysInMonth, elapsed, isCurrent: key === current };
}

export function monthOptions(count = 12): { value: string; label: string }[] {
  const [y, m] = currentMonthKey().split('-').map(Number);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}
