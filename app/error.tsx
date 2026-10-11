'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Algo deu errado</h1>
        <p style={{ color: '#6b7a93', margin: '0 0 18px' }}>Não foi possível carregar esta página. Tente novamente; se persistir, avise a Córtex.</p>
        {process.env.NODE_ENV !== 'production' && <pre style={{ textAlign: 'left', fontSize: 12, whiteSpace: 'pre-wrap', color: '#b42318' }}>{error.message}</pre>}
        <button className="btn" onClick={() => reset()}>Tentar novamente</button>
      </div>
    </main>
  );
}
