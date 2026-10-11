'use client';

import { useActionState, useState } from 'react';
import { createSale } from '../../actions';
import { PAYMENT_METHODS, SEGMENTS, UFS, brl } from '@/lib/format';
import type { FormState } from '@/lib/types';

export type ServiceOption = {
  id: string;
  name: string;
  price: number;
  commission_type: 'percent' | 'fixed';
  commission_percent: number;
  commission_fixed: number;
};

export type SaleDefaults = {
  name: string;
  responsible_name: string;
  whatsapp: string;
  email: string;
  city: string;
  state: string;
  segment: string;
};

export function SaleForm({ services, today, defaults, leadId }: { services: ServiceOption[]; today: string; defaults?: SaleDefaults; leadId?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createSale, null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const svc = services.find((s) => s.id === serviceId);
  const commission = svc
    ? svc.commission_type === 'percent'
      ? Math.round(svc.price * svc.commission_percent) / 100
      : Math.min(svc.commission_fixed, svc.price)
    : 0;

  return (
    <form action={action} noValidate>
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}
      <div className="form-grid">
        <p className="form-section full">Dados do estabelecimento</p>
        <label className="field full">
          <span>Nome do estabelecimento</span>
          <input name="name" defaultValue={defaults?.name} required maxLength={120} autoComplete="off" />
        </label>
        <label className="field">
          <span>Nome do responsável</span>
          <input name="responsible_name" defaultValue={defaults?.responsible_name} required maxLength={120} autoComplete="off" />
        </label>
        <label className="field">
          <span>WhatsApp</span>
          <input name="whatsapp" type="tel" inputMode="tel" defaultValue={defaults?.whatsapp} placeholder="(14) 99999-0000" required />
        </label>
        <label className="field">
          <span>E-mail</span>
          <input name="email" type="email" inputMode="email" defaultValue={defaults?.email} required />
        </label>
        <label className="field">
          <span>Segmento</span>
          <select name="segment" defaultValue={defaults?.segment || 'mecanica'} required>
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Cidade</span>
          <input name="city" defaultValue={defaults?.city} required maxLength={100} autoComplete="off" />
        </label>
        <label className="field">
          <span>Estado</span>
          <select name="state" defaultValue={defaults?.state || 'SP'} required>
            {UFS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>

        <p className="form-section full" style={{ marginTop: 14 }}>Dados da venda</p>
        <label className="field">
          <span>Produto / plano</span>
          <select name="service_id" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Valor</span>
          <input value={brl(svc?.price ?? 0)} readOnly aria-readonly />
          <small>Definido pelo cadastro do produto. Sua comissão estimada: {brl(commission)}.</small>
        </label>
        <label className="field">
          <span>Data da venda</span>
          <input name="sold_at" type="date" defaultValue={today} max={today} required />
        </label>
        <label className="field">
          <span>Forma de pagamento</span>
          <select name="payment_method" defaultValue="">
            <option value="">A definir</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <input value="Aguardando pagamento" readOnly aria-readonly />
          <small>O pagamento é confirmado pela Córtex.</small>
        </label>
        <label className="field full">
          <span>Observações</span>
          <textarea name="notes" maxLength={1000} />
        </label>
      </div>

      {state?.error && (
        <p className="flash flash-bad" role="alert" style={{ marginTop: 18, marginBottom: 0 }}>
          {state.error}
        </p>
      )}

      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending || services.length === 0}>
          {pending ? 'Registrando…' : 'Registrar venda'}
        </button>
      </div>
    </form>
  );
}
