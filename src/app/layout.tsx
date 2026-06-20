import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Stonks — Congress Trades',
  description: 'US Congress & Senate stock trades, with track record (win rate / alpha vs S&P).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="inner">
            <h1>📈 Stonks</h1>
            <nav>
              <Link href="/">Home</Link>
              <Link href="/trades">Trades</Link>
              <Link href="/stocks">Stocks</Link>
              <Link href="/signals">Signals</Link>
              <Link href="/politicians">Politicians</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/compare">Compare</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
