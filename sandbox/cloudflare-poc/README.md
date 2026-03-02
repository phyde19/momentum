# Cloudflare POC — Tunnel to Docker Compose

A minimal end-to-end proof that validates: browser → Cloudflare → tunnel → Docker
Compose → your app. Once this works, you know the ingress path is solid for the
full Momentum deployment.

**What's in the box:**

- A Python HTTP server (stdlib, zero dependencies) serving a hello world page
- `GET /agent/v1/message` — reads a message from a local file
- `PUT /agent/v1/message` — overwrites that file with a new message
- Docker Compose with the app + `cloudflared` tunnel connector

---

## Step 0: Quick Tunnel Sanity Check (No Domain Needed)

Before configuring anything in Cloudflare, prove that the tunnel mechanism works.
A **quick tunnel** gives you a random public `*.trycloudflare.com` URL instantly —
no domain, no account config, no Access policies.

```bash
# Build and start just the poc container
docker compose up -d --build poc

# Run cloudflared in quick-tunnel mode on the same Docker network.
# - "docker run --rm -it" = run a one-off container, remove it when done, attach terminal
# - "--network cloudflare-poc_default" = join the Docker network that "docker compose up"
#   created (named <project>_default, i.e. cloudflare-poc_default). This lets cloudflared
#   reach the "poc" container by service name.
# - "cloudflare/cloudflared:latest" = official Cloudflare image from Docker Hub
#   (pulled automatically if not already cached locally)
# - "tunnel --url http://poc:8080" = start an ephemeral quick tunnel pointing at the
#   poc container's port 8080
docker run --rm -it \
  --network cloudflare-poc_default \
  cloudflare/cloudflared:latest \
  tunnel --url http://poc:8080
```

`cloudflared` will print a line like:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://random-words-here.trycloudflare.com                                              |
+--------------------------------------------------------------------------------------------+
```

Open that URL in your browser. You should see the POC page with "Hello from
Momentum POC!" displayed. Try updating the message — the PUT endpoint should work
through the tunnel.

**What this proves:**
- Docker networking works (cloudflared can reach the poc container by service name)
- The tunnel mechanism works (Cloudflare forwards traffic to your VPS)
- Your server handles requests correctly end-to-end

**What this does NOT give you:**
- No authentication (anyone with the URL can access it)
- URL is ephemeral (dies when you Ctrl+C the cloudflared container)
- No custom domain

When done, Ctrl+C the cloudflared container and optionally `docker compose down`.

---

## Step 1: Do You Need a Domain?

| Approach | Domain needed? | Auth? | Persistent URL? | Cost |
|----------|---------------|-------|-----------------|------|
| Quick tunnel (Step 0) | No | No | No | Free |
| Named tunnel + Access | Yes | Yes | Yes | Domain cost only |

**Cloudflare does not give you a free domain.** The `*.trycloudflare.com` quick
tunnel is the closest thing, but it's for testing only — no auth, ephemeral URL.

For the real Momentum deployment you need a domain you control. Options:

- **Cloudflare Registrar**: buy directly from Cloudflare at wholesale cost (no
  markup). Cheapest `.dev` is ~$11/yr, `.com` ~$10/yr. Advantage: domain is
  already in Cloudflare, zero nameserver migration needed.
- **Porkbun**: clean UI, competitive pricing, easy nameserver delegation to
  Cloudflare.
- **Namecheap**: familiar, fine if you already use them.

All options work identically — you just point the domain's nameservers to
Cloudflare. The rest of this guide assumes you have a domain with DNS managed
in Cloudflare.

---

## Step 2: Cloudflare Account and Zero Trust Setup

If you don't already have a Cloudflare account:

1. Create an account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Add your domain**: Websites → Add a site → enter your domain → select the
   Free plan → Cloudflare gives you two nameservers.
3. **Update nameservers** at your registrar to point to Cloudflare's nameservers.
   Propagation can take minutes to hours (usually under 30 minutes).
4. Cloudflare confirms the domain is active once it detects its own nameservers.

Then navigate to **Zero Trust** (left sidebar → Zero Trust, or
[one.dash.cloudflare.com](https://one.dash.cloudflare.com)). This is where
tunnels, Access policies, and identity providers live. If prompted to name your
"team", pick something short (e.g. your name or `momentum`) — this becomes your
`<team>.cloudflareaccess.com` domain used in login redirects.

---

## Step 3: Identity Provider

Cloudflare Access needs a way to verify who you are. The Momentum repo docs
assume GitHub, but there are simpler options for a single-user setup.

### Option A: One-Time PIN (simplest — recommended for POC)

Built into Cloudflare. No external IdP setup at all.

1. **Zero Trust → Settings → Authentication → Login methods**
2. "One-time PIN" should already be listed as enabled by default. If not, add it.

When you visit an Access-protected app, you enter your email, receive a code via
email, and enter it. That's it. No OAuth app, no third-party config.

**When to choose this:** POC, single-user, least moving parts.

### Option B: GitHub

Requires creating a GitHub OAuth App and giving Cloudflare the client ID/secret.

1. In GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Homepage URL: `https://<team>.cloudflareaccess.com`
   - Authorization callback URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
