'use client';
import { useEffect, useRef } from 'react';

// Embed gratuito do TradingView (Advanced Chart). Carrega 100% no navegador do
// visitante via script oficial — não depende do nosso backend.
export default function TradingViewChart({ symbol, height = 460 }: { symbol: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = '<div class="tradingview-widget-container__widget"></div>';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'br',
      hide_side_toolbar: false,
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => { container.innerHTML = ''; };
  }, [symbol]);

  return (
    <div className="chartbox">
      <h3>Cotação — TradingView</h3>
      <div className="tradingview-widget-container" ref={ref} style={{ height, width: '100%' }} />
    </div>
  );
}
