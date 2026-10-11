'use client';

import { useActionState, useEffect, useState } from 'react';
import { savePixKey, savePartnerRegion } from '@/app/parceiro/actions';
import { UFS } from '@/lib/format';
import type { SaveState } from '@/lib/types';

const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Aleatória' },
];

export function PixKeyForm({
  currentKey,
  currentType,
}: {
  currentKey: string | null;
  currentType: string | null;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePixKey, null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={action} className="form-grid" style={{ maxWidth: 460 }}>
      <label className="field">
        <span>Tipo da chave</span>
        <select name="pix_key_type" defaultValue={currentType ?? ''}>
          <option value="">Selecione…</option>
          {PIX_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Chave Pix</span>
        <input name="pix_key" defaultValue={currentKey ?? ''} maxLength={150} placeholder="Sua chave Pix" />
      </label>
      {state?.error && <p className="flash flash-bad" style={{ margin: 0, gridColumn: '1 / -1' }}>{state.error}</p>}
      {saved && <p className="flash flash-good" style={{ margin: 0, gridColumn: '1 / -1' }}>Chave Pix salva ✓</p>}
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="btn btn-sm" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar chave Pix'}
        </button>
      </div>
    </form>
  );
}

export function RegionForm({
  currentCity,
  currentState,
}: {
  currentCity: string | null;
  currentState: string | null;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePartnerRegion, null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={action} className="form-grid" style={{ maxWidth: 460 }}>
      <label className="field">
        <span>Cidade</span>
        <input name="city" defaultValue={currentCity ?? ''} maxLength={100} placeholder="Sua cidade" />
      </label>
      <label className="field">
        <span>Estado</span>
        <select name="state" defaultValue={currentState ?? ''}>
          <option value="">—</option>
          {UFS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </label>
      {state?.error && <p className="flash flash-bad" style={{ margin: 0, gridColumn: '1 / -1' }}>{state.error}</p>}
      {saved && <p className="flash flash-good" style={{ margin: 0, gridColumn: '1 / -1' }}>Região salva ✓</p>}
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="btn btn-sm" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar região'}
        </button>
      </div>
    </form>
  );
}
