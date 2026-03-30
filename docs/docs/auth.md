# Authentication

DEX Board supports optional authentication via [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/).

## How it works

When `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are configured, the Worker middleware validates the `Cf-Access-Jwt-Assertion` header on every `/api/*` request against Cloudflare's public JWKS endpoint.

If neither variable is set, auth is skipped (local development mode).

## Setup

1. Go to **Cloudflare Zero Trust** > **Access** > **Applications**
2. Create a new **Self-hosted** application pointing to your Worker URL
3. Set up an access policy (e.g. allow specific email domains)
4. Copy the **Application Audience (AUD) tag**
5. Set the variables:

```bash
npx wrangler secret put CF_ACCESS_AUD
# paste the AUD tag

# Team domain is in your Zero Trust dashboard URL
# e.g. "yourorg.cloudflareaccess.com"
```

Or set `CF_ACCESS_TEAM_DOMAIN` in `wrangler.toml` (not sensitive) and `CF_ACCESS_AUD` as a secret.

## Key caching

Public keys from `https://{team}/cdn-cgi/access/certs` are cached in memory for 5 minutes to reduce round-trips. This endpoint only serves public keys — no sensitive data is involved.

## Disabling auth

Leave `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` empty or unset. The middleware skips validation automatically.
