import { redirect } from 'next/navigation';
import { homeFor, requireProfile } from '@/lib/auth';

export default async function Home() {
  const profile = await requireProfile();
  redirect(homeFor(profile.role));
}
