# DEX Board

Proof of concept for a Digital Employee Experience (DEX) dashboard built on Cloudflare Workers and ClickHouse Cloud.

All features are based on telemetry collected from devices managed by [Fleet](https://fleetdm.com). A Vue 3 frontend with a Hono API worker queries ClickHouse for fleet-wide device data ingested via Fleet's osquery queries.

## Quick start

```sh
npm install
cp .env.example .env   # fill in secrets
npm run dev             # Vite dev server
npm run dev:worker      # Worker dev server
```

## Deploy

```sh
./setup/setup-clickhouse.sh   # apply schema
./setup/deploy.sh             # push secrets + deploy worker
```

See `docs/` for full setup and query documentation.
