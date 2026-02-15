# Cloudflare Setup Guide (Web + API + Future Agent Access)

This project is built to run locally first, then move behind Cloudflare Tunnel and Cloudflare Access.

## 1) Prepare your domain in Cloudflare

1. Create a Cloudflare account.
2. Add your domain to Cloudflare (`BASE_DOMAIN` in `.env`).
3. Confirm DNS is managed in Cloudflare.

## 2) Configure Identity Provider (GitHub)

1. In Cloudflare dashboard, open **Zero Trust**.
2. Go to **Settings -> Authentication -> Login methods**.
3. Add **GitHub** as an identity provider.
4. Add your allowed GitHub identity/email in Access policies.

## 3) Create a Tunnel

1. In **Zero Trust -> Networks -> Tunnels**, create a new tunnel.
2. Choose a tunnel name (example: `tasks-platform`).
3. Copy the tunnel token and set:

```env
CLOUDFLARE_TUNNEL_TOKEN=<token>
```

## 4) Add Tunnel Public Hostnames

Create hostname routes in the tunnel:

- `${TASKS_WEB_DOMAIN}` -> `http://web:5173`
- `${TASKS_API_DOMAIN}` -> `http://api:8000`

For staging/dev cutover you can also add:

- `${TASKS_WEB_DEV_DOMAIN}` -> `http://web:5173`
- `${TASKS_API_DEV_DOMAIN}` -> `http://api:8000`

## 5) Configure Cloudflare Access Applications

Create two self-hosted applications:

1. **Human Web App**
   - Domain: `${TASKS_WEB_DOMAIN}`
   - Policy: allow only your GitHub user/email

2. **Human API**
   - Domain: `${TASKS_API_DOMAIN}`
   - Policy: allow only your GitHub user/email
   - Copy the **Audience** value and set:

```env
CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=<aud-tag-from-api-app>
AUTH_MODE=cloudflare
```

## 6) Future Agent Access (Defined now, enable later)

When you are ready for OpenClaw agent routes:

1. Add API route namespace in backend (example `/agent/v1/*`).
2. Create a Cloudflare Access policy for service tokens on that path only.
3. Create a service token and store in OpenClaw runtime:
   - `CF-Access-Client-ID`
   - `CF-Access-Client-Secret`
4. Optional app `.env` placeholders (for operational documentation):

```env
CLOUDFLARE_AGENT_CLIENT_ID=<service-token-client-id>
CLOUDFLARE_AGENT_CLIENT_SECRET=<service-token-client-secret>
```

## 7) Deploy with Cloudflare

Use:

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml up -d --build
```

## 8) Verify

1. Visit `${TASKS_WEB_DOMAIN}` and confirm GitHub login is required.
2. Open browser devtools and verify API calls succeed through Access.
3. Hit `${TASKS_API_DOMAIN}/health/live` after login.
