import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'super_admin' | 'partner';

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  active: boolean;
};

export function homeFor(role: Role) {
  return role === 'super_admin' ? '/admin' : '/parceiro';
}

/** Usuário autenticado (validado no servidor) + perfil. Uma consulta por requisição. */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, active')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile: (data as Profile | null) ?? null };
});

/**
 * Garante login, perfil ativo e (opcionalmente) o papel exigido.
 * A autorização real dos dados está no RLS; isto só decide o que mostrar/rotear.
 */
export async function requireProfile(role?: Role): Promise<Profile> {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect('/login');
  if (!profile) redirect('/auth/sair?motivo=sem-perfil');
  if (!profile.active) redirect('/auth/sair?motivo=inativo');
  if (role && profile.role !== role) redirect(homeFor(profile.role));
  return profile;
}
