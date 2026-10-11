import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Entrar' };

const MENSAGENS: Record<string, string> = {
  inativo: 'Seu acesso está desativado. Fale com a Córtex.',
  'sem-perfil': 'Sua conta ainda não foi configurada. Fale com a Córtex.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.brand}>
        <div className={styles.logo}>C</div>
        <div>
          <p className={styles.eyebrow}>CÓRTEX PARTNERS</p>
          <h1>Gestão comercial de parceiros</h1>
          <p className={styles.lead}>Registre vendas, acompanhe comissões e tenha clareza do seu desempenho em um só lugar.</p>
        </div>
        <p className={styles.foot}>Córtex Studios</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <h2>Entrar</h2>
          <p className={styles.sub}>Acesso restrito a parceiros autorizados.</p>
          <LoginForm initialError={erro ? MENSAGENS[erro] : undefined} />
          <div className={styles.divider}>ainda não tem acesso?</div>
          <Link className={styles.signup} href="/cadastro">Quero ser parceiro</Link>
        </div>
      </section>
    </main>
  );
}
