# Mirror of the upstream DEX query pack — read it here, apply it from upstream

`dex-queries.yml` in this directory is a **verbatim, byte-for-byte copy** of

```
fleetdm/fleet : it-and-security/lib/all/reports/dex-queries.yml
```

captured at commit `dd93e8f` (2026-06-01) and copied on 2026-08-28. It is kept
so you can read and diff the queries the dashboard scores from without cloning
the fleet repo. It is **not** the ingest source, and applying it is not the
supported path — see below.

## Applying: use upstream, not this copy

Upstream is the source of truth. This mirror has no mechanism to stay current,
so it will silently lag the moment someone edits the pack in fleet.

```bash
# From a clone of fleetdm/fleet:
fleetctl apply -f it-and-security/lib/all/reports/dex-queries.yml

# Or directly:
curl -fsSL https://raw.githubusercontent.com/fleetdm/fleet/main/it-and-security/lib/all/reports/dex-queries.yml \
  | fleetctl apply -f -
```

See `SETUP.md` §3.1 for the full flow and §3.2a for the post-setup sanity check
that asserts the scoring tables are non-empty.

## Why this file must stay verbatim

This directory previously held four *reduced* per-platform snapshots
(`all/`, `macos/`, `linux/`, `windows/`) written against an older query naming
scheme (`dex_device_health_macos`) that no longer exists upstream, where the
live pack names queries `DEX - Hardware experience - Device health`. Those
names are not cosmetic: the ClickHouse materialized views match on them
(`WHERE name ILIKE '%Hardware experience - device health%'` in
`setup/setup-clickhouse-firehose.sh`), so the old snapshots could not have
produced the tables the score reads even if applied.

They also caused a concrete error. The reduced macOS snapshot omitted
`cycle_count` from its battery query, which led to the conclusion that battery
cycles were not collected at all — when the live pack collects them on every
host. A reduced copy that looks authoritative is worse than no copy.

So: keep this a straight `cp`. Do not trim it, do not split it per platform,
and do not hand-edit it. To re-sync:

```bash
cp /path/to/fleet/it-and-security/lib/all/reports/dex-queries.yml \
   setup/fleet-query-packs/dex-queries.yml
```

Then update the commit and date at the top of this file.