2. Copy the Client ID and Client Secret.
3. In Cloudflare: **Zero Trust → Settings → Authentication → Login methods → Add → GitHub**
4. Paste the Client ID and Client Secret.

**When to choose this:** production Momentum deployment, or if you want identity
tied to your GitHub account specifically.

### Option C: Google

Works if you have a Google account. Cloudflare has a built-in Google integration
that requires creating a Google OAuth consent screen + credentials.

1. In Google Cloud Console: **APIs & Services → Credentials → Create OAuth Client ID**
   - Application type: Web application
   - Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
2. Copy Client ID and Client Secret.
3. In Cloudflare: **Zero Trust → Settings → Authentication → Login methods → Add → Google**
4. Paste credentials.

**When to choose this:** if you prefer Google identity or already have Google
Cloud set up.

### Recommendation

Use **One-Time PIN** for this POC. It validates the Access auth flow with zero
external dependencies. Switch to GitHub (or add it alongside) when deploying
Momentum for real — you can have multiple login methods active simultaneously.

---

## Step 4: Create a Named Tunnel

1. **Zero Trust → Networks → Tunnels → Create a tunnel**
2. Choose **Cloudflared** as the connector type.
3. Name it something recognizable (e.g. `poc` or `momentum-poc`).
4. Cloudflare shows you a token. Copy it.
5. **Add a public hostname** in the tunnel configuration:
   - Subdomain: `poc` (or whatever you like)
   - Domain: select your domain from the dropdown
   - Service type: `HTTP`
   - Service URL: `poc:8080`

This creates a DNS CNAME record automatically. Requests to `poc.yourdomain.com`
will be routed through the tunnel to `http://poc:8080` inside your Docker network.

**Key concept:** the hostname-to-service routing lives in the Cloudflare dashboard,
not in your docker-compose file. Your compose file just runs `cloudflared` with a
token — it doesn't know or care which hostnames are configured. You can add,
change, or remove hostname routes in the dashboard without touching your compose
file or restarting containers.

### Put the token in your `.env`

```bash
cp .env.example .env
```

Edit `.env` and paste the tunnel token:

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...long-base64-string...
```

---

## Step 5: Create an Access Application

Without an Access application, your tunnel exposes the POC to the public internet.
Access adds authentication so only you can reach it.

1. **Zero Trust → Access → Applications → Add an application**
2. Choose **Self-hosted**.
3. Configure:
   - **Application name**: `POC` (or anything descriptive)
   - **Session duration**: `24 hours`
   - **Application domain**: `poc.yourdomain.com` (must match the hostname you
     added to the tunnel in Step 4)
4. Add a policy:
   - **Policy name**: `Allow me`
   - **Action**: Allow
   - **Include rule**: Emails → enter your email address
5. Save.

Now visiting `poc.yourdomain.com` will redirect to a Cloudflare login page.
After authenticating (OTP email, GitHub, or whichever IdP you configured),
Cloudflare sets a session cookie and forwards requests to your tunnel.

### What about the Audience tag?

Each Access application has an **Application Audience (AUD) tag** — a hex string
visible in the application's overview. This is used by backend APIs that want to
**re-validate the Cloudflare JWT** server-side (defense in depth). The Momentum
API does this in `backend/app/auth.py`.

For this POC, you don't need it — the POC server doesn't validate JWTs. But note
where to find it for later:

**Zero Trust → Access → Applications → your app → Overview → Application Audience (AUD) Tag**

---

## Step 6: Launch with Named Tunnel

```bash
docker compose up -d --build
```

Check that both containers started:

```bash
docker compose ps
```

You should see `poc` and `cloudflared` both running. Check cloudflared logs to
confirm it connected:

```bash
docker compose logs cloudflared
```

Look for lines like:
```
Connection registered connIndex=0 ...
Connection registered connIndex=1 ...
```

These mean `cloudflared` has established persistent connections to Cloudflare's
edge network. Your tunnel is live.

### Verify in browser

1. Open `https://poc.yourdomain.com`
2. Cloudflare Access login page appears — authenticate with your chosen method
3. You should see the POC page with "Hello from Momentum POC!"
4. Update the message and confirm it persists

