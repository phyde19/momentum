# Cloudflare First-Time Guide (Fast Setup + Mental Model)

If Cloudflare setup feels abstract or intimidating, that is normal.  
This guide is designed to help you move fast **and** understand what is happening.

Use this for **Phase 1**: manual deploy from `/opt/momentum` with Cloudflare Access.

---

## The 60-second mental model

Cloudflare becomes your front door. Your VPS is the private house behind it.

```text
Public internet
      |
      v
[Cloudflare Access + DNS + TLS]
      |
      v
[Cloudflare Tunnel]
      |
      v
[cloudflared container on your VPS]
      |
      +--> [web container :5173]
      |
      +--> [api container :8000]
             |
             +--> [postgres :5432]
```

What this means in practice:
- You do **not** need to open app ports publicly on the VPS.
- `cloudflared` makes outbound connections to Cloudflare.
- Cloudflare sends authenticated traffic through that tunnel to your internal containers.

Cloudflare objects you will create:
1. Your site in Cloudflare DNS (if not already there)
2. One GitHub Identity Provider in Zero Trust
3. One Tunnel (`cloudflared`) with two public hostnames
4. Two Access applications (one for web, one for API)

---

## Direct URLs (so you do not hunt around)

Cloudflare:
- Main dashboard: `https://dash.cloudflare.com/`
- Zero Trust home: `https://one.dash.cloudflare.com/`
- Websites (zones): `https://dash.cloudflare.com/`
- Tunnels docs page (if UI path changes): `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/`
- Access apps docs page (if UI path changes): `https://developers.cloudflare.com/cloudflare-one/access-controls/applications/`

GitHub (for OAuth app if needed):
- OAuth Apps: `https://github.com/settings/developers`
- New OAuth App direct: `https://github.com/settings/applications/new`

Note: Cloudflare deep links for specific pages can vary by account and UI version.  
If a deep link does not land exactly where expected, start at `https://one.dash.cloudflare.com/` and follow the click-path in this guide.

---

## Keep this separation clear (important)

You have two copies of the project on one machine:

- Dev copy: `/root/personal/personal-productivity-system`
- Deploy copy: `/opt/momentum`

For Phase 1, deployment commands should run from `/opt/momentum`.

---

## Fast setup checklist with "what this means"

### 1) Prepare `.env` in deploy copy

**Run from path:** `/opt/momentum`

```bash
cd /opt/momentum
cp .env.example .env
```

Set these minimum values in `.env`:

```env
AUTH_MODE=cloudflare
CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=<from-api-access-app>
CLOUDFLARE_TUNNEL_TOKEN=<from-tunnel-setup>

BASE_DOMAIN=example.com
TASKS_WEB_DOMAIN=tasks.example.com
TASKS_API_DOMAIN=tasks-api.example.com

POSTGRES_DB=productivity
POSTGRES_USER=productivity
POSTGRES_PASSWORD=<strong-password>
```

**What this means:** You are telling the API to trust Cloudflare Access JWTs, and telling Docker how to run your app and database in production mode.

---

### 2) Add domain to Cloudflare and confirm DNS is there

**Where:** Cloudflare dashboard (not shell)

Click path:
1. `Cloudflare dashboard -> Websites -> Add a site`
2. Enter your domain (example: `example.com`) and continue
3. Choose a plan (Free is fine for this setup)
4. Cloudflare gives nameservers, copy them
5. At your domain registrar, replace existing nameservers with Cloudflare nameservers
6. Wait until Cloudflare site status becomes `Active`

What to verify before moving on:
- Your zone is `Active` in Cloudflare
- DNS tab is visible and editable for the zone

**What this means:** Cloudflare can now answer for your domain and route traffic to your tunnel.

---

### 3) Configure GitHub login in Cloudflare Zero Trust

**Where:** `Zero Trust -> Settings -> Authentication -> Login methods`

Click path and fields:
1. Open Zero Trust from Cloudflare dashboard
2. Go to `Settings -> Team domain` and note your team domain  
   Example: `yourteam.cloudflareaccess.com`
3. Go to `Settings -> Authentication -> Login methods` (or `Access -> Authentication` depending on UI)
4. Add `GitHub` as login method
5. If prompted for GitHub OAuth credentials:
   - In GitHub: `Settings -> Developer settings -> OAuth Apps -> New OAuth App`
   - Homepage URL: `https://<team>.cloudflareaccess.com`
   - Authorization callback URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Copy Client ID/Secret back into Cloudflare
6. Save and use `Test` if available

What to verify before moving on:
- GitHub appears as an enabled login method
- Test auth flow does not error

**What this means:** Cloudflare can challenge users to sign in before they reach your app.

---

