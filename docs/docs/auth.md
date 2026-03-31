# Authentication

DEX Board supports two optional authentication methods. Both can be used independently or together.

## Basic auth

HTTP basic auth protects all routes (dashboard UI and API) when configured. The browser prompts for credentials before loading anything.

### Setup

Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` in your `.env` file and run `bash setup/deploy.sh`. If you set a username but leave the password empty, the deploy script generates a random password and prints it once.

### Disabling

Leave `BASIC_AUTH_USER` empty or unset. The middleware skips authentication automatically.

## Cloudflare Access

[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/) provides SSO-based access control via JWT validation.

### How it works

When `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are configured, the Worker middleware validates the `Cf-Access-Jwt-Assertion` header on every `/api/*` request against Cloudflare's public JWKS endpoint.

### Setup

1. Go to **Cloudflare Zero Trust** > **Access** > **Applications**
2. Create a new **Self-hosted** application pointing to your Worker URL
3. Set up an access policy (e.g. allow specific email domains)
4. Copy the **Application Audience (AUD) tag**
5. Add to your `.env`:

```bash
CF_ACCESS_TEAM_DOMAIN=yourorg.cloudflareaccess.com
CF_ACCESS_AUD=your-aud-tag
```

Then run `bash setup/deploy.sh` to push the secrets.

### Key caching

Public keys from `https://{team}/cdn-cgi/access/certs` are cached in memory for 5 minutes to reduce round-trips. This endpoint only serves public keys — no sensitive data is involved.

### Disabling

Leave `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` empty or unset. The middleware skips validation automatically.
