# Cloudflare Access Policy Templates

Use these as initial policy intents in Cloudflare Zero Trust.

## Human Web (`tasks.<domain>`)

- Application type: Self-hosted
- Domain: `https://${TASKS_WEB_DOMAIN}`
- Action: `Allow`
- Include:
  - Login method: GitHub
  - Emails: your personal email(s)
- Session duration: `24h`

## Human API (`tasks-api.<domain>`)

- Application type: Self-hosted
- Domain: `https://${TASKS_API_DOMAIN}`
- Action: `Allow`
- Include:
  - Login method: GitHub
  - Emails: your personal email(s)
- Session duration: `24h`

## Future Agent API Namespace (`tasks-api.<domain>/agent/*`)

- Application type: Self-hosted (path scoped)
- Domain/path: `https://${TASKS_API_DOMAIN}/agent/*`
- Action: `Allow`
- Include:
  - Service Token: `openclaw-agent`
- Exclude:
  - Everyone (if needed to isolate strictly to token callers)

Keep human and agent policies separate for easier revocation and least privilege.
