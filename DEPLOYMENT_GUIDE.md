# Momentum Deployment Guide (30 Minutes)

This is the fastest sane path to get Momentum live with:
- Cloudflare Tunnel + Access (no direct app port exposure)
- One VPS deployment target
- GitHub Actions CI + auto-deploy on merge

This guide assumes:
- You deploy Momentum on this VPS.
- OpenClaw and its provider/API keys stay on a separate VPS.
- You are okay with a first-pass deploy that is secure enough now and improved later.

## 1) Deployment Model (What You Are Building)

```text
Runtime path
------------
[User Browser]
      |
      v
[Cloudflare Access]
      |
      v
[Cloudflare Tunnel]
    |           \
    |            \
    v             v
[Web Container] [API Container] ---> [Postgres Container]

Deploy path
-----------
[GitHub main]
      |
      v
[GitHub Actions deploy]
      |
      v
[deploy user on VPS]
      |
      v
[make deploy-up]
```

## 2) Prerequisites (2-3 Minutes)

- Domain is in Cloudflare and DNS is managed there.
- VPS has Docker + Docker Compose.
- You have a GitHub account and can create a repo.

## 3) VPS Prep (5 Minutes)

Use a non-root deploy user.

```bash
sudo adduser --disabled-password deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/momentum
sudo chown deploy:deploy /opt/momentum
```

Switch to deploy user and prepare repo location:

```bash
sudo su - deploy
```

If repo already exists on VPS, skip clone and just `cd /opt/momentum`.

## 4) Cloudflare Setup (10-12 Minutes)

In Cloudflare Zero Trust:

1. Add GitHub login method  
   `Zero Trust -> Settings -> Authentication -> Login methods`
2. Create Tunnel  
   `Zero Trust -> Networks -> Tunnels`  
   Copy tunnel token.
3. Add tunnel hostnames:
   - `tasks.<your-domain>` -> `http://web:5173`
   - `tasks-api.<your-domain>` -> `http://api:8000`
4. Create Access app for web:
   - Self-hosted app
   - Domain: `https://tasks.<your-domain>`
   - Policy: Allow your GitHub identity/email
5. Create Access app for API:
   - Self-hosted app
   - Domain: `https://tasks-api.<your-domain>`
   - Policy: Allow your GitHub identity/email
   - Copy the API Audience tag

## 5) Production Env File (3 Minutes)

In `/opt/momentum`:

```bash
cp .env.example .env
```

Set at minimum:

```env
POSTGRES_DB=productivity
POSTGRES_USER=productivity
POSTGRES_PASSWORD=<strong-password>

AUTH_MODE=cloudflare
CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=<api-app-audience-tag>
CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>

BASE_DOMAIN=<your-domain>
TASKS_WEB_DOMAIN=tasks.<your-domain>
TASKS_API_DOMAIN=tasks-api.<your-domain>
```

## 6) First Manual Deploy (2-3 Minutes)

```bash
make deploy-up
```

Verify:
- `https://tasks.<your-domain>` prompts GitHub login and loads UI.
- `https://tasks-api.<your-domain>/health/live` returns healthy after Access auth.
- UI can load tasks from API.

If it fails:

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml logs -f
```

## 7) GitHub Bootstrap + Branch Protection (5 Minutes)

If this directory is not yet a git repo, run locally:

```bash
git init
git checkout -b main
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

In GitHub `Settings -> Branches -> Add rule` for `main`:
- Require pull request before merging
- Require 1 approval
- Require status checks to pass
- Require branches up to date before merge
- Do not allow bypassing

## 8) Add GitHub Actions (5-7 Minutes)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Frontend install
        working-directory: web
        run: npm ci

      - name: Frontend typecheck
        working-directory: web
        run: npm run typecheck

      - name: Frontend build
        working-directory: web
        run: npm run build

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Backend install
        working-directory: backend
        run: pip install -r requirements.txt ruff

      - name: Backend compile check
        working-directory: backend
        run: python -m compileall app

      - name: Backend lint
        working-directory: backend
        run: ruff check app
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd ${{ secrets.VPS_DEPLOY_PATH }}
            git fetch origin main
            git reset --hard origin/main
            make deploy-up
```

Add repo secrets in GitHub `Settings -> Secrets and variables -> Actions`:
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_DEPLOY_PATH` (example: `/opt/momentum`)

## 9) End-to-End Test (2 Minutes)

1. Create branch: `dev/test-deploy-pipeline`
2. Make a tiny non-functional doc change
3. Open PR -> verify CI passes
4. Merge PR -> verify Deploy workflow succeeds
5. Open production URL and verify health/UI

## 10) Known Follow-Ups (Do After First Success)

These are important but not blockers for first launch:

- Production web currently runs Vite dev server in deploy compose; switch to static build serving.
- Add healthchecks for `api` and `web` in deploy compose.
- Update backup scripts to use deploy compose path in production.
- Add `/agent/v1/*` namespace + service-token actor mapping + idempotency for OpenClaw writes.

## 11) Security Notes

- Do not run normal deploy/dev workflow as `root`.
- Keep dev-only ports loopback-bound when possible (`127.0.0.1:PORT:PORT`).
- Keep OpenClaw credentials only on the OpenClaw VPS, not in this app runtime.

