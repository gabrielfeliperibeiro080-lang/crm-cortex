import type { ReactNode } from 'react';
import { COMMISSION_STATUS, SALE_STATUS } from '@/lib/format';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return (
    <div className={`flash ${erro ? 'flash-bad' : 'flash-good'}`} role="status">
      {erro ?? ok}
    </div>
  );
}

export type StatItem = { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' };

export function Stats({ items, lead }: { items: StatItem[]; lead?: boolean }) {
  return (
    <section className={`stats${lead ? ' stats-lead' : ''}`}>
      {items.map((i) => (
        <div className="stat" key={i.label}>
          <span className="stat-label">{i.label}</span>
          <strong className="stat-value">{i.value}</strong>
          {i.hint && <small className={`stat-hint ${i.tone ?? ''}`}>{i.hint}</small>}
        </div>
      ))}
    </section>
  );
}

export function Panel({ title, subtitle, action, flush, children }: { title?: string; subtitle?: string; action?: ReactNode; flush?: boolean; children: ReactNode }) {
  return (
    <section className="panel">
      {(title || action) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={`panel-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Badge({ tone, children }: { tone?: 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={`badge${tone ? ` badge-${tone}` : ''}`}>{children}</span>;
}

export function SaleBadge({ status }: { status: string }) {
  const tone = status === 'paid' ? 'good' : status === 'pending_payment' ? 'warn' : 'bad';
  return <Badge tone={tone}>{SALE_STATUS[status] ?? status}</Badge>;
}

export function CommissionBadge({ status }: { status: string }) {
  const tone = status === 'paid' ? 'good' : status === 'pending' ? 'warn' : status === 'cancelled' ? 'bad' : undefined;
  return <Badge tone={tone}>{COMMISSION_STATUS[status] ?? status}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ---------- Filtros (formulário GET, sem JS) ---------- */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <form method="get" className="filters">
      {children}
      <button className="btn btn-ghost btn-sm" style={{ height: 38 }} type="submit">
        Filtrar
      </button>
    </form>
  );
}

export function SelectFilter({ name, label, value, options, allLabel = 'Todos' }: { name: string; label: string; value?: string; options: { value: string; label: string }[]; allLabel?: string }) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select name={name} defaultValue={value ?? ''}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MonthSelect({ value, options, allowAll }: { value: string; options: { value: string; label: string }[]; allowAll?: boolean }) {
  return (
    <label className="filter">
      <span>Período</span>
      <select name="mes" defaultValue={value}>
        {allowAll && <option value="todos">Todo o histórico</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------- Alertas de teste de 24h (Server Component) ---------- */
type TrialAlert = {
  lead: { id: string; name: string; trial_ends_at: string | null };
  alertLevel: '12h' | '6h' | '1h' | 'ended' | null;
};

const ALERT_MESSAGES: Record<NonNullable<TrialAlert['alertLevel']>, (name: string) => string> = {
  '12h':  (n) => `Faltam 12 horas para o término do teste de ${n}.`,
  '6h':   (n) => `O teste de ${n} termina em aproximadamente 6 horas. Faça o acompanhamento.`,
  '1h':   (n) => `Última hora do teste de ${n}. Entre em contato para conduzir o fechamento.`,
  ended:  (n) => `O teste de ${n} terminou. Registre o resultado do acompanhamento.`,
};

export function TrialAlerts({ alerts }: { alerts: TrialAlert[] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      {alerts.map(({ lead, alertLevel }) => {
        if (!alertLevel) return null;
        const tone = alertLevel === 'ended' || alertLevel === '1h' ? 'flash-bad' : 'flash-warn';
        return (
          <div key={lead.id} className={`flash ${tone}`} role="alert" style={{ margin: 0 }}>
            {ALERT_MESSAGES[alertLevel](lead.name)}
          </div>
        );
      })}
    </div>
  );
}
