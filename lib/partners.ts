import type { SupabaseClient } from '@supabase/supabase-js';

/** Mapa id -> nome dos parceiros (somente Super Admin enxerga todos pelo RLS). */
export async function partnerNames(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'partner');
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
}
