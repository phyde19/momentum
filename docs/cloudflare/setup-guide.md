# Cloudflare Setup Guide — Momentum

A practical, step-by-step guide to configuring all Cloudflare services used by
Momentum. Follows Phase 1 of the implementation plan.

Read `understanding-cloudflare.md` first if you want context for *why* each
step exists. This guide focuses on *what to do* and *what state you should be
in* at each checkpoint.

---

## Prerequisites

Before starting, have these ready:

- [ ] A registered domain name (see note below)
- [ ] A Cloudflare account — free tier is sufficient: `https://dash.cloudflare.com/`
- [ ] A GitHub account (used as the identity provider)
- [ ] Your VPS provisioned with Docker and Docker Compose installed
- [ ] The repo cloned to `/opt/momentum` on the VPS, with a `.env` started
      from `.env.example`

**Domain note:** Register anywhere you like (Cloudflare Registrar, Porkbun,
Namecheap). The only requirement is that you can change the domain's nameservers.
Once you point nameservers to Cloudflare, they manage DNS from that point on.
Cloudflare Registrar is the simplest option because delegation is automatic.

---

## Overview: what you're building

By the end of this guide you will have created these Cloudflare objects:

```
Cloudflare account
├── Zone (your domain)
│   └── DNS records (auto-created by tunnel setup)
│       ├── momentum.example.com      CNAME -> tunnel
│       └── momentum-api.example.com  CNAME -> tunnel
│
└── Zero Trust organization
    ├── Identity Provider: GitHub
    ├── Tunnel: momentum
    │   ├── Hostname route: momentum.example.com     -> http://web:5173
    │   └── Hostname route: momentum-api.example.com -> http://api:8000
    ├── Access Application: Momentum Web
    │   └── Policy: allow your email via GitHub
    └── Access Application: Momentum API
        └── Policy: allow your email via GitHub
```

And in your `.env` you will have filled in:

```env
CLOUDFLARE_TEAM_DOMAIN     # from Zero Trust settings
CLOUDFLARE_TUNNEL_TOKEN    # from the tunnel you create
CLOUDFLARE_ACCESS_AUDIENCE # from the Momentum API Access application
```

---

## Dashboard navigation reference

You work in two separate Cloudflare dashboards during setup:

```
Main dashboard  (DNS zones, R2, account settings)
  https://dash.cloudflare.com/

Zero Trust dashboard  (tunnels, access, identity providers)
  https://one.dash.cloudflare.com/
  (also reachable: main dashboard -> Zero Trust in left sidebar)
```

Most of the interesting work happens in Zero Trust. If a specific deep-link
doesn't land correctly due to UI updates, start at `https://one.dash.cloudflare.com/`
and follow the click paths in each step.

---

## Step 1 — Add Your Domain to Cloudflare

**Dashboard:** `https://dash.cloudflare.com/` → Websites

### What to do

1. Click **Add a site**.
2. Enter your root domain — e.g. `example.com`. Do not include a subdomain.
3. Select the **Free** plan and continue.
4. Cloudflare scans and imports any existing DNS records. Review them (usually
   safe to accept as-is) and continue.
5. Cloudflare shows you two nameserver hostnames, e.g.:
   ```
   aria.ns.cloudflare.com
   kurt.ns.cloudflare.com
   ```
6. Log in to your domain registrar and replace existing nameservers with these.
7. Back in Cloudflare, click **Done, check nameservers**.

DNS propagation takes minutes to 48 hours. Cloudflare sends you an email when
the zone is active. The Websites list shows the status as **Active** and an
orange cloud appears next to the domain name.

### Why nameservers and not individual DNS records?

Pointing nameservers to Cloudflare makes them *authoritative* for your domain.
All DNS queries hit Cloudflare's resolvers, which lets them proxy traffic,
auto-create CNAME records when you add tunnel routes, and reflect DNS changes
instantly. If you only add individual records at another registrar, Cloudflare
has no control over the zone.

### Checkpoint

```
✓  Zone status = Active  (orange cloud, "Active" label in Websites list)
✓  DNS tab is visible and editable for the zone
```

---

## Step 2 — Note Your Zero Trust Team Domain

**Dashboard:** Zero Trust → Settings → General (or Custom Pages)

### What to do

1. Open Zero Trust from the main dashboard sidebar.
2. Navigate to **Settings**. Look for **Team domain** — it appears under
   General or Custom Pages depending on the current UI version.
3. If you haven't set up a Zero Trust organization yet, you'll be prompted to
   create one. Choose a short, memorable organization name.
