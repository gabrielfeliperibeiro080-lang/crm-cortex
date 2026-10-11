export function friendly(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Erro inesperado.';
  const code = error.code ?? '';
  const msg = error.message ?? '';
  if (code === '23505') return 'Já existe um registro com esses dados.';
  if (code === '23503') return 'Este registro está vinculado a outros dados e não pode ser alterado/removido.';
  if (code === '42501' && /row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para esta ação.';
  if (['P0001', '42501', '22023'].includes(code)) return msg || 'Operação não permitida.';
  return 'Não foi possível concluir a ação. Tente novamente.';
}
