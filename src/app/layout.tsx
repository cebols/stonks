import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Stonks — Congress Trades',
  description: 'Trades de ações do Congresso e Senado dos EUA, com track record (win rate / alpha vs S&P).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="site">
          <div className="inner">
            <h1>📈 Stonks</h1>
            <nav>
              <Link href="/">Home</Link>
              <Link href="/trades">Trades</Link>
              <Link href="/stocks">Ações</Link>
              <Link href="/signals">Sinais</Link>
              <Link href="/politicians">Políticos</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/compare">Comparar</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
