# DEX Board

Digital Employee Experience dashboard for [Fleet](https://fleetdm.com) — Vue 3 SPA + Hono Cloudflare Worker reading osquery telemetry from ClickHouse.

## Quick start

```sh
npm install
cp .env.example .env       # fill in secrets — see SETUP.md
bash setup/setup.sh        # bootstrap ClickHouse + deploy worker
```

Full from-scratch setup (prerequisites, both ClickHouse instances, Fleet packs, troubleshooting): **[SETUP.md](./SETUP.md)**.

## Local dev

```sh
npm run dev:worker         # worker API on :8787
npm run dev                # Vite dev server on :5173
```