4. Your team domain looks like: `your-org-name.cloudflareaccess.com`

### What goes in `.env`

```env
CLOUDFLARE_TEAM_DOMAIN=your-org-name.cloudflareaccess.com
```

The API constructs the JWT verification URL from this value:
`https://<team-domain>/cdn-cgi/access/certs`

### Checkpoint

```
✓  Team domain visible in format <name>.cloudflareaccess.com
✓  CLOUDFLARE_TEAM_DOMAIN filled in .env
```

---

## Step 3 — Configure GitHub as an Identity Provider

**Dashboard:** Zero Trust → Settings → Authentication → Login methods

### What to do

1. Under **Login methods**, click **Add new** and select **GitHub**.
2. Cloudflare asks for a GitHub OAuth App's Client ID and Client Secret.

#### Create the GitHub OAuth App

Open: `https://github.com/settings/applications/new`

Fill in:

```
Application name:          Cloudflare Access - Momentum
Homepage URL:              https://<your-org-name>.cloudflareaccess.com
Authorization callback URL:
  https://<your-org-name>.cloudflareaccess.com/cdn-cgi/access/callback
```

Click **Register application**. On the next page:
- Copy the **Client ID** immediately.
- Click **Generate a new client secret** and copy it immediately (shown once only).

3. Paste both values into Cloudflare and save.
4. Click **Test** if available — this runs a login round-trip and confirms the
   OAuth configuration is correct.

### What Cloudflare does with this

Cloudflare handles the entire OAuth dance with GitHub on your behalf. When a
user hits an Access-protected URL, Cloudflare redirects them to GitHub, GitHub
authenticates them, and GitHub sends the user's identity back to Cloudflare.
Your application never sees a GitHub token — only the JWT that Cloudflare issues
after it has verified the GitHub identity.

### Checkpoint

```
✓  GitHub appears as an enabled login method
✓  Test login flow completes without error (recommended, not strictly required)
```

---

## Step 4 — Create the Tunnel

**Dashboard:** Zero Trust → Networks → Tunnels

### What to do

1. Click **Add a tunnel** → choose **Cloudflared**.
2. Name it: `momentum` (or `momentum-prod` if you prefer).
3. On the connector installation screen, Cloudflare shows a command like:
   ```bash
   cloudflared tunnel --no-autoupdate run \
     --token eyJhIjoiM...long-base64-string...
   ```
   **Copy the full token** (the long base64 value after `--token`).

   You do not need to run this command. The project runs `cloudflared` as a
   Docker service. You're here only to obtain the token.

4. Click **Save tunnel** (or Continue/Next — label varies by UI version).

### What the token encodes

The token is a base64-encoded credential that tells `cloudflared`:
- Which tunnel ID this is
- Which Cloudflare account it belongs to
- The credentials needed to authenticate

Anyone with this token can impersonate your tunnel. Treat it like a private
key — it lives in `.env` on the VPS and nowhere else.

### What goes in `.env`

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiM...the-full-token...
```

### Checkpoint

```
✓  Tunnel exists in the Tunnels list
✓  Status shows "Inactive" or "Down" — expected, cloudflared isn't running yet
    (will show "Healthy" after make deploy-up in Step 9)
✓  CLOUDFLARE_TUNNEL_TOKEN filled in .env
```

---

## Step 5 — Add Public Hostname Routes to the Tunnel

**Dashboard:** Zero Trust → Networks → Tunnels → [your tunnel] → Public Hostnames

You're telling Cloudflare which public domains should route to which internal
Docker services through the tunnel.

### Route 1: Web frontend

Click **Add a public hostname** and fill in:

| Field        | Value                   |
|--------------|-------------------------|
| Subdomain    | `momentum`              |
| Domain       | your base domain        |
| Path         | *(leave empty)*         |
| Service Type | `HTTP`                  |
| URL          | `web:5173`              |

### Route 2: API backend

| Field        | Value                   |
|--------------|-------------------------|
| Subdomain    | `momentum-api`          |
| Domain       | your base domain        |
| Path         | *(leave empty)*         |
| Service Type | `HTTP`                  |
| URL          | `api:8000`              |

### Why `web:5173` works without an IP address

`cloudflared` runs inside the same Docker Compose network as `web` and `api`.
Docker's internal DNS resolves service names to container IPs automatically.
`web:5173` means "the container named `web`, port 5173" — no external IP or
host-level port mapping needed.

```
Docker internal network:

    cloudflared ---> web:5173   (React frontend)
                \--> api:8000   (FastAPI backend)

    Neither web nor api has any ports published to the VPS host.
    cloudflared is the only gateway.
