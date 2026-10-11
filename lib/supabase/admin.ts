import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Cliente com service_role: IGNORA o RLS. Use somente em Server Actions
 * depois de validar que o usuário logado é super_admin.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente. Configure no .env.local e na Vercel.');
  return createClient(env.supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
