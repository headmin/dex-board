# Patch velocity — what's still missing

The Patch velocity page is built to a measurement spec (design 6b): explicit
clocks, a survival view instead of a mean, six owned stages, per-timestamp
evidence grades, and an explicit denominator. This document is the honest
inventory of the inputs that spec needs which the pipeline **does not collect
yet**, what each gap costs, and the exact instrumentation that closes it.

The rule the page follows in the meantime: a number that can't be computed is
shown as *not instrumented* with its reason — never estimated, never faked.

## What we have today

| Input | Source | Quality |
|---|---|---|
| Patch transitions (`days_to_patch`) | `dex_patch_events` (ClickPipe MV over osquery inventory diffs) | poll-bounded, ±1h |
| t₀ = fleet-first sighting of a version | derived inside the MV | shared clock for every event |
| Vendor release timestamps | FMA RSS feed (`fma_releases`) | matched titles only |
| Manifest changes | GitOps changelog (git log of `fleetdm/fleet` → `it-and-security/`) | commit time = merge time (main-branch history) |
| Hardware / hostname join | `hardware_inventory` | good |
| Per-host composite score history | scoring CTE, 30d time travel | good |

Everything on the page is computed from these. The consequences:

- **Every t₁ is poll-bounded.** The evidence-grade card reads "Inventory diff
  100% · ±1h" because that is the truth.
- **Every figure is conditional on patching.** A host still on the old build
  produces no event and is invisible. Real MTTP is worse than shown, never
  better — the page says so under "Who is in the count".
- **Elapsed time is wall clock.** A laptop in a drawer reads as a slow patch.

## The gaps, ranked by what they unlock

### 1. The relaunch gap — patched on disk ≠ patched in memory

**Costs us:** the single largest stage of real exposure (design est. ~29% of
the interval) is invisible; every on-disk install is counted as patched, which
flatters every number on the page. This is the argument for a DEX board over a
vulnerability dashboard, and we can't make it yet.

**Closes it:** one osquery join in the DEX pack, snapshot cadence is fine:

```sql
-- app relaunch gap: old build still in memory
SELECT p.pid, p.name, p.path, p.start_time, f.mtime
FROM processes p JOIN file f ON f.path = p.path
WHERE f.mtime > p.start_time;

-- OS staged but not rebooted (macOS)
-- SystemVersion.plist mtime vs boot time
SELECT f.mtime AS staged_at, (SELECT total_seconds FROM uptime) AS uptime_s
FROM file f WHERE f.path = '/System/Library/CoreServices/SystemVersion.plist';
```

**Server side:** lands as a per-host boolean + lag; feeds the "Patched on
disk, old build still running" card and moves those hosts back into the
unpatched column everywhere.

### 2. Real install timestamps — `installed_at` with an evidence grade

**Costs us:** ±1h error bars on every t₁ (±24h once Windows joins — wider
than the whole macOS p50 in the design's data). No way to separate "installed
Tuesday, seen Wednesday" from "installed Wednesday".

**Closes it, per platform:**

```sql
-- macOS: on-disk replacement time, independent of poll cadence
SELECT a.bundle_identifier, a.bundle_short_version, a.bundle_version,
       a.path, f.mtime AS installed_at, f.btime, a.last_opened_time
FROM apps a
JOIN file f ON f.path = a.path || '/Contents/Info.plist';

-- macOS pkg titles: authoritative receipt
SELECT package_id, version, install_time FROM package_receipts;

-- Linux rpm: free
SELECT name, version, install_time FROM rpm_packages;
```

- **Windows:** `programs.install_date` is day-granularity — subscribe to
  MsiInstaller events 1033/1034 via `windows_events` for real timestamps;
  `patches` for KB-level. deb has nothing: fall back to mtime on
  `/var/lib/dpkg/info/<pkg>.list`.

**Server side:** `patch_transitions` gains an `evidence` column
(`receipt | eventlog | mtime | poll_bound`) so grades are reported per row and
**never averaged together**. The evidence card is already built to render this
mix.

### 3. The eligible cohort at t₀ — the denominator

**Costs us:** the spec's denominator is "held an affected version at t₀".
Without per-host version observations we can't count the still-vulnerable or
carry right-censored hosts (offline, left the fleet), so no true Kaplan–Meier
— the curve on the page is empirical and conditional on patching, and labeled
as such. Fresh installs are already excluded by construction (a transition
requires a from-version).

**Closes it:** a periodic per-host software snapshot (title, version,
observed_at) — the `software_observations` table from the spec. osquery
already reports this data; the gap is retention shape in ClickHouse, not
collection.

### 4. Host availability — online-time as the elapsed basis

**Costs us:** wall-clock elapsed punishes offline hosts; "days of host online
time since t₀" is the fair clock and the spec's default. Also needed to
distinguish "never online during the window" (not a patch failure) from
"online and unpatched" (a real one).

**Closes it:** a `host_availability(host_id, day, online_seconds)` rollup —
derivable from check-in cadence already flowing through the pipe (distinct
hours with any telemetry per host per day is a serviceable first cut).

### 5. Urgency / severity feed

**Costs us:** the page's scope chip can only say "all patches"; a CVE-carrying
browser fix and a cosmetic point release weigh the same. The 6b "Security
fixes" scope filter needs `release_events` carrying `cves, cvss, epss,
requires_restart`.

**Closes it:** enrich the FMA feed side. For FMA titles the manifest git
history *is* a timestamped, sha256-pinned release feed — no scraping needed.
NVD mapping is known-bad for fixed-in ranges; treat CVE joins as advisory.

### 6. Teams / rings

**Costs us:** "who waits longest" is by hardware model; the design's per-team
survival split and ring-aware rollout stages need a team/ring label per host.

**Closes it:** Fleet team membership is in the events (`team-XXX` on osquery
event names — the fleet filter already parses it); a ring label would come
from GitOps targeting. Mostly a join, not new collection.

### 7. Fleet-side install records (to verify, not assume)

The spec's stages 4–5 (targeted → install attempted → verified) may already
exist server-side: **check whether Fleet's software-install records for FMA
and self-service installs expose attempted/completed timestamps.** If they do,
those two stages are free and osquery only confirms.

## Design principles the additions must keep

- **osquery stays dumb.** Raw version strings and raw timestamps; every
  comparison happens server-side so history can be reparsed when the version
  parser improves (Chrome, Zoom and Slack disagree on `bundle_short_version`
  vs `bundle_version` — canonical parsing lives in ClickHouse with per-title
  overrides).
- **Partition on event time, not ingest time.** First-fixed via
  `argMin(installed_at)` so a host reporting late can't corrupt a closed week.
- **The mean stays unreported.** Adoption is a heavy-tailed survival process;
  p50/p90/p95 and day-1/3/7/14 coverage, censoring carried once countable.
- **Evidence grades never mix.** A ±24h poll-bounded Windows timestamp is
  never averaged with a ±2m receipt.
