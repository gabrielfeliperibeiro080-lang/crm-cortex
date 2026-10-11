'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { LoginState } from './types';

const schema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Informe seu e-mail e sua senha.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: 'E-mail ou senha incorretos.' };

  // Só entra quem tem perfil ativo (o admin desativa parceiros por aqui).
  const { data: profile } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: 'Sua conta ainda não foi configurada. Fale com a Córtex.' };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: 'Seu acesso está desativado. Fale com a Córtex.' };
  }

  redirect('/');
}
