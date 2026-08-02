# ⚠️ Reference only — not the ingest source

These YAML files are **reduced snapshots** kept for reference and diffing.
They do **not** emit the tables the DEX score reads (`os_health`,
`process_health`, `crash_summary`, `crash_detail`, `adoption_gap`,
`vpn_gate`, `wifi_signal`) — applying them silently under-populates the
Performance, Software, and Network categories, and the scorer's `ifNull()`
defaults will mask the gap as "average" rather than "missing".

**To set up a Fleet server for DEX Board, apply the upstream pack instead:**

```bash
# From a clone of fleetdm/fleet:
fleetctl apply -f it-and-security/lib/all/reports/dex-queries.yml

# Or directly:
curl -fsSL https://raw.githubusercontent.com/fleetdm/fleet/main/it-and-security/lib/all/reports/dex-queries.yml \
  | fleetctl apply -f -
```

See `SETUP.md` §3.1 for the full flow and §3.2a for the post-setup sanity
check that asserts the scoring tables are non-empty.
