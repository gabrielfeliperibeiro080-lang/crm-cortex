import type { Metadata } from 'next';
import { RequestForm } from './request-form';
import styles from '../login/login.module.css';

export const metadata: Metadata = { title: 'Quero ser parceiro' };

export default function SignupPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brand}>
        <div className={styles.logo}>C</div>
        <div>
          <p className={styles.eyebrow}>CÓRTEX PARTNERS</p>
          <h1>Seja parceiro da Córtex Studios</h1>
          <p className={styles.lead}>Indique e venda soluções para oficinas e centros automotivos e receba comissão por cada venda confirmada.</p>
        </div>
        <p className={styles.foot}>Córtex Studios</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <h2>Solicitar cadastro</h2>
          <p className={styles.sub}>Seu acesso é liberado após aprovação da Córtex.</p>
          <RequestForm />
        </div>
      </section>
    </main>
  );
}
