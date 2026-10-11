import { redirect } from 'next/navigation';

/** Redireciona de volta para a página com uma mensagem (?ok= ou ?erro=). */
export function flash(path: string, kind: 'ok' | 'erro', message: string): never {
  const url = new URL(path, 'http://local');
  url.searchParams.delete('ok');
  url.searchParams.delete('erro');
  url.searchParams.set(kind, message);
  redirect(url.pathname + url.search);
}

/** Aceita só caminhos internos da própria área (evita open redirect). */
export function safeBack(value: string, prefix: '/admin' | '/parceiro', fallback: string) {
  return value.startsWith(prefix) && !value.startsWith('//') && !value.includes('://') ? value : fallback;
}
