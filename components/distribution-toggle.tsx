'use client';

import { useTransition } from 'react';
import { setDistributionMode } from '@/app/crm/actions';

export function DistributionToggle({ mode }: { mode: 'manual' | 'auto' }) {
  const [pending, startT] = useTransition();

  function toggle() {
    const next = mode === 'manual' ? 'auto' : 'manual';
    startT(async () => {
      await setDistributionMode(next);
    });
  }

  const isAuto = mode === 'auto';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
        Distribuição automática
      </span>
      <button
        id="distribution-toggle"
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isAuto}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 14px',
          borderRadius: 9999,
          border: `1px solid ${isAuto ? 'var(--good)' : 'var(--border)'}`,
          cursor: pending ? 'wait' : 'pointer',
          fontWeight: 600,
          fontSize: 12,
          background: isAuto ? 'var(--good)' : 'var(--surface)',
          color: isAuto ? '#fff' : 'var(--text-2)',
          transition: 'all .2s',
          outline: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isAuto ? '#fff' : 'var(--text-3)',
          }}
        />
        {pending ? '…' : isAuto ? 'Ativa' : 'Desativada'}
      </button>
    </div>
  );
}
