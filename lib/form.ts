export const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

/** Aceita "80", "80.5" e "80,50". Retorna NaN se inválido. */
export function num(fd: FormData, key: string) {
  const raw = str(fd, key).replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.');
  return raw === '' ? NaN : Number(raw);
}

export const checked = (fd: FormData, key: string) => fd.get(key) === 'on';