```

### Auto-created DNS records

After saving each hostname route, Cloudflare automatically adds CNAME records
to your DNS zone:

```
momentum.example.com      CNAME  <tunnel-id>.cfargotunnel.com  [proxied]
momentum-api.example.com  CNAME  <tunnel-id>.cfargotunnel.com  [proxied]
```

You can verify these in the main dashboard under your zone's DNS tab.

### What goes in `.env`

```env
BASE_DOMAIN=example.com
TASKS_WEB_DOMAIN=momentum.example.com
TASKS_API_DOMAIN=momentum-api.example.com
```

### Checkpoint

```
✓  Both hostname routes visible in tunnel configuration
✓  DNS tab shows both CNAME records with proxied (orange cloud) status
✓  TASKS_WEB_DOMAIN and TASKS_API_DOMAIN filled in .env
```

---

## Step 6 — Create Access Applications

**Dashboard:** Zero Trust → Access → Applications

Create two separate Access applications — one for the web UI, one for the API.
Separate applications give each an independent audience tag and let you add
different policies later (e.g., service token access for the agent in Phase 3).

```
Why two apps, not one policy covering both hostnames?

  momentum.example.com     -> Momentum Web (human browser)
  momentum-api.example.com -> Momentum API (human now, agent later)

  Separate apps means:
  - API has its own audience (aud) tag, validated by your backend on every request
  - You can grant agent service-token access to the API without touching the Web app
  - Revoking agent access is a one-policy change, not surgery on a shared rule
```

### Application 1: Momentum Web

1. Click **Add an application** → **Self-hosted**.
2. Fill in:
   ```
   Application name:   Momentum Web
   Session Duration:   24 hours
   Application domain:
     Subdomain:  momentum
     Domain:     example.com
     Path:       (leave empty)
   ```
3. Click **Next** to reach the policy screen.
4. Add a policy:
   ```
   Policy name:   Allow Owner
   Action:        Allow
   Include rule:
     Selector:  Emails
     Value:     your-email@example.com
   ```
5. Click through any remaining screens and **Save**.

### Application 2: Momentum API

1. Click **Add an application** → **Self-hosted**.
2. Fill in:
   ```
   Application name:   Momentum API
   Session Duration:   24 hours
   Application domain:
     Subdomain:  momentum-api
     Domain:     example.com
     Path:       (leave empty)
   ```
3. Add the same allow policy (same email, same structure as above).
4. **Save** the application.
5. Open the application you just saved and find the **Application Audience (AUD)**
   field — a 32-character hex string. Copy it.

### Common mistake

Copying the AUD from the Web app instead of the API app. The API validates
every JWT against its own audience tag. A JWT issued by the Web Access app has
a different `aud` claim and your backend will reject it with 401. Always use
the AUD from the **Momentum API** app.

### What goes in `.env`

```env
CLOUDFLARE_ACCESS_AUDIENCE=a1b2c3d4...the-32-char-hex-from-momentum-api-app...
```

### Checkpoint

```
✓  Both applications show as Active in Access → Applications
✓  Each app has at least one Allow policy
✓  Momentum API app AUD tag copied into .env as CLOUDFLARE_ACCESS_AUDIENCE
```

---

## Step 7 — Complete the `.env` File

At this point all Cloudflare-related values should be available. Here is the
full production `.env` with notes on each Cloudflare-specific variable:

```env
# -----------------------------------------------------------------------
# Core
# -----------------------------------------------------------------------
APP_ENV=production
LOG_LEVEL=info
TIMEZONE=UTC

# -----------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------
POSTGRES_DB=productivity
POSTGRES_USER=productivity
POSTGRES_PASSWORD=<generate a strong random password, 32+ chars>

# -----------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------
AUTH_MODE=cloudflare

CLOUDFLARE_TEAM_DOMAIN=your-org-name.cloudflareaccess.com
#  ^ Step 2: Zero Trust team domain

CLOUDFLARE_ACCESS_AUDIENCE=a1b2c3d4...32-char-hex...
#  ^ Step 6: AUD tag from the Momentum API Access application

CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiM...full-token...
#  ^ Step 4: token from tunnel creation

# Phase 3 placeholders (leave until agent work starts)
CLOUDFLARE_AGENT_CLIENT_ID=replace_with_service_token_client_id
CLOUDFLARE_AGENT_CLIENT_SECRET=replace_with_service_token_client_secret

