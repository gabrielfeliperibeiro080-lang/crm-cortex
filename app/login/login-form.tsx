'use client';

import { useActionState } from 'react';
import { login } from './actions';
import type { LoginState } from './types';
import styles from './login.module.css';

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  const error = state?.error ?? initialError;

  return (
    <form action={action} className={styles.form} noValidate>
      <label className={styles.field}>
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="username" inputMode="email" required />
      </label>
      <label className={styles.field}>
        <span>Senha</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