---

## Step 7: Testing Agent Access

With the tunnel running, test the API endpoints directly:

```bash
# Read the current message (through Cloudflare, after Access auth)
# NOTE: this requires an active Access session in your browser.
# For curl without a browser session, you'd need a service token (see below).

# From the VPS itself, you can hit the container directly for quick testing:
docker compose exec poc python -c "
import urllib.request, json
res = urllib.request.urlopen('http://localhost:8080/agent/v1/message')
print(json.loads(res.read()))
"

# Update the message from inside the network:
docker compose exec poc python -c "
import urllib.request, json
data = json.dumps({'message': 'Updated by agent!'}).encode()
req = urllib.request.Request('http://localhost:8080/agent/v1/message',
    data=data, method='PUT', headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
print(json.loads(res.read()))
"
```

Refresh the page in your browser — the message should show the agent's update.

### How real agent access will work (Momentum Phase 3)

For OpenClaw or other agents accessing Momentum through Cloudflare from a
separate VPS, the flow uses **Cloudflare Access service tokens**:

1. Create a service token in **Zero Trust → Access → Service Auth → Service Tokens**
2. Create a separate Access application (or add a policy) scoped to
   `/agent/v1/*` that allows the service token
3. The agent sends two headers with every request:
   ```
   CF-Access-Client-Id: <service-token-id>
   CF-Access-Client-Secret: <service-token-secret>
   ```
4. Cloudflare validates the token and forwards the request through the tunnel
   with a JWT attached — same as human access, but with machine identity

This keeps agent and human auth completely separate. Revoking the service token
instantly cuts off agent access without affecting your browser sessions.

---

## Step 8: Design Alternatives Worth Understanding

These are trade-offs the Momentum repo docs either assumed or didn't discuss.
None of them change what you should do for the POC, but understanding them will
help when you configure the real deployment.

### One hostname vs two hostnames for web + API

The Momentum docs use two hostnames: `tasks.domain.com` for the web UI and
`tasks-api.domain.com` for the API. An alternative is a single hostname with
path-based routing in the tunnel config:

| Approach | DNS records | Access apps | CORS complexity |
|----------|------------|-------------|-----------------|
| Two hostnames | 2 | 2 (can diverge later for agent tokens) | Web must set API origin |
| Single hostname + path routing | 1 | 1 | None (same origin) |

Single hostname eliminates CORS entirely because the browser sees web and API
on the same origin. But it requires the API to serve under a path prefix
(e.g. `/api/v1/tasks` instead of `/v1/tasks`), or Cloudflare to strip the
prefix.

**Verdict for Momentum:** two hostnames is the right call. It cleanly separates
concerns, makes independent Access policies trivial (critical for Phase 3 agent
tokens), and the existing codebase is built for it. The CORS config is one env
var.

### Access on the API — is it necessary?

You could skip the Access application on the API hostname and rely solely on
JWT validation in the FastAPI backend (`auth.py`). This means:

- Without Access: any request reaches your API container; the app rejects
  unauthenticated ones.
- With Access: unauthenticated requests are rejected by Cloudflare before
  they ever reach your container.

**Verdict:** always put Access on the API too. It's free, adds zero latency,
and means your container never sees unauthenticated traffic. Defense in depth.

### cloudflared as Docker container vs system service

The Momentum docs run `cloudflared` inside Docker Compose. Alternative: install
it as a systemd service on the host.

| Approach | Lifecycle | Multi-project | Config location |
|----------|----------|---------------|-----------------|
| Docker Compose service | Tied to compose stack | One tunnel per stack | docker-compose.yml |
| systemd service | Independent of Docker | Can serve multiple stacks | /etc/cloudflared/ |

**Verdict for Momentum:** Docker Compose is fine. Single project, single VPS.
Keeping everything in compose means `docker compose down` cleanly stops the
tunnel, and there's nothing to manage outside the repo.

---

## Cleanup

```bash
docker compose down
```

This stops the poc server and disconnects the tunnel. The hostname in Cloudflare
still exists but will show as unhealthy. You can delete the tunnel and Access
application in the dashboard if you're done with the POC.
