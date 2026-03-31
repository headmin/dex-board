---
icon: lucide/rocket
---

# DEX Board

Digital Employee Experience analytics dashboard powered by Fleet, ClickHouse, and Cloudflare Workers.

## What is DEX Board?

DEX Board is a real-time analytics dashboard that visualises endpoint telemetry collected by [Fleet](https://fleetdm.com) and stored in [ClickHouse](https://clickhouse.com). It runs entirely on [Cloudflare Workers](https://workers.cloudflare.com) — no servers to manage.

## Architecture

``` mermaid
graph LR
  A[osquery agents] --> B[Fleet];
  B --> C[ClickHouse];
  C --> D[Cloudflare Worker];
  D --> E[Vue dashboard];
```

| Component | Role |
|---|---|
| **Fleet** | Collects osquery data from endpoints |
| **ClickHouse** | Stores and queries log data at scale |
| **Cloudflare Worker** | Secure API proxy with 88 named queries |
| **Vue 3 + ECharts** | Interactive dashboard UI |

## Quick start

```bash
# Clone
git clone https://github.com/headmin/dex-board.git
cd dex-board

# Install
npm install

# Create .env from template and fill in values
cp .env.example .env

# Apply ClickHouse schema
bash setup/setup-clickhouse.sh

# Bootstrap Fleet query packs
bash setup/bootstrap.sh --skip-clickhouse

# Deploy to Cloudflare (pushes secrets + builds + deploys)
bash setup/deploy.sh
```

See the [Setup guide](setup.md) for full details, including 1Password integration.

## Features

- **Experience scoring** — Fleet-wide grades (A–F) across performance, security, network, software, and device health
- **Device drill-down** — Click any device in the heatmap to see full history
- **GitOps timeline** — Correlate Fleet config changes with score impact
- **88 named queries** — No raw SQL in the browser; all queries are parameterised and validated server-side
- **Basic auth** — Optional HTTP basic auth to protect the dashboard
- **Cloudflare Access auth** — Optional JWT validation for access control
- **Workers Council mode** — Privacy-preserving view that hides per-device drill-down
