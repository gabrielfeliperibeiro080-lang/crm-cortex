'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { UFS } from '@/lib/format';
import { requestAccess } from './actions';
import type { RequestState } from './types';
import styles from '../login/login.module.css';

export function RequestForm() {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestAccess, null);

  if (state?.ok) {
    return (
      <div>
        <p className={styles.ok} role="status">
          Solicitação enviada! A Córtex vai analisar seu pedido e entrar em contato pelo WhatsApp ou e-mail informado.
        </p>
        <Link className={styles.back} href="/login">Voltar para o login</Link>
      </div>
    );
  }

  return (
    <form action={action} className={styles.form} noValidate>
      <label className={styles.field}><span>Nome completo</span><input name="full_name" autoComplete="name" required maxLength={120} /></label>
      <label className={styles.field}><span>E-mail</span><input name="email" type="email" autoComplete="email" inputMode="email" required /></label>
      <label className={styles.field}><span>WhatsApp</span><input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(14) 99999-0000" required /></label>
      <div className={styles.row}>
        <label className={styles.field}><span>Cidade</span><input name="city" autoComplete="address-level2" maxLength={100} /></label>
        <label className={styles.field}><span>Estado</span>
          <select name="state" defaultValue=""><option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </label>
      </div>
      <label className={styles.field}><span>Conte um pouco sobre você (opcional)</span><textarea name="message" maxLength={1000} rows={3} /></label>

      {/* isca anti-robô: invisível para pessoas */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
        <label>Não preencha<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {state?.error && <p className={styles.error} role="alert">{state.error}</p>}

      <button className={styles.submit} type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Solicitar cadastro'}</button>
      <Link className={styles.back} href="/login">Já tenho acesso · Entrar</Link>
    </form>
  );
}