# -----------------------------------------------------------------------
# Domains
# -----------------------------------------------------------------------
BASE_DOMAIN=example.com
TASKS_WEB_DOMAIN=momentum.example.com
TASKS_API_DOMAIN=momentum-api.example.com

# -----------------------------------------------------------------------
# CORS — lock down to production web domain only
# -----------------------------------------------------------------------
CORS_ORIGINS=https://momentum.example.com

# -----------------------------------------------------------------------
# Backup (fill in after Step 8)
# -----------------------------------------------------------------------
BACKUP_S3_BUCKET=productivity-backups
BACKUP_S3_PREFIX=postgres
BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
BACKUP_AWS_REGION=auto
BACKUP_RETENTION_DAYS=14
BACKUP_ENCRYPTION_PASSPHRASE=<long random passphrase you generate>
AWS_ACCESS_KEY_ID=<r2-access-key-id>
AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>
```

### Where each Cloudflare value comes from

```
CLOUDFLARE_TEAM_DOMAIN      Zero Trust → Settings → Team domain
CLOUDFLARE_TUNNEL_TOKEN     Zero Trust → Networks → Tunnels → [tunnel] → token
CLOUDFLARE_ACCESS_AUDIENCE  Zero Trust → Access → Applications
                              → Momentum API → Application Audience (AUD)
TASKS_WEB_DOMAIN            subdomain you used in Step 5, Route 1
TASKS_API_DOMAIN            subdomain you used in Step 5, Route 2
BACKUP_S3_ENDPOINT          Cloudflare R2 dashboard (Step 8)
AWS_ACCESS_KEY_ID           R2 → Manage R2 API Tokens (Step 8)
AWS_SECRET_ACCESS_KEY       same
```

---

## Step 8 — Set Up Cloudflare R2 for Backups

**Dashboard:** `https://dash.cloudflare.com/` → R2 Object Storage

### Create a bucket

1. Click **Create bucket**.
2. Bucket name: `productivity-backups`
   (must match `BACKUP_S3_BUCKET` in `.env`).
3. Leave location as default. Create the bucket.

### Create an R2 API token

1. In the R2 dashboard, click **Manage R2 API Tokens**.
2. Click **Create API token**.
3. Fill in:
   ```
   Token name:    momentum-backup
   Permissions:   Object Read & Write
   Bucket scope:  productivity-backups
   ```
4. Click **Create API Token**.
5. Copy both the **Access Key ID** and **Secret Access Key** — shown once only.

### Find your account ID

1. Go to `https://dash.cloudflare.com/`, select your account.
2. Your **Account ID** is shown in the right sidebar and in the URL
   (`dash.cloudflare.com/<account-id>/...`). It's a 32-character hex string.
3. Your R2 endpoint is:
   ```
   https://<account-id>.r2.cloudflarestorage.com
   ```

### Test the backup manually

After the deploy stack is running (Step 9), run a manual backup to verify the
pipeline before relying on the nightly cron:

```bash
cd /opt/momentum
./infra/backup/backup_to_r2.sh
```

Expected output:

```
Creating database dump...
Encrypting dump...
Uploading to Cloudflare R2...
Backup complete: s3://productivity-backups/postgres/productivity_20260217T030000Z.dump.enc
```

Confirm the object exists in R2:

```bash
aws s3 ls s3://productivity-backups/postgres/ \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
  --region auto
```

### Checkpoint

```
✓  R2 bucket created
✓  R2 API token created with read/write on the bucket
✓  All R2 env vars filled in .env
✓  Manual backup test completes and object appears in bucket (after Step 9)
```

---

## Step 9 — Deploy and Verify

With Cloudflare configured and `.env` complete, start the stack.

### Start the production stack

```bash
cd /opt/momentum
make deploy-up
```

This runs:

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml up -d --build
```

Four containers start:

```
postgres    — database, no ports published to host
api         — FastAPI backend, no ports published to host
web         — React frontend, no ports published to host
cloudflared — tunnel daemon, makes outbound connections to Cloudflare
```

### Watch the tunnel come up

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml logs -f cloudflared
```

Healthy output looks like:

```
cloudflared  | INF Starting tunnel tunnelID=abc123...
cloudflared  | INF Registered tunnel connection connIndex=0 ...
cloudflared  | INF Registered tunnel connection connIndex=1 ...
cloudflared  | INF Registered tunnel connection connIndex=2 ...
cloudflared  | INF Registered tunnel connection connIndex=3 ...
```

