import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireProfile } from '@/lib/auth';
import { adminNav } from '@/lib/nav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile('super_admin');
  return (
    <AppShell items={adminNav} userName={profile.full_name} roleLabel="Super Admin">
      {children}
    </AppShell>
  );
}
