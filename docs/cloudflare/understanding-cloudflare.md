# Understanding Cloudflare for Momentum

A technical guide for understanding what Cloudflare is, which of its services
power this project, and the networking concepts that tie it all together.

Written for someone who is intelligent, motivated, and wants to actually
understand the system -- not just follow a checklist.

---

## Table of Contents

1. [What Cloudflare Actually Is](#1-what-cloudflare-actually-is)
2. [The Four Services We Use](#2-the-four-services-we-use)
3. [Cloudflare DNS](#3-cloudflare-dns)
4. [Cloudflare Tunnel](#4-cloudflare-tunnel)
5. [Cloudflare Access (Zero Trust)](#5-cloudflare-access-zero-trust)
6. [Cloudflare R2 (Object Storage)](#6-cloudflare-r2-object-storage)
7. [Full Request Lifecycle](#7-full-request-lifecycle)
8. [Networking Concepts Beyond TCP/HTTP](#8-networking-concepts-beyond-tcphttp)
9. [How the Pieces Map to Our Code](#9-how-the-pieces-map-to-our-code)
10. [What You're Not Using (and Why)](#10-what-youre-not-using-and-why)
11. [Mental Models and Analogies](#11-mental-models-and-analogies)

---

## 1) What Cloudflare Actually Is

Cloudflare is an infrastructure company that operates a global network of data
centers (300+ cities). They started as a CDN and DDoS protection service, but
have grown into something closer to a "programmable edge network" -- a layer
you put between the public internet and your own servers.

The key insight: Cloudflare sits in the middle of every request. That position
lets them offer DNS, TLS termination, caching, firewall rules, authentication,
load balancing, and more -- all before traffic ever reaches your origin server.

```
Traditional setup:

    Browser ──── internet ────> Your Server
                                (you handle everything:
                                 DNS, TLS, DDoS, auth, firewall)


With Cloudflare:

    Browser ──── internet ────> Cloudflare Edge ────> Your Server
                                (they handle:          (you handle:
                                 DNS, TLS, DDoS,        app logic,
                                 auth, caching,         database)
                                 firewall, routing)
```

For Momentum, Cloudflare serves four specific roles:

| Service             | What It Does for Us                                    |
|---------------------|--------------------------------------------------------|
| **DNS**             | Resolves our domain names to Cloudflare's edge         |
| **Tunnel**          | Securely connects VPS to Cloudflare without open ports |
| **Access**          | Authenticates users before they reach the app          |
| **R2**              | Stores encrypted database backups                      |

That's it. Four services. The rest of this document explains each one and how
they fit together.

---

## 2) The Four Services We Use

Here is the full picture of what runs where:

```
 YOUR DEVICES                    CLOUDFLARE NETWORK               YOUR VPS
 (browser, phone)                (their data centers)             (Docker host)
                                                                                
 +--------------+     HTTPS     +-----------------------+         +-------------------+
 |              | ------------> |  DNS                  |         |                   |
 | Browser      |               |  (resolves domain to  |         |  cloudflared      |
 |              |               |   Cloudflare edge IP) |         |  (container)      |
 +--------------+               |                       |         |    |               |
                                |  TLS Termination      |         |    |  outbound     |
                                |  (decrypts HTTPS,     |         |    |  persistent   |
                                |   re-encrypts to      |         |    |  connections  |
                                |   tunnel)             |   Tunnel|    |               |
                                |                       | <====== |    +--- web :5173  |
                                |  Access               |  (mux)  |    |               |
                                |  (checks identity     |         |    +--- api :8000  |
                                |   via GitHub login)   |         |    |               |
                                |                       |         |    +--- pg  :5432  |
                                +-----------------------+         +-------------------+
                                                                                
                                +-----------------------+                       
                                |  R2 (object storage)  | <--- backup scripts   
                                |  encrypted pg_dumps   |      upload nightly   
                                +-----------------------+                       
```

Key observation: traffic flows **left to right** for user requests, but the
tunnel connection is initiated **right to left** (VPS reaches out to
Cloudflare). This is what "outbound-only" means and it's the core security
property of this architecture.

---

## 3) Cloudflare DNS

### What DNS does (30-second refresher)

DNS translates human-readable names (`momentum.example.com`) into IP addresses
(`104.21.89.12`). When you type a URL in a browser, the first thing that happens
-- before any HTTP or TLS -- is a DNS lookup.

### What Cloudflare DNS does specifically

When your domain uses Cloudflare's nameservers, Cloudflare answers DNS queries
for your domain. This means:

1. **They control where traffic goes.** They can point your domain at their own
   edge IPs instead of your VPS IP.
2. **Your VPS IP is never exposed.** Attackers can't find your server by doing
   a DNS lookup -- they only see Cloudflare.
3. **They can proxy traffic.** The orange cloud icon in the Cloudflare dashboard
   means "proxy this through Cloudflare" vs. "just answer with the raw IP."

### How we use it

Two DNS records, both proxied through Cloudflare:

```
momentum.example.com      CNAME -> tunnel-id.cfargotunnel.com  (proxied)
momentum-api.example.com  CNAME -> tunnel-id.cfargotunnel.com  (proxied)
```

These CNAME records are auto-created when you add public hostnames to a tunnel.
They point at a special Cloudflare hostname that routes through your tunnel.

### The DNS resolution chain

```
Browser asks: "What is momentum.example.com?"

Step 1: Browser -> OS resolver -> Root DNS -> .com TLD -> Cloudflare NS
Step 2: Cloudflare NS returns a Cloudflare edge IP (e.g., 104.21.89.12)
Step 3: Browser connects to that Cloudflare edge IP
Step 4: Cloudflare looks at the hostname, finds the tunnel route, forwards
        the request through the tunnel to your VPS

Your VPS IP never appears anywhere in this chain.
```

---

## 4) Cloudflare Tunnel

This is the most important piece to understand. It replaces the traditional
model of "open a port on your server and let the internet connect to it."

### The traditional model and its problems

Normally, to make a web server reachable:

```
Traditional:

    Internet ──> Firewall (port 443 open) ──> Nginx ──> App

    Problems:
    - Port 443 must be open to the entire internet
    - You need to manage TLS certificates yourself
    - DDoS attacks hit your server directly
    - Any vulnerability in Nginx is directly exploitable
    - Your server IP is public knowledge
```

### The tunnel model

Cloudflare Tunnel flips the connection direction:

```
Tunnel model:

    Internet ──> Cloudflare Edge ═══tunnel═══> cloudflared ──> App

    Properties:
    - ZERO inbound ports open on VPS
    - cloudflared makes OUTBOUND connections to Cloudflare
    - TLS is handled by Cloudflare (free, automatic)
    - DDoS is absorbed by Cloudflare's network
    - Your server IP is never publicly known
```

### How `cloudflared` works (the networking)

`cloudflared` is a lightweight daemon (we run it as a Docker container). On
startup, it:

1. **Establishes multiple persistent outbound connections** to Cloudflare's
   nearest edge data centers. These are long-lived, multiplexed connections
   over QUIC (or HTTP/2 as fallback).
2. **Registers itself** with Cloudflare's control plane: "I am tunnel
   `abc123`, I can serve traffic for `momentum.example.com` and
   `momentum-api.example.com`."
3. **Waits for forwarded requests.** When a user hits your domain, Cloudflare
   routes the request down the tunnel to `cloudflared`.
4. **Proxies locally.** `cloudflared` forwards the request to the appropriate
   Docker service (`web:5173` or `api:8000`) based on the hostname rules you
   configured.

```
Inside your VPS (Docker network):

    cloudflared
        |
        |  hostname = momentum.example.com
        +-------> http://web:5173    (frontend)
        |
        |  hostname = momentum-api.example.com
        +-------> http://api:8000    (backend)
```

### QUIC: the transport protocol under the tunnel

The tunnel doesn't use plain TCP. It uses **QUIC**, a modern transport protocol
built on UDP. You don't need to deeply understand QUIC, but knowing three things
helps:

1. **Multiplexing without head-of-line blocking.** Multiple HTTP requests share
   one connection without blocking each other. In TCP, if one packet is lost,
   everything behind it waits. QUIC handles streams independently.
2. **Faster connection setup.** QUIC combines the transport handshake and TLS
   handshake into one round-trip (vs. TCP's two separate handshakes).
3. **Connection migration.** If the VPS's network hiccups briefly, QUIC can
   resume without re-establishing from scratch.

The practical consequence: the tunnel is resilient. `cloudflared` maintains
connections that survive brief network interruptions and automatically reconnect
when needed.

### What the tunnel is NOT

- **Not a VPN.** It doesn't route all traffic from your VPS through Cloudflare.
  Only traffic for the configured hostnames flows through it.
- **Not polling.** `cloudflared` doesn't periodically ask "any requests for me?"
  It holds persistent connections open, and requests are pushed to it instantly.
- **Not SSH tunneling.** Same concept (outbound connection carries inbound
  traffic), but purpose-built and managed by Cloudflare at scale.

### How we configure it

In `docker-compose.deploy.yml`:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  restart: unless-stopped
  depends_on:
    - api
    - web
  command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```

The `CLOUDFLARE_TUNNEL_TOKEN` encodes: which tunnel this is, which account it
belongs to, and the authentication credentials for the tunnel. The hostname-to-
service routing rules are configured in the Cloudflare dashboard (not in this
file).

### Why the services can talk by name

`cloudflared`, `api`, `web`, and `postgres` are all on the same Docker Compose
network. Docker's built-in DNS lets them reach each other by service name.
That's why the tunnel routes say `http://web:5173` -- `web` resolves to the
container's IP on the internal Docker bridge network.

```
Docker Compose internal network (172.x.x.0/16):

    cloudflared  ─── can reach ──>  web (172.x.x.2:5173)
         |                          api (172.x.x.3:8000)
         |                          postgres (172.x.x.4:5432)
         |
    (only cloudflared talks to the outside world)
```

`postgres` has no tunnel route and no published port. It is only reachable from
other containers on the same Docker network.

---

## 5) Cloudflare Access (Zero Trust)

### The problem Access solves

You have a web app and API that should only be usable by you. Traditional
approaches:

- **Build login into the app**: Now you maintain passwords, sessions, MFA,
  password reset, brute-force protection...
- **IP allowlisting**: Doesn't work when you access from phone/laptop/cafe.
- **VPN**: Works, but adds client software and latency.

Cloudflare Access takes a different approach: **authenticate at the edge,
before the request ever reaches your app.**

### How Access works

```
Without Access:
    Browser -> Cloudflare -> Your App -> "who are you?" -> login page

With Access:
    Browser -> Cloudflare -> "who are you?" -> GitHub login
                          -> identity verified -> JWT attached -> Your App
                          -> request rejected if not allowed
```

Access is a reverse proxy authentication layer. It sits between Cloudflare's
edge and your tunnel, and enforces identity checks based on policies you define.

### The authentication flow (step by step)

```
1. User visits https://momentum.example.com

2. Cloudflare DNS resolves to Cloudflare edge

3. Cloudflare checks: "Is there an Access policy for this hostname?"
   -> Yes: momentum.example.com has an Access application

4. Cloudflare checks: "Does this request have a valid Access session cookie?"
   -> No (first visit): redirect to login

5. User is redirected to:
   https://your-team.cloudflareaccess.com/cdn-cgi/access/login/momentum.example.com

6. Login page shows configured identity providers (GitHub in our case)

7. User clicks "Sign in with GitHub" -> GitHub OAuth flow:
   a. Redirect to github.com/login/oauth/authorize
   b. User authenticates with GitHub
   c. GitHub redirects back to Cloudflare with an authorization code
   d. Cloudflare exchanges code for GitHub user info (email, username)

8. Cloudflare checks the Access policy:
   "Is this email in the allow list?"
   -> Yes: create session, set cookie, issue JWT
   -> No: show "forbidden" page

9. Request is forwarded through the tunnel with two extra headers:
   - Cf-Access-Jwt-Assertion: <signed JWT with user identity>
   - Cookie: CF_Authorization=<session token>

10. Your API receives the request with the JWT already attached
```

### JWTs: what's in them and how we validate

A JWT (JSON Web Token) is a signed, base64-encoded JSON payload. Cloudflare
signs it with an RSA private key. We verify it with the corresponding public
key.

The JWT looks like this (decoded):

```json
{
  "aud": ["32-char-hex-audience-tag"],     // which Access app issued this
  "email": "you@example.com",              // from GitHub
  "sub": "unique-user-identifier",         // stable user ID
  "iss": "https://your-team.cloudflareaccess.com",
  "iat": 1708100000,                       // issued at (unix timestamp)
  "exp": 1708186400,                       // expires at (24h later)
  "type": "app",
  "identity_nonce": "..."
}
```

Our API validates this token in `backend/app/auth.py`:

1. **Extract token** from the `Cf-Access-Jwt-Assertion` header.
2. **Fetch Cloudflare's public keys** from
   `https://your-team.cloudflareaccess.com/cdn-cgi/access/certs`
   (these are JWKs -- JSON Web Keys). Cached after first fetch.
3. **Verify signature** using PyJWT: confirms the token was signed by
   Cloudflare and hasn't been tampered with.
4. **Check audience** (`aud`): confirms the token was issued for our specific
   Access application, not some other app in the same Cloudflare account.
5. **Check expiration**: rejects expired tokens.
6. **Extract identity**: pulls `email` and `sub` claims and creates an `Actor`
   object used throughout the request lifecycle for audit trails.

```
Validation flow inside the API:

    Request arrives
        |
        v
    Is AUTH_MODE=dev?
    |              |
    YES            NO
    |              |
    v              v
    Trust          Extract Cf-Access-Jwt-Assertion header
    X-Dev-User-    |
    Email header   v
    |              Fetch JWKs from Cloudflare (cached)
    v              |
    Actor{         v
      human,       Verify JWT signature + audience + expiry
      email        |
    }              v
                   Actor{
                     human,
                     sub,
                     email
                   }
```

### Access applications and policies

We create two Access applications in the Cloudflare Zero Trust dashboard:

```
Application 1: "Momentum Web"
  Domain: momentum.example.com
  Policy: Allow if (email = you@example.com AND login method = GitHub)
  Session duration: 24 hours

Application 2: "Momentum API"
  Domain: momentum-api.example.com
  Policy: Allow if (email = you@example.com AND login method = GitHub)
  Session duration: 24 hours
  Audience tag: <this goes in CLOUDFLARE_ACCESS_AUDIENCE env var>
```

Why two applications? Separate policies mean you can independently control
access to the web UI and the API. This matters for Phase 3 when the OpenClaw
agent will access the API through a service token but should never access the
web UI.

### Service tokens (Phase 3 -- defined now, built later)

For agent access, Cloudflare Access supports **service tokens** -- essentially
a client-id and client-secret pair that machines use instead of browser-based
OAuth. The agent will send:

```
Cf-Access-Client-Id: <service-token-id>
Cf-Access-Client-Secret: <service-token-secret>
```

Cloudflare verifies these and issues a JWT with `type: "app"` (no email claim
because it's a machine identity). The API validates the JWT the same way but
maps it to `actor_type=agent` instead of `actor_type=human`.

A dedicated Access policy will scope the service token to `/agent/v1/*` routes
only, keeping agent and human access cleanly separated.

### Zero Trust: the philosophy behind Access

"Zero Trust" means: **don't trust the network location of a request. Always
verify identity.** Traditional corporate security uses a VPN -- once you're
"inside," you're trusted. Zero Trust says every request must prove who it is,
regardless of where it comes from.

For Momentum, this means:
- Accessing from home WiFi? Prove your identity.
- Accessing from your phone on cellular? Prove your identity.
- Accessing from a coffee shop? Same thing.
- The VPS never trusts a request just because it arrived through the tunnel --
  it always checks the JWT.

---

## 6) Cloudflare R2 (Object Storage)

### What R2 is

R2 is Cloudflare's object storage service. It's functionally identical to
Amazon S3 -- you upload files (called "objects") into named containers (called
"buckets") and retrieve them by key.

The key advantage of R2 over S3: **zero egress fees**. S3 charges you when you
download your own data. R2 doesn't. For backups you might need to restore
urgently, this matters.

### How we use it

Nightly, a cron job runs `infra/backup/backup_to_r2.sh`, which:

```
1. pg_dump the database (custom format, compressed)
2. Encrypt with AES-256-CBC using a passphrase (openssl)
3. Upload to R2 bucket via AWS CLI (S3-compatible API)
```

```
Backup flow:

    postgres container                          Cloudflare R2
    |                                           |
    | pg_dump -Fc                               |
    v                                           |
    raw_dump.dump                                |
    |                                           |
    | openssl enc -aes-256-cbc                  |
    v                                           |
    raw_dump.dump.enc                            |
    |                                           |
    | aws s3 cp (S3-compatible API)             |
    +-----------------------------------------> |
                                                | s3://productivity-backups/
                                                |   postgres/
                                                |     productivity_20260217T030000Z.dump.enc
```

### S3-compatible API

R2 speaks the same API protocol as Amazon S3. This means:

- You use the standard `aws` CLI tool to interact with it.
- You point it at R2's endpoint instead of AWS:
  `--endpoint-url https://<account-id>.r2.cloudflarestorage.com`
- Authentication uses the same access-key/secret-key scheme as AWS IAM.
- Existing tools, libraries, and scripts that work with S3 work with R2
  unchanged.

### Configuration for R2

```env
BACKUP_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=productivity-backups
BACKUP_S3_PREFIX=postgres
BACKUP_AWS_REGION=auto           # R2 doesn't use regions, but CLI requires one
AWS_ACCESS_KEY_ID=<r2-key>
AWS_SECRET_ACCESS_KEY=<r2-secret>
BACKUP_ENCRYPTION_PASSPHRASE=<long-random-passphrase>
```

The R2 API keys are generated in the Cloudflare dashboard under
R2 > Manage R2 API Tokens. They're scoped to specific buckets.

---

## 7) Full Request Lifecycle

Let's trace a complete request from browser to database and back. This ties
every service together.

### Scenario: you open Momentum on your phone and create a task

```
Phase A: DNS Resolution
========================

Your phone's browser: "I need to reach momentum.example.com"

Phone OS                    Cloudflare DNS
  |                              |
  |  A/AAAA query               |
  +----------------------------->
  |                              |  Looks up zone, finds CNAME
  |  Response: 104.21.89.12     |  to tunnel, returns edge IP
  <-----------------------------+
  |                              |


Phase B: TLS + Access Authentication (first visit)
===================================================

Phone Browser               Cloudflare Edge (104.21.89.12)
  |                              |
  |  TLS ClientHello            |
  +----------------------------->
  |  TLS ServerHello + cert     |  (Cloudflare's TLS cert for your domain)
  <-----------------------------+
  |  TLS handshake complete     |
  |                              |
  |  GET / HTTP/2               |
  +----------------------------->
  |                              |  Access policy check: no session cookie
  |  302 Redirect to login      |
  <-----------------------------+
  |                              |
  |  (GitHub OAuth dance)       |
  |  <=========================>  (browser <-> GitHub <-> Cloudflare)
  |                              |
  |  Set-Cookie: CF_Authorization=...
  <-----------------------------+
  |                              |


Phase C: Authenticated Request Through Tunnel
==============================================

Phone Browser               Cloudflare Edge         cloudflared           web container
  |                              |                       |                     |
  |  GET / HTTP/2               |                       |                     |
  |  Cookie: CF_Authorization   |                       |                     |
  +----------------------------->                       |                     |
  |                              |                       |                     |
  |                              | Validate session      |                     |
  |                              | Attach JWT header     |                     |
  |                              |                       |                     |
  |                              | Forward via tunnel    |                     |
  |                              +---------------------->|                     |
  |                              |  (over QUIC)          |                     |
  |                              |                       | http://web:5173/    |
  |                              |                       +-------------------->|
  |                              |                       |                     |
  |                              |                       |  HTML + JS bundle   |
  |                              |                       |<--------------------+
  |                              |  Response             |                     |
  |                              |<----------------------+                     |
  |  HTML response              |                       |                     |
  |<-----------------------------                       |                     |


Phase D: API Call (creating a task)
====================================

Browser JS                  Cloudflare Edge         cloudflared           api container
  |                              |                       |                     |
  |  POST /v1/tasks             |                       |                     |
  |  Cookie: CF_Authorization   |                       |                     |
  |  Body: {title, goal_ids}    |                       |                     |
  +----------------------------->                       |                     |
  |                              |                       |                     |
  |                              | Validate session      |                     |
  |                              | Attach header:        |                     |
  |                              |  Cf-Access-Jwt-       |                     |
  |                              |  Assertion: eyJ...    |                     |
  |                              |                       |                     |
  |                              +--- tunnel ----------->|                     |
  |                              |                       |                     |
  |                              |                       | http://api:8000     |
  |                              |                       | POST /v1/tasks      |
  |                              |                       | + JWT header        |
  |                              |                       +-------------------->|
  |                              |                       |                     |
  |                              |                       |   auth.py:          |
  |                              |                       |   verify JWT sig    |
  |                              |                       |   check audience    |
  |                              |                       |   extract email     |
  |                              |                       |   -> Actor{human}   |
  |                              |                       |                     |
  |                              |                       |   domain.py:        |
  |                              |                       |   validate task     |
  |                              |                       |   link to goals     |
  |                              |                       |   emit audit event  |
  |                              |                       |                     |
  |                              |                       |   -> postgres       |
  |                              |                       |   INSERT task       |
  |                              |                       |   INSERT links      |
  |                              |                       |   INSERT audit      |
  |                              |                       |                     |
  |                              |                       |  201 Created + task |
  |                              |                       |<--------------------+
  |                              |<----------------------+                     |
  |  201 + task JSON            |                       |                     |
  |<-----------------------------                       |                     |
```

### What about latency?

The full path adds latency from two hops: browser -> Cloudflare -> VPS. In
practice:

- **DNS**: cached after first lookup (~0ms after first request)
- **TLS**: done once per session (~50-100ms, then reused)
- **Access auth**: done once per 24h session (zero cost on subsequent requests)
- **Tunnel hop**: ~5-20ms (Cloudflare edge to your VPS). `cloudflared` connects
  to the nearest Cloudflare data center, so this is typically low.
- **Total overhead vs direct**: roughly 10-30ms per request

For a single-user productivity app, this is imperceptible.

---

## 8) Networking Concepts Beyond TCP/HTTP

Here are the networking concepts used in this architecture that go beyond basic
"browser sends HTTP request, server responds."

### 8.1) Reverse Proxy

A reverse proxy sits in front of your server and forwards requests to it. The
client never talks to your server directly -- it talks to the proxy.

```
Without reverse proxy:     Client ──> Server
With reverse proxy:        Client ──> Proxy ──> Server
```

Cloudflare is a reverse proxy for Momentum. Every request hits Cloudflare first.
Cloudflare decides whether to forward it (after auth checks, DDoS filtering,
etc.) or reject it.

Why "reverse"? A forward proxy (like a corporate web filter) sits in front of
*clients*. A reverse proxy sits in front of *servers*. The "reverse" is from
whose perspective the proxy operates.

### 8.2) TLS Termination

TLS (Transport Layer Security, successor to SSL) encrypts HTTP traffic. When
someone visits `https://momentum.example.com`, the connection is encrypted.

**TLS termination** means: Cloudflare is the endpoint that decrypts the HTTPS
connection. Your VPS never handles TLS certificates or decryption.

```
Browser <──── TLS encrypted ────> Cloudflare <──── tunnel (encrypted) ────> VPS

The browser thinks it's talking to your server (because the TLS cert matches
your domain), but Cloudflare is the one holding the private key and doing
the decryption.

The tunnel from Cloudflare to your VPS is separately encrypted (QUIC includes
TLS 1.3 by default), so data is encrypted in transit at all times.
```

This means:
- You never manage TLS certificates. Cloudflare provisions and renews them
  automatically (via Let's Encrypt or their own CA).
- Certificate renewal failures (a common cause of outages) can't happen
  on your end.

### 8.3) QUIC Protocol (tunnel transport)

QUIC is a transport protocol developed by Google and standardized as RFC 9000.
It runs on top of UDP (not TCP) and provides:

```
Traditional stack:          QUIC stack:

 HTTP/2                      HTTP/3
   |                           |
 TLS 1.2/1.3                QUIC (includes TLS 1.3)
   |                           |
 TCP                         UDP
   |                           |
 IP                          IP
```

Why this matters for the tunnel:

| Property | TCP | QUIC |
|----------|-----|------|
| Connection setup | 2-3 round trips (TCP handshake + TLS handshake) | 1 round trip (combined) |
| Head-of-line blocking | One lost packet blocks everything | Lost packets only block their own stream |
| Connection migration | IP change = new connection | Connection survives IP changes |
| Multiplexing | Yes (HTTP/2) but with HOL blocking | Yes, without HOL blocking |

The practical benefit: the tunnel stays up reliably, reconnects fast after
brief network issues, and can carry multiple concurrent requests efficiently.

### 8.4) Connection Multiplexing

When `cloudflared` connects to Cloudflare, it doesn't open a new connection
for each request. Instead, it maintains a small number of persistent connections
and **multiplexes** many requests over them.

```
Without multiplexing:

    Request 1 ──── Connection A ────> Cloudflare
    Request 2 ──── Connection B ────> Cloudflare
    Request 3 ──── Connection C ────> Cloudflare
    (N requests = N connections, wasteful)

With multiplexing:

    Request 1 ─┐
    Request 2 ─┼── Connection A ────> Cloudflare
    Request 3 ─┘
    (N requests share few connections, efficient)
```

Each request gets its own "stream" within the connection. Streams are
independent -- if one is slow, it doesn't block the others. This is how
`cloudflared` handles multiple concurrent users (or in our case, multiple
browser tabs / API calls) without connection overhead.

### 8.5) JWKs (JSON Web Key Sets)

When our API receives a JWT from Cloudflare, it needs to verify the signature.
But it doesn't have Cloudflare's private key (nor should it). Instead:

1. Cloudflare publishes its **public keys** at a well-known URL:
   `https://your-team.cloudflareaccess.com/cdn-cgi/access/certs`
2. This URL returns a JWKS (JSON Web Key Set) -- a JSON document listing
   the current public keys.
3. Our API fetches this once, caches it, and uses the appropriate key to verify
   JWT signatures.

```
Token signing and verification:

    Cloudflare (has private key)          Our API (has public key)
         |                                      |
         | Signs JWT with private key           |
         |                                      |
         | Cf-Access-Jwt-Assertion: eyJ...      |
         +------------------------------------->|
                                                |
                                                | Fetches public key from
                                                | /cdn-cgi/access/certs
                                                | (cached after first call)
                                                |
                                                | Verifies signature
                                                | using public key
                                                |
                                                | If valid: trust the claims
                                                | If invalid: reject request
```

This is asymmetric cryptography in practice: the private key signs, the public
key verifies. Anyone can verify, but only Cloudflare can sign.

### 8.6) OAuth 2.0 / OIDC (the GitHub login flow)

When Cloudflare Access redirects you to GitHub, it's using OAuth 2.0:

```
1. Cloudflare redirects browser to GitHub:
   "Hey GitHub, this user wants to prove their identity.
    Here's my client_id. Send them back to my callback URL."

2. GitHub shows login page (if not already logged in).

3. User authenticates with GitHub (username/password, 2FA, etc.)

4. GitHub redirects back to Cloudflare with an authorization code:
   "Here's a short-lived code. Exchange it for user info."

5. Cloudflare (server-to-server) exchanges the code with GitHub:
   "Here's the code + my client_secret. Give me the user's profile."

6. GitHub responds with: email, username, etc.

7. Cloudflare now knows who the user is and can enforce its Access policy.
```

You never build or maintain any of this. Cloudflare handles the entire OAuth
dance. You just tell it "use GitHub as an identity provider" and "allow this
email address."

### 8.7) Docker Networking (internal service discovery)

Docker Compose creates a private bridge network for all services in a compose
file. Each service gets:
- An IP address on that network (assigned by Docker)
- A DNS name matching its service name (resolved by Docker's embedded DNS)

```
Docker bridge network (e.g., 172.20.0.0/16):

    +-----------------+     +-----------------+     +-----------------+
    | cloudflared     |     | api             |     | postgres        |
    | 172.20.0.2      |     | 172.20.0.4      |     | 172.20.0.5      |
    |                 |     |                 |     |                 |
    | Can reach:      |     | Can reach:      |     | Can reach:      |
    |  web:5173       |     |  postgres:5432  |     |  (listens only) |
    |  api:8000       |     |                 |     |                 |
    +-----------------+     +-----------------+     +-----------------+

    +-----------------+
    | web             |
    | 172.20.0.3      |
    |                 |
    | Can reach:      |
    |  api:8000       |
    +-----------------+

    This network is INVISIBLE from the host's public interface.
    No ports are mapped to the host in deploy mode.
    The only way in is through cloudflared's tunnel.
```

In the **deploy** compose file, no `ports:` are defined for any service.
This means even if someone knows your VPS IP, they can't reach any service
directly. The only ingress path is through the Cloudflare tunnel.

In the **local** compose file, ports are mapped (`5173:5173`, `8000:8000`,
`5432:5432`) so you can access services from your host machine during
development.

---

## 9) How the Pieces Map to Our Code

### Configuration (`backend/app/config.py`)

```python
# Auth mode switches between local dev and Cloudflare-protected production
auth_mode: Literal["dev", "cloudflare"]

# These are used to validate JWTs in Cloudflare mode
cloudflare_team_domain: str     # e.g., "your-team.cloudflareaccess.com"
cloudflare_access_audience: str  # the AUD tag from the Access application

# Derived: URL where we fetch Cloudflare's public signing keys
@property
def cloudflare_certs_url(self) -> str:
    return f"https://{self.cloudflare_team_domain}/cdn-cgi/access/certs"
```

### Authentication (`backend/app/auth.py`)

```python
# In dev mode: trust the X-Dev-User-Email header (no Cloudflare involved)
# In cloudflare mode:
#   1. Extract JWT from Cf-Access-Jwt-Assertion header
#   2. Fetch JWKs from Cloudflare (cached via lru_cache)
#   3. Verify signature, audience, and expiry
#   4. Extract email + subject -> Actor(human, subject, email)
```

### Infrastructure (`infra/docker-compose.deploy.yml`)

```yaml
# cloudflared runs as a Docker service alongside your app
# It authenticates to Cloudflare with the tunnel token
# It routes traffic to web and api containers by Docker service name
cloudflared:
  image: cloudflare/cloudflared:latest
  command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```

### Backups (`infra/backup/backup_to_r2.sh`)

```bash
# Uses standard AWS CLI pointed at R2's S3-compatible endpoint
# Encryption happens locally before upload (your data is encrypted at rest)
aws s3 cp "${final_path}" "s3://${BACKUP_S3_BUCKET}/${object_key}" \
  --endpoint-url "${BACKUP_S3_ENDPOINT}"
```

### Environment variables (`.env`)

```
Cloudflare-related env vars and what they control:

CLOUDFLARE_TUNNEL_TOKEN          -> cloudflared authenticates to Cloudflare
CLOUDFLARE_TEAM_DOMAIN           -> API fetches JWKs for JWT verification
CLOUDFLARE_ACCESS_AUDIENCE       -> API checks JWT audience claim
BACKUP_S3_ENDPOINT               -> Backup script talks to R2
AWS_ACCESS_KEY_ID                -> R2 API authentication
AWS_SECRET_ACCESS_KEY            -> R2 API authentication
TASKS_WEB_DOMAIN                 -> Used in tunnel hostname routing
TASKS_API_DOMAIN                 -> Used in tunnel hostname routing
CORS_ORIGINS                     -> API restricts to production web domain
```

---

## 10) What You're Not Using (and Why)

Cloudflare offers many services. Here's what we're deliberately not using and
why, so you have a clear boundary of scope:

| Service | What it does | Why we skip it |
|---------|-------------|----------------|
| **Workers** | Serverless JS/TS at the edge | Our app runs on a VPS. No need for edge compute. |
| **Pages** | Static site hosting | We serve our frontend from the VPS via Docker. Could migrate later. |
| **KV / D1 / Durable Objects** | Edge databases | Postgres on VPS is our database. Single source of truth. |
| **WAF (Web Application Firewall)** | Rule-based request filtering | Access already gates everything. WAF rules could be added but aren't needed for single-user. |
| **Load Balancing** | Distribute across multiple origins | One VPS. Nothing to balance. |
| **Argo Smart Routing** | Optimized routing paths (paid) | Marginal latency gain for a single-user app. |
| **Cache** | CDN caching of responses | Our app is dynamic (API calls). Frontend assets could be cached but the benefit is minimal at this scale. |
| **Stream / Images** | Media delivery | No media in this app. |

---

## 11) Mental Models and Analogies

### The Nightclub Analogy

```
Cloudflare DNS      = The address of the nightclub (people can find it)
Cloudflare Access   = The bouncer at the door (checks your ID)
Cloudflare Tunnel   = A private back entrance (staff-only, no public door)
Your VPS            = The actual nightclub (where things happen)
Cloudflare R2       = A safety deposit box at a bank (backups of valuables)

The nightclub has NO front door facing the street.
The only way in is through the bouncer, who escorts you
through the private entrance.
```

### The Trust Layers

```
Layer 0: Public Internet
  Anyone can try to reach your domain.
  Cloudflare absorbs attacks, filters garbage.

Layer 1: Cloudflare Access
  Only authenticated users with allowed identities pass.
  Everyone else gets a login page or a rejection.

Layer 2: Cloudflare Tunnel
  Traffic that passed Access is forwarded to your VPS.
  Your VPS has no public ports, so this is the only path in.

Layer 3: API JWT Validation
  Your API double-checks the JWT signature.
  Defense in depth: even if the tunnel were somehow bypassed,
  the API wouldn't accept unsigned requests.

Layer 4: Application Authorization
  Domain logic checks if the actor is allowed to perform
  the specific operation (e.g., hard-delete requires owner).

Layer 5: Database
  Postgres is isolated on Docker internal network.
  No external access. Only the API container can connect.
```

### What "Zero Inbound Ports" Really Means

```
Traditional server:                 Your VPS with Cloudflare Tunnel:

  iptables / firewall rules:         iptables / firewall rules:
  ALLOW inbound TCP 22  (SSH)        ALLOW inbound TCP 22  (SSH)
  ALLOW inbound TCP 80  (HTTP)       (that's it)
  ALLOW inbound TCP 443 (HTTPS)
  ALLOW inbound TCP 5432 (PG??)

  Attack surface:                    Attack surface:
  - SSH brute force                  - SSH brute force (consider key-only)
  - HTTP vulnerabilities             - (nothing else is reachable)
  - TLS implementation bugs
  - Direct app exploitation
  - Database exposure risk

You reduce your attack surface from "multiple open services" to "SSH only."
(And SSH can be further hardened with key-only auth and IP restrictions.)
```

---

## Summary

Cloudflare provides the security perimeter for Momentum. Here's the minimum you
need to hold in your head:

1. **DNS** points your domain at Cloudflare, not at your VPS. Your VPS IP stays
   private.

2. **Tunnel** (`cloudflared`) makes outbound connections from your VPS to
   Cloudflare. Requests arrive through those connections. No ports need to be
   opened on the VPS.

3. **Access** authenticates users via GitHub OAuth before requests reach your
   app. The API double-checks by validating the JWT that Access attaches.

4. **R2** stores encrypted database backups via an S3-compatible API.

Everything else -- the app logic, the database, the frontend, the audit trail --
runs on your VPS inside Docker containers on a private network. Cloudflare is
the public-facing shell; your VPS is the private core.

```
The whole system in one line:

  Browser -> DNS -> Access -> Tunnel -> cloudflared -> app -> postgres
             |        |         |
          (resolve) (authn)  (transport)
             |        |         |
         Cloudflare services, all at the edge
```