Four connections registered means fully healthy. Cloudflare maintains four
redundant connections per tunnel for availability. In the Zero Trust dashboard,
the tunnel status flips from "Inactive" to **Healthy** within ~30 seconds of
these log lines appearing.

### Check container status

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml ps
```

Expected:

```
NAME          STATUS
postgres      Up (healthy)
api           Up
web           Up
cloudflared   Up
```

### Verify end-to-end in the browser

1. Open `https://momentum.example.com`.
2. You should be redirected to `your-team.cloudflareaccess.com` and prompted
   to sign in with GitHub.
3. After signing in, you should be redirected back and see the Momentum UI.
4. Create a task. This confirms the API round-trip works correctly.

### What just happened (the full path)

```
1. Browser -> DNS -> Cloudflare edge IP
2. Cloudflare Access checks for session cookie
   -> First visit: redirect to GitHub login
   -> After login: attach JWT, continue
3. Request forwarded through tunnel (QUIC/HTTP2)
4. cloudflared receives request, routes to http://web:5173
5. React app loads in browser
6. Browser JS calls https://momentum-api.example.com/v1/...
   (same Access check applies to API domain)
7. API container receives request + Cf-Access-Jwt-Assertion header
8. auth.py verifies JWT signature, checks audience, extracts email -> Actor
9. domain.py processes request, writes to postgres
10. Response travels back through tunnel to browser
```

### Checkpoint

```
✓  All four containers show Up in docker compose ps
✓  cloudflared logs show 4 registered connections
✓  Zero Trust → Networks → Tunnels shows tunnel as Healthy
✓  https://momentum.example.com triggers GitHub login and loads the UI
✓  Creating a task from the UI succeeds
✓  https://momentum-api.example.com/health/live returns {"status":"ok"}
```

---

## Step 10 — Automate Nightly Backups

### Add the cron job

```bash
crontab -e
```

Add this line (runs at 03:00 UTC daily):

```cron
0 3 * * * cd /opt/momentum && ./infra/backup/backup_to_r2.sh >> /var/log/momentum-backup.log 2>&1
```

Verify it's registered:

```bash
crontab -l
```

### Test restore — do this at least once

A backup you have never restored is an untested hypothesis. After the first
automated backup runs, do a restore drill:

```bash
# List available backups
aws s3 ls s3://productivity-backups/postgres/ \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
  --region auto

# Restore from the key you see in the list
cd /opt/momentum
./infra/backup/restore_from_r2.sh postgres/productivity_20260217T030000Z.dump.enc
```

> **Known issue (tracked as P0):** `backup_to_r2.sh` currently references
> `docker-compose.local.yml` on line 37. In production, edit that line to use
> `docker-compose.deploy.yml` before running or scheduling the backup.

### Checkpoint

```
✓  Cron job registered (crontab -l shows the entry)
✓  At least one successful backup object exists in R2
✓  Restore test completed successfully at least once
```

---

## Troubleshooting

### Tunnel stays Inactive or Unhealthy after deploy-up

```bash
# Check for errors in cloudflared
docker compose --env-file .env -f infra/docker-compose.deploy.yml logs cloudflared
```

Common causes:

```
"Invalid token" / auth error
  -> CLOUDFLARE_TUNNEL_TOKEN is wrong, truncated, or has hidden whitespace.
     Copy the token again from the dashboard. Check for newlines in .env.

cloudflared can't connect at all
  -> VPS can't reach Cloudflare's network. Test: curl -I https://cloudflare.com
     Check VPS firewall — outbound traffic on port 7844 (QUIC/UDP) must be allowed.
     cloudflared falls back to HTTP/2 on TCP 443 if UDP is blocked.
```

### Access denies your login

**Where to look:** Zero Trust → Logs → Access

The Access logs show the exact reason for every deny. Common causes:

```
"Email not in policy"
  Your GitHub email doesn't match the email in the Access policy.
  GitHub Settings → Profile shows your primary email.
  Fix: edit the Access policy include rule to match the correct email.

"Identity provider error"
  The GitHub OAuth App is misconfigured.
  Check: github.com/settings/developer/oauth-apps
  Verify callback URL = https://<team>.cloudflareaccess.com/cdn-cgi/access/callback

"No matching policy" / application not found
  The Access application domain doesn't match the hostname you're hitting.
  Check that the subdomain + base domain in the Access app exactly matches
  TASKS_WEB_DOMAIN or TASKS_API_DOMAIN.
```

### API returns 401 after Access login succeeds

