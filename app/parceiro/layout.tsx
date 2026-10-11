import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireProfile } from '@/lib/auth';
import { partnerNav } from '@/lib/nav';

export default async function PartnerLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile('partner');
  return (
    <AppShell items={partnerNav} userName={profile.full_name} roleLabel="Parceiro">
      {children}
    </AppShell>
  );
}