### 4) Create a Tunnel

**Where:** `Zero Trust -> Networks -> Tunnels`

Click path and fields:
1. `Add a tunnel` -> choose `Cloudflared`
2. Tunnel name: `tasks-platform` (or similar)
3. On connector setup screen, choose the Docker/Linux option (any is fine just to obtain token)
4. Copy the token from the provided command (the part after `--token`)
5. Put that token in `.env`:

```env
CLOUDFLARE_TUNNEL_TOKEN=...
```

You can ignore host-level install instructions because this project runs `cloudflared` as a Docker service in `infra/docker-compose.deploy.yml`.

What to verify before moving on:
- Tunnel exists in dashboard
- It is not required to be healthy yet (it becomes healthy after `make deploy-up`)

**What this means:** Cloudflare now has a secure outbound "pipe" to your VPS via `cloudflared`.

---

### 5) Add tunnel public hostnames

In tunnel config, open `Public Hostnames` and add these routes:

Route 1 (web):
- Subdomain: `tasks`
- Domain: your base domain
- Path: empty
- Service type: `HTTP`
- URL: `web:5173`

Route 2 (api):
- Subdomain: `tasks-api`
- Domain: your base domain
- Path: empty
- Service type: `HTTP`
- URL: `api:8000`

- `tasks.<your-domain>` -> `http://web:5173`
- `tasks-api.<your-domain>` -> `http://api:8000`

What to verify before moving on:
- Both hostnames show in the tunnel config
- DNS records are present for both hostnames (Cloudflare usually auto-creates CNAMEs for tunnel routes)

**What this means:** You map public hostnames to private Docker services by service name and port.

---

### 6) Create Access applications (web and api)

**Where:** `Zero Trust -> Access -> Applications`

Create two self-hosted apps (separate policies keep boundaries clean):

1. Web app
   - `Add an application -> Self-hosted`
   - Name: `Momentum Web`
   - Domain: `https://tasks.<your-domain>`
   - Session duration: `24h`
   - Policy:
     - Action: `Allow`
     - Include: your email (and/or GitHub identity)
   - Save

2. API app
   - `Add an application -> Self-hosted`
   - Name: `Momentum API`
   - Domain: `https://tasks-api.<your-domain>`
   - Session duration: `24h`
   - Policy:
     - Action: `Allow`
     - Include: your email (and/or GitHub identity)
   - Save
   - Copy Audience tag to:
     ```env
     CLOUDFLARE_ACCESS_AUDIENCE=<aud-tag>
     ```

Where to get the audience tag:
- Open `Momentum API` app in Access
- In app details/basic info, copy `Application Audience (AUD)`

What to verify before moving on:
- Both applications are `Active`
- You can see at least one allow policy per app
- API app has an audience tag copied to `.env`

**What this means:** Access rules are now the auth gate in front of your app.

---

### 7) Run production stack

**Run from path:** `/opt/momentum`

```bash
cd /opt/momentum
make deploy-up
```

**What this means:** Docker starts `postgres`, `api`, `web`, and `cloudflared` in deploy mode.

---

### 8) Verify quickly

**Run from path:** `/opt/momentum`

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml ps
docker compose --env-file .env -f infra/docker-compose.deploy.yml logs -f cloudflared
```

Then in browser:

- `https://tasks.<your-domain>` -> prompts GitHub login -> loads UI
- `https://tasks-api.<your-domain>/health/live` -> healthy response (after Access auth)

If blocked, check in Cloudflare:
- `Zero Trust -> Logs -> Access` for deny reasons
- `Zero Trust -> Access -> Applications` policy order and include rules
- `Zero Trust -> Networks -> Tunnels` connector health

**What this means:** Tunnel is alive, Access policy works, and both hostnames route correctly.

---

## Common confusion points (you are not doing anything wrong)

### "No ports are open. How can requests arrive?"

Because Cloudflare receives the request first and forwards it through the existing tunnel connection from `cloudflared`.

### "Is this polling?"

Not in the usual sense. It is long-lived outbound connections with keepalive/reconnect behavior.

### "Why do I need two Access apps?"

Separate web and API policies keep auth boundaries cleaner, and API audience (`aud`) stays explicit.

### "Why two project copies on one VPS?"

To avoid mixing local dev behavior and production deployment behavior, and to keep deploy automation from touching your live dev tree.

---

## Phase 1 done criteria

You are done with Phase 1 when all are true:

- Deploy runs from `/opt/momentum`.
- `make deploy-up` starts the stack without errors.
- Cloudflare Tunnel is healthy.
- Web and API hostnames are reachable only through Access.
- You can log in and use the app.

After this, move to Phase 2 (GitHub Actions automation).

