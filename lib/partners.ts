import type { SupabaseClient } from '@supabase/supabase-js';

export type PartnerDetail = {
  id: string;
  name: string;
  pix_key: string | null;
  pix_key_type: string | null;
};

/** Mapa id -> nome dos parceiros (somente Super Admin enxerga todos pelo RLS). */
export async function partnerNames(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'partner');
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
}

/** Mapa id -> detalhes com Pix dos parceiros (somente Super Admin). */
export async function partnerDetails(supabase: SupabaseClient): Promise<Map<string, PartnerDetail>> {
  const [{ data: profiles, error: pErr }, { data: partners, error: partErr }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'partner'),
    supabase.from('partners').select('id, pix_key, pix_key_type'),
  ]);
  if (pErr) throw new Error(pErr.message);
  if (partErr) throw new Error(partErr.message);

  const pixMap = new Map((partners ?? []).map((pt) => [pt.id as string, pt]));
  const map = new Map<string, PartnerDetail>();
  for (const prof of profiles ?? []) {
    const pt = pixMap.get(prof.id);
    map.set(prof.id, {
      id: prof.id,
      name: prof.full_name,
      pix_key: pt?.pix_key ?? null,
      pix_key_type: pt?.pix_key_type ?? null,
    });
  }
  return map;
}