The web UI loaded (Access worked) but API calls fail with 401. The most likely
cause is the API cannot verify the JWT.

```bash
# Test that the API container can reach Cloudflare's cert endpoint
docker compose --env-file .env -f infra/docker-compose.deploy.yml exec api \
  curl -s https://${CLOUDFLARE_TEAM_DOMAIN}/cdn-cgi/access/certs
# Should return JSON with a "keys": [...] array
```

Other things to verify:

```
AUTH_MODE=cloudflare set in deploy compose environment block
CLOUDFLARE_TEAM_DOMAIN has no https:// prefix, no trailing slash
CLOUDFLARE_ACCESS_AUDIENCE matches the AUD from Momentum API app (not Web app)
```

### Browser shows CORS errors when API is called

```bash
# Check what CORS_ORIGINS the running api container sees
docker compose --env-file .env -f infra/docker-compose.deploy.yml exec api \
  env | grep CORS
```

The deploy compose sets `CORS_ORIGINS=https://${TASKS_WEB_DOMAIN}`. The
value must be an exact origin match — same protocol, subdomain, and domain.
If there's a mismatch (e.g., `http://` vs `https://`, or `www.` prefix), the
browser will block the API call.

### R2 backup upload fails

```bash
# Test R2 access directly
aws s3 ls s3://productivity-backups/ \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
  --region auto
```

Common causes:

```
Access denied
  R2 API token doesn't have write permission on the bucket, or
  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY have trailing whitespace in .env

NoSuchBucket
  BACKUP_S3_BUCKET doesn't match the bucket name you created

Connection error
  BACKUP_S3_ENDPOINT has wrong account ID

aws: command not found
  Install: pip install awscli  OR  apt install awscli
```

---

## Phase 3 Preview: Agent Service Token

Not required for Phase 1 but worth creating now so the credentials are stored
before you need them.

**Dashboard:** Zero Trust → Access → Service Auth → Service Tokens

1. Click **Create Service Token**.
2. Name: `openclaw-agent`
3. Duration: choose 1 year or non-expiring.
4. Copy both values that appear — shown once only:
   ```
   CF-Access-Client-Id:     <id>.access
   CF-Access-Client-Secret: <secret>
   ```
5. Store them in `.env`:
   ```env
   CLOUDFLARE_AGENT_CLIENT_ID=<client-id>
   CLOUDFLARE_AGENT_CLIENT_SECRET=<client-secret>
   ```

When Phase 3 arrives, you'll create a new Access application scoped to
`momentum-api.example.com/agent/*` with a policy that allows only this service
token — no email or IdP rules. Machines don't log in with GitHub.

---

## Final Checklist

```
Domain and DNS
  [ ]  Zone is Active in Cloudflare
  [ ]  Cloudflare nameservers are set at the registrar

Zero Trust
  [ ]  Team domain noted, in .env as CLOUDFLARE_TEAM_DOMAIN
  [ ]  GitHub configured as identity provider, test passes

Tunnel
  [ ]  Tunnel created, token in .env as CLOUDFLARE_TUNNEL_TOKEN
  [ ]  Route 1: momentum.example.com     -> http://web:5173
  [ ]  Route 2: momentum-api.example.com -> http://api:8000
  [ ]  DNS tab shows both CNAMEs as proxied (orange cloud)

Access
  [ ]  Momentum Web application active, allow policy set
  [ ]  Momentum API application active, allow policy set
  [ ]  API app AUD in .env as CLOUDFLARE_ACCESS_AUDIENCE

R2
  [ ]  Bucket created
  [ ]  API token created with read/write on bucket
  [ ]  R2 env vars in .env

Deployment
  [ ]  /opt/momentum/.env complete with all production values
  [ ]  make deploy-up runs without errors
  [ ]  cloudflared logs show 4 registered connections
  [ ]  Tunnel shows Healthy in Zero Trust dashboard
  [ ]  https://momentum.example.com triggers GitHub login, loads app
  [ ]  Creating a task from the UI succeeds (full API round-trip works)
  [ ]  https://momentum-api.example.com/health/live returns {"status":"ok"}

Backups
  [ ]  Cron job added at 0 3 * * *
  [ ]  Manual backup test succeeded
  [ ]  Restore test succeeded at least once
```

---

*See `understanding-cloudflare.md` in this directory for conceptual background
on each service and why the architecture is structured this way.*

*See `tradeoffs.md` for a comparison against other approaches (traditional
reverse proxy, auth-as-a-service, managed platforms).*
