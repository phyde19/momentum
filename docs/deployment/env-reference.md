# Environment Variable Reference

Copy `.env.example` to `.env` and fill values.

## Local-first testing

```env
AUTH_MODE=dev
DEV_AUTH_EMAIL=your-email@example.com
DATABASE_URL=postgresql+psycopg://productivity:change_me_strong@postgres:5432/productivity
VITE_API_BASE_URL=http://localhost:8000
VITE_DEV_USER_EMAIL=your-email@example.com
```

## Cloudflare-protected deployment

```env
AUTH_MODE=cloudflare
CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=<audience-from-access-api-app>
CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>
CLOUDFLARE_AGENT_CLIENT_ID=<service-token-client-id-future>
CLOUDFLARE_AGENT_CLIENT_SECRET=<service-token-client-secret-future>

BASE_DOMAIN=example.com
TASKS_WEB_DOMAIN=tasks.example.com
TASKS_API_DOMAIN=tasks-api.example.com
TASKS_WEB_DEV_DOMAIN=tasks-dev.example.com
TASKS_API_DEV_DOMAIN=tasks-api-dev.example.com
```

## Backup to Cloudflare R2

```env
BACKUP_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=productivity-backups
BACKUP_S3_PREFIX=postgres
BACKUP_AWS_REGION=auto
AWS_ACCESS_KEY_ID=<r2-access-key-id>
AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>
BACKUP_ENCRYPTION_PASSPHRASE=<long-random-passphrase>
```
