# 📈 Stonks

Plataforma **100% gratuita** para visualizar as trades de ações de membros do
Congresso e Senado dos EUA, com **track record** (win rate / alpha vs S&P) de
cada político.

Stack: **GitHub** (dados + CI) · **Supabase** (Postgres) · **Vercel** (Next.js).
Nenhuma assinatura paga é necessária.

---

## Como os dados chegam aqui

A divulgação é obrigatória pelo **STOCK Act**: todo membro reporta transações
acima de US$ 1.000 em até 30–45 dias (os *Periodic Transaction Reports*).
A fonte oficial (`disclosures-clerk.house.gov`, `efdsearch.senate.gov`) é crua e
cheia de PDFs escaneados. Em vez de raspar isso, consumimos JSONs públicos já
normalizados:

- **Senado:** `timothycarambat/senate-stock-watcher-data`
- **Câmara:** `pastrosd/Congress-Trades`

> ⚠️ Verifique as URLs em `.env.example` antes de rodar — esses repositórios
> ocasionalmente mudam a estrutura de pastas. São configuráveis por env var.

### Limitações honestas (importantes)

- **Só faixa de valor.** A lei divulga *faixas* (ex: $1k–$15k), nunca o valor
  exato. Todo cálculo de portfólio é estimativa (usamos a faixa, não um ponto fixo).
- **Atraso de divulgação.** Há semanas entre a trade e a publicação — por isso a
  coluna *Delay*. Delay alto ≈ sinal inútil para copiar.
- **Alpha é aproximado.** Calculamos retorno do ativo vs S&P da data da
  transação até o preço mais recente. É uma régua honesta para comparar
  políticos, não um backtest de estratégia.

---

## Arquitetura

```
JSON público (GitHub) ─┐
                       ├─> scripts/ingest.mjs ───────> Supabase: politicians, trades
Stooq (preços, free) ──┴─> scripts/fetch-prices.mjs ─> Supabase: prices
                          scripts/compute-performance.mjs ─> Supabase: trade_performance
                                                            │
GitHub Action (cron diário) orquestra os 3 scripts ────────┘
                                                            │
Next.js (Vercel) lê via Supabase (anon, RLS) <─────────────┘
```

| Tabela | Conteúdo |
|---|---|
| `politicians` | membros (id slug, câmara, partido, estado) |
| `trades` | transações + `disclosure_delay_days` (coluna gerada) |
| `prices` | fechamento diário (Stooq), por ticker |
| `trade_performance` | retorno, alpha e win por trade |
| `politician_track_record` (view) | agregado por político |

---

## Setup

### 1. Supabase
1. Crie um projeto free em supabase.com.
2. SQL Editor → cole e rode [`supabase/schema.sql`](supabase/schema.sql).
3. Settings → API: copie a **URL**, a **anon key** e a **service_role key**.

### 2. Local
```bash
cp .env.example .env        # preencha as chaves
npm install
npm run pipeline            # ingest + preços + performance
npm run dev                 # http://localhost:3000
```

### 3. Vercel
1. Importe o repo na Vercel.
2. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy.

### 4. Atualização automática (GitHub Actions)
Em Settings → Secrets and variables → Actions:
- **Secrets:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Variables:** `SENATE_TRADES_URL`, `HOUSE_TRADES_URL` (opcional `PRICE_BENCHMARK_TICKER`)

O workflow [`pipeline.yml`](.github/workflows/pipeline.yml) roda todo dia às 09:00 UTC.

---

## Páginas

- `/` — trades mais recentes (com delay de divulgação)
- `/politicians` — lista de membros
- `/politicians/[id]` — perfil: alpha, win rate, delay médio e histórico
- `/leaderboard` — ranking por alpha agregado (mín. 5 trades)

---

## Roadmap (ideias)

- Filtros no frontend (partido, câmara, ticker, tipo, faixa de valor)
- Página por ticker (quem mais negocia)
- Gráfico de valor estimado de portfólio ao longo do tempo
- Janelas de retorno alternativas (30/90 dias pós-trade, não só "até hoje")
