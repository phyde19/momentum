# Architecture Tradeoffs — Cloudflare Tunnel + Access vs Alternatives

A structured comparison of the approach Momentum uses against the most common
alternatives. Written for someone who wants to understand not just what we
chose, but why, and what we'd lose or gain by going a different direction.

---

## Table of Contents

1. [The core question](#1-the-core-question)
2. [The spectrum of approaches](#2-the-spectrum-of-approaches)
3. [Tier 1: Traditional VPS with Nginx](#3-tier-1-traditional-vps-with-nginx)
4. [Tier 2: Cloudflare as CDN/proxy only](#4-tier-2-cloudflare-as-cdnproxy-only)
5. [Tier 3+4: Cloudflare Tunnel + Access (what Momentum does)](#5-tier-34-cloudflare-tunnel--access-what-momentum-does)
6. [Alternative: Auth-as-a-Service (Auth0, Clerk, Supabase)](#6-alternative-auth-as-a-service-auth0-clerk-supabase)
7. [Alternative: Managed platform (Fly.io, Railway, Render)](#7-alternative-managed-platform-flyio-railway-render)
8. [Alternative: Cloudflare Pages + Workers (fully at the edge)](#8-alternative-cloudflare-pages--workers-fully-at-the-edge)
9. [Auth: the comparison in isolation](#9-auth-the-comparison-in-isolation)
10. [Decision matrix](#10-decision-matrix)
11. [When the current choice would stop being right](#11-when-the-current-choice-would-stop-being-right)

---

## 1) The core question

Every approach to deploying a web app has to answer the same set of questions:

```
1. How does traffic reach my server?       (networking / ingress)
2. Who is allowed to use my app?           (authentication)
3. What can authenticated users do?        (authorization)
4. How is traffic encrypted in transit?    (TLS)
5. How do I protect against abuse/attacks? (firewall / DDoS)
6. How are my secrets / data protected?    (security posture)
```

The interesting thing is that different architectures answer these questions at
different layers. Understanding *where* each question is answered is more useful
than memorizing a list of trade-offs.

---

## 2) The spectrum of approaches

```
                        WHERE IS THE WORK DONE?
          ←──────────────────────────────────────────────────────→
          You build it              Shared responsibility         Platform handles it

Security  Open port 443             Cloudflare absorbs DDoS      Managed platform
          Manage firewall           Cloudflare WAF rules          controls all networking

TLS       Let's Encrypt via         Cloudflare terminates         Platform provisions
          Nginx/Caddy               TLS, auto-renews              and renews for you

Auth      Build login system        Cloudflare Access + IdP       Auth-as-a-Service
          Manage sessions           GitHub OAuth via CF           (Auth0, Clerk)

Infra     Your VPS, your ops        Your VPS, CF in front         Fully managed
          work                                                    (Fly, Railway)


 Tier 1   Tier 2        Tier 3+4                                  Alternatives
 Nginx    CF proxy      CF Tunnel                                 Managed platforms
 only     only          + Access
                        (Momentum)
```

---

## 3) Tier 1: Traditional VPS with Nginx

The baseline approach. Most tutorials teach this. Most hobby projects and small
SaaS applications use it.

```
Browser ──── HTTPS ────> VPS public IP:443
                              |
                         Nginx (reverse proxy + TLS via Let's Encrypt)
                              |
                         App (port 3000 / 8000)
                              |
                         Postgres (port 5432, ideally only on localhost)
```

### What you manage

- **Open ports.** Port 443 (HTTPS) and 22 (SSH) are open to the internet.
  Port 80 is often open too (for TLS certificate renewal redirects).
- **TLS certificates.** Certbot + Let's Encrypt handles renewal, but
  misconfiguration or renewal failures have caused real outages. You own this.
- **Nginx configuration.** Reverse proxy rules, headers, rate limiting, CORS
  — all in nginx.conf, all your responsibility to get right.
- **Firewall rules.** You need to manually block traffic that shouldn't reach
  your server. On most VPS providers this is via `ufw` or `iptables`.
- **Your server IP is public.** DNS resolves to your VPS's IP. Attackers can
  find your server and probe it directly.
- **Auth is entirely your problem.** The Nginx layer has no concept of user
  identity. You build login, sessions, and password management in the app.

### What's good about it

- **Universally understood.** Every web developer knows this stack. Tutorials,
  answers, and help are everywhere.
- **No vendor coupling.** Nginx, Let's Encrypt, and your app are all
  open-source. You can move to any host, any provider.
- **Simple mental model.** Request comes in on 443, Nginx forwards it,
  app processes it. No intermediaries to reason about.
- **Auth is fully under your control.** You can implement exactly the user
  model your app needs — roles, permissions, multi-tenancy, custom flows.

### What's hard about it

```
Problem                     What it costs you
─────────────────────────────────────────────────────────────────────────
TLS renewal failure         Surprise outage. Happens more than you'd think.
Server IP exposed           Direct attack surface. DDoS hits you directly.
Auth implementation         Weeks of work to do correctly (see Section 9).
Session management          Cookie security, CSRF, session stores, expiry.
Password storage            bcrypt, salting, constant-time comparison.
Rate limiting / brute force You build it or use a middleware library.
MFA                         You build it or pay for it separately.
Keeping dependencies patched Ongoing maintenance burden.
```

### When Tier 1 is the right choice

- You're building a multi-tenant product with custom auth requirements (roles,
  user management, self-service registration, enterprise SSO).
- You need complete control over every layer.
- You're on a team comfortable with operational overhead.
- You've already built auth infrastructure you want to reuse.

---

## 4) Tier 2: Cloudflare as CDN/Proxy Only

The most common Cloudflare usage. You keep the Tier 1 setup exactly as-is and
flip the "proxy" toggle for your DNS records in the Cloudflare dashboard.

```
Browser ──── HTTPS ────> Cloudflare edge ──── HTTP or HTTPS ────> VPS:443
                              |
                    (absorbs DDoS, caches static,
                     terminates TLS on edge,
                     still has no idea who the user is)
```

### What Cloudflare adds

- **DDoS absorption.** Volumetric attacks hit Cloudflare's network, not your
  VPS. Your server stays up during most attacks.
- **TLS at the edge.** Cloudflare manages the browser-facing TLS cert. You
  can optionally use a Cloudflare Origin Certificate for the leg between
  Cloudflare and your VPS.
- **Static asset caching.** JS bundles, images, etc. can be served from
  Cloudflare's edge, reducing load on your origin.
- **Analytics and firewall rules.** Basic WAF, bot management, and traffic
  analytics.

### What doesn't change

- **Your VPS still has port 443 open to the internet.** Cloudflare recommends
  only accepting traffic from their IP ranges (documented at
  `https://www.cloudflare.com/ips/`), but this is extra configuration many
  people skip, meaning your server is still reachable directly.
- **Auth is still your problem.** Cloudflare (in this mode) doesn't know who
  the user is and doesn't care. Your app still needs a full login system.
- **Your server IP can often still be found.** SSL certificate transparency
  logs, historical DNS records, and other methods can reveal your origin IP.

### When Tier 2 is the right choice

- You want DDoS protection and basic CDN benefits with minimal setup change.
- You're running a public-facing site or SaaS with real users who need login.
- You already have auth built and just want to add a protective layer in front.

---

## 5) Tier 3+4: Cloudflare Tunnel + Access (What Momentum Does)

This is the architecture this project uses.

```
Browser ──── HTTPS ────> Cloudflare DNS
                              |
                         Cloudflare Access
                         (identity check via GitHub OAuth)
                              |         ↑ only allowed identities pass
                         Cloudflare Tunnel
                              |
                         cloudflared (Docker container on VPS)
                              |
                    ┌─────────┴─────────┐
                 web:5173          api:8000
                    │                  │
                    └────── postgres ───┘
                              (internal only)
```

### What this changes

- **Zero inbound ports** (beyond SSH). The VPS has no publicly reachable
  application ports. `cloudflared` makes outbound connections to Cloudflare.
- **Your VPS IP is never in DNS.** DNS resolves to Cloudflare edge IPs.
  There's no route to your server except through the tunnel.
- **Auth is delegated to Cloudflare Access.** GitHub handles credential
  verification; Cloudflare handles sessions and issues JWTs. Your app validates
  the JWT (~15 lines of code) but builds none of the auth infrastructure.
- **TLS is handled entirely by Cloudflare.** No cert management on the VPS.

### Unique advantages for this use case

```
Advantage                    Why it matters for Momentum
───────────────────────────────────────────────────────────────────────
Zero open ports              Dramatically reduced attack surface.
                             Nothing to port-scan or probe directly.

No auth to build             Saved weeks of work.
                             No password storage, no session management,
                             no CSRF tokens, no brute-force protection,
                             no MFA implementation.

GitHub 2FA is inherited      If you have 2FA on GitHub (you should),
                             Momentum automatically gets 2FA too.

SSH still works normally      Only application ports are tunneled.
                             You still SSH directly to the VPS.

Agent auth scales the         Service tokens use the same pattern.
same way                      Add one Access policy, one code branch.
                              No second auth system.

Free TLS, auto-renewed        One fewer failure mode.
```

### The trade-offs of this approach

```
Trade-off                    What it means
───────────────────────────────────────────────────────────────────────
Cloudflare dependency        If Access has an outage, nobody can log in.
                             (In practice, Access has excellent uptime,
                              but the theoretical coupling is real.)

Not suitable for public       Access is designed for identity-gated apps,
registration                  not for "sign up with your email" SaaS.
                              Everyone who can log in must be explicitly
                              listed in an Access policy.

Learning curve                The Tunnel + Access mental model is less
                              familiar than Nginx + Let's Encrypt. More
                              concepts to understand upfront.

Vendor lock-in (partial)      Removing Cloudflare later requires adding
                              app-level auth. The interface in auth.py
                              is clean enough that this is a day of work,
                              not a rewrite — but the work is real.

Tunnel latency overhead       Every request makes an extra hop through
                              Cloudflare. In practice ~10-30ms extra.
                              Imperceptible for a personal productivity
                              app; might matter for latency-sensitive apps.
```

---

## 6) Alternative: Auth-as-a-Service (Auth0, Clerk, Supabase)

A popular middle-ground: keep your own infrastructure and networking (Tier 1 or
2), but outsource the identity layer to a specialized service.

```
Browser ──> Nginx ──> Your App ──> (validates JWT from auth provider)
                |
                └──> Auth0 / Clerk / Supabase Auth
                     (handles login UI, sessions, OAuth, MFA, user management)
```

### What you get

- A hosted login page and user management UI.
- OAuth integrations (GitHub, Google, etc.) already built.
- Session management, refresh tokens, MFA — all handled.
- A user database with a management dashboard.
- JWTs issued by the auth service, validated by your app (same pattern as
  Cloudflare Access JWTs, just from a different issuer).

### What you still own

- **All your networking.** Port 443 is still open. TLS is still yours.
  You still need Nginx or a reverse proxy.
- **Your user data.** User records exist in the auth provider's database.
  You're coupling to a service that holds your users' identities.
- **Authorization.** Auth-as-a-Service handles authentication (who you are)
  but not authorization (what you can do). You still write permission checks
  in your app.

### Comparison to Cloudflare Access

```
                    Cloudflare Access         Auth-as-a-Service
                    (what Momentum uses)      (Auth0/Clerk/Supabase)
────────────────────────────────────────────────────────────────────
Login UI            Hosted by Cloudflare      Hosted by provider
OAuth with GitHub   Yes                       Yes
Session management  Cloudflare manages        Provider manages
MFA                 Via GitHub's MFA          Built-in, configurable
User management     Access policy = allowlist User database + dashboard
Self-registration   No                        Yes (if you enable it)
Public sign-up      Not designed for it       Yes
Cost (small scale)  Free                      Free tier, then $25-100/mo
Networking          Eliminates open ports     Does not affect networking
                    (tunnel)                  (you still need Nginx)
Vendor dependency   Cloudflare                Auth0/Clerk/Supabase
Migration path      Add app-level OAuth       Switch providers
Port exposure       None (tunnel removes it)  Port 443 still open
```

### When Auth-as-a-Service is the right choice

- You're building a public product where anyone can register.
- You need user management features (reset passwords for users, suspend
  accounts, audit user activity).
- You need multiple user roles with different permissions.
- You want to decouple auth vendor from infrastructure vendor.

### When it's overkill for Momentum

Auth-as-a-Service is designed for apps with many users. Momentum has exactly
one: you. The self-registration flows, user management dashboards, and role
systems that justify the complexity and cost of these products don't add value
for a single-user system. And critically, Auth-as-a-Service doesn't help with
the networking problem — port 443 is still open and your server IP is still
exposed.

---

## 7) Alternative: Managed Platform (Fly.io, Railway, Render)

These platforms run your containers for you and handle networking, TLS, and
scaling. You push your Docker image; they run it.

```
Your code ──> Docker image ──> Platform registry ──> Platform runs it
                                                          |
                                                    Platform handles:
                                                    - TLS (automatic)
                                                    - DNS (custom domains)
                                                    - Load balancing
                                                    - Scaling (if configured)
                                                    - Port 443 ingress
```

### What you get

- No VPS to maintain. No OS updates, no Docker installation, no disk management.
- Automatic TLS.
- Built-in observability (logs, metrics) on some platforms.
- Faster initial deployment (skip VPS provisioning).
- Horizontal scaling if you ever need it.

### What you lose or trade

```
Trade-off                    What it means
───────────────────────────────────────────────────────────────────────
Cost at scale                Free tiers are limited. A FastAPI app +
                             Postgres on Fly.io or Railway costs $5-20/mo
                             at minimum. Can grow with usage.

Less control                 The platform controls the runtime environment.
                             You can't install arbitrary system packages,
                             access raw network interfaces, or adjust kernel
                             parameters. Usually fine, occasionally limiting.

Data gravity                 Postgres managed by a platform is easy to start,
                             harder to migrate away from. Backups and restores
                             work differently per platform.

Auth still your problem      Managed platforms do not provide authentication.
                             You'd still need to build it or use Auth-as-a-
                             Service on top.

No VPS for other uses        The VPS running Momentum also runs other things
                             (dev workspace, OpenClaw agent, etc). Splitting
                             to a managed platform for Momentum only adds
                             cost without benefit for this setup.
```

### Comparison to VPS + Cloudflare Tunnel

```
                    VPS + Cloudflare Tunnel       Managed Platform
                    (what Momentum uses)
────────────────────────────────────────────────────────────────────
Ops overhead        Moderate (VPS maintenance)    Low (platform manages it)
Cost                ~$5-10/mo VPS + CF free       ~$10-25/mo for similar spec
TLS                 Cloudflare handles it         Platform handles it
Networking          Zero open ports               Platform handles ingress
                    (tunnel)                      (ports are open at edge)
Auth                Cloudflare Access             Your problem
Postgres backup     Custom R2 scripts             Platform may offer managed
                                                  backups (at cost)
Vendor dependency   Cloudflare                    Fly/Railway/Render
Migration           Move containers anywhere      Depends on platform APIs
Co-located services Other VPS services continue   Isolated platform only
```

### When a managed platform is the right choice

- You don't want to manage a VPS at all.
- You're building a product that needs to scale beyond one instance.
- You don't have other services running on the same machine.
- The platform's cost fits your budget.

---

## 8) Alternative: Cloudflare Pages + Workers (Fully at the Edge)

You could go all-in on Cloudflare's compute infrastructure: serve the frontend
from Cloudflare Pages and run backend logic in Cloudflare Workers (or Workers
with D1 as the database).

```
Browser ──> Cloudflare Pages (static frontend, global CDN)
               |
               ──> Cloudflare Workers (API logic, runs at edge)
                       |
                       ──> Cloudflare D1 (SQLite-compatible DB at edge)
                           or Cloudflare KV (key-value store)
```

### What you get

- Globally distributed. Your app runs close to the user, everywhere.
- Zero infrastructure to manage. No VPS, no Docker, no Postgres server.
- Scales to zero cost when not in use.
- TLS, DDoS, routing — all handled.

### What the trade-offs are

```
Trade-off                    What it means for Momentum
───────────────────────────────────────────────────────────────────────
Runtime constraints          Workers run JavaScript/TypeScript (or WASM).
                             The FastAPI backend is Python. Rewriting it
                             to Workers is a significant migration.

SQLite vs Postgres           D1 is SQLite-compatible. Our schema and query
                             patterns are built for Postgres. SQLAlchemy +
                             Postgres-specific types and features would
                             need to change.

Execution model              Workers have a 10ms CPU time limit on the
                             free tier (50ms on paid). Heavier operations
                             (large queries, complex domain logic) need care.

All-or-nothing               This approach only makes sense if you migrate
                             everything. You can't run the Python API on
                             Workers without a rewrite.

Cost surprise potential      D1, Workers, and KV all have free tiers that
                             are generous but have usage caps. A bug causing
                             excessive reads can run up a bill.

Vendor lock-in (deepest)     Workers APIs (D1, KV, R2, Durable Objects)
                             are not standard. Migrating away later is the
                             most expensive option of all.
```

### When this approach makes sense

- You're starting from scratch in JavaScript/TypeScript.
- Global latency matters (serving users in many geographic regions).
- You want to minimize cold infrastructure management entirely.
- You're comfortable with the Workers runtime constraints.

For Momentum specifically, this would be a significant Python-to-TypeScript
rewrite of the backend with no benefit for a single-user local app. The
latency benefits of edge compute aren't perceptible when there's one user who
is always roughly the same geographic distance from one VPS.

---

## 9) Auth: the comparison in isolation

Since auth is often the most consequential decision, here is a dedicated side-
by-side comparison of the approaches.

### What "build your own auth" actually requires

```
Feature                  Minimum viable         Production quality
──────────────────────────────────────────────────────────────────
Registration             Email + password form  + Email verification
                                                + Duplicate detection
                                                + Strength requirements

Password storage         bcrypt hash            + Per-user salt
                                                + Constant-time comparison
                                                + Key stretching (argon2)

Login                    Check hash, set cookie + Rate limiting
                                                + Brute-force lockout
                                                + CSRF protection
                                                + Account enumeration prevention

Session management       Server-side session    + Secure + HttpOnly + SameSite
                         store (DB or Redis)      cookie flags
                                                + Session expiry + renewal
                                                + Revocation on password change
                                                + Logout across all devices

Password reset           Time-limited token     + Single-use tokens
                         via email              + Email delivery infra
                                                + Rate limit on reset requests

MFA                      (optional minimum)     TOTP + recovery codes
                                                + Backup methods
                                                + Replay protection

OAuth / social login     Callback route         + State param (CSRF)
                         Token exchange         + Token exchange server-side
                         User mapping           + Redirect URI validation
```

### The auth comparison table

```
                    Build it          Auth-as-a-Service   Cloudflare Access
                    yourself          (Auth0/Clerk)        (what Momentum uses)
────────────────────────────────────────────────────────────────────────────────
Time to implement   Weeks-months      Hours-days          Hours (Cloudflare
                                                          config) +
                                                          ~15 lines of code

Ongoing maintenance High (patch       Low (provider       Very low (JWT
                    deps, sec         handles it)          validation library
                    advisories)                           stays stable)

Self-registration   Yes               Yes                 No — allowlist only
Public signup       Yes               Yes                 Not designed for it
User management     Build it          Provider dashboard  Access policy only
Roles/permissions   Build it          RBAC built-in       App-level only
MFA                 Build it          Built-in            Via IdP (GitHub MFA)
Password reset      Build it          Built-in            No passwords exist
Cost                Dev time only     Free tier + paid    Free
                    (ongoing ops)     per MAU

Networking impact   None              None                Also eliminates
                                                          open ports (tunnel)
Vendor dependency   None              Auth provider       Cloudflare
Migration path      N/A               Hard (user data     Add OAuth (~1 day
                    (you own it)      is in provider DB)  of work)
Lines of auth code  Hundreds to       Dozens (SDK calls)  ~15 (JWT validation)
in your app         thousands
```

### The bottom line on auth for Momentum

The Cloudflare Access approach eliminates the entire auth implementation burden
while adding a constraint that is a non-issue for this use case: no self-
registration. When the universe of users is exactly one (you), an explicit
allowlist isn't a constraint at all — it's just a description of reality.

The closest comparable trade-off would arise if you ever wanted to share access
with another person (a partner, a collaborator). Adding them to an Access policy
takes 30 seconds. Adding a second user to a "build it yourself" system
would work fine too. Neither approach becomes a bottleneck until you're talking
about tens or hundreds of users, at which point the architecture would need
rethinking regardless.

---

## 10) Decision Matrix

When choosing an approach for a project like this, the key questions are:

```
Question                            Implication
──────────────────────────────────────────────────────────────────────────
How many users?
  1-5, known people              -> Access allowlist works perfectly
  Hundreds, public               -> Auth-as-a-Service or build it
  Thousands, regulated           -> Build it with full compliance controls

How sensitive is the data?
  Personal / single-user         -> Access + tunnel (strong posture, low effort)
  Business / multi-user          -> Defense-in-depth, audited auth

Do you need user management?
  No                             -> Access: no user database needed
  Yes (suspend, reset, audit)    -> Auth-as-a-Service or build it

Can you tolerate a vendor dependency?
  One vendor (Cloudflare) ok     -> Tunnel + Access is efficient
  Want zero vendor coupling      -> Tier 1 (Nginx + Let's Encrypt)

Are you running a VPS already?
  Yes                            -> Tunnel costs nothing extra
  No, want zero infra            -> Managed platform

What's the team's operational comfort?
  Comfortable with VPS           -> Tunnel + Access
  Want managed infra             -> Railway/Fly.io
  Want fully managed + edge      -> Workers + Pages + D1
```

### Momentum's position on this matrix

```
Users:              1 (you). Allowlist is appropriate.
Data sensitivity:   High personal data. Strong security posture is worth it.
User management:    None needed. Access policy is sufficient.
Vendor dependency:  One vendor (Cloudflare) is acceptable.
VPS:                Already running one for other purposes.
Ops comfort:        High — comfortable with Docker, VPS, shell scripts.

Result: Tunnel + Access is the optimal choice on every dimension for this use case.
```

---

## 11) When the Current Choice Would Stop Being Right

The current architecture has known failure modes. Here are the conditions under
which you'd want to migrate away from each piece:

### When to drop Cloudflare Access

- You need other people (more than 5-10) to register and use the app without
  you manually adding their email to an allowlist.
- You need fine-grained roles (admin, read-only, contributor) that are per-user
  and dynamic, not just a static allowlist.
- You need to work with an enterprise SSO system (SAML) that doesn't integrate
  cleanly with Access.
- **Migration path:** Add app-level authentication (NextAuth, Auth0, or a
  simple JWT-based system). The `get_current_actor` function in `auth.py` is
  the only thing that changes — the rest of the app is identity-agnostic.

### When to drop Cloudflare Tunnel

- Your VPS's outbound connection to Cloudflare has reliability problems for
  some unusual reason (rare, but possible in certain network environments).
- You need connections that Cloudflare doesn't support (raw TCP, UDP
  application protocols other than HTTP/S).
- You want to eliminate the Cloudflare dependency entirely.
- **Migration path:** Open port 443, install Nginx or Caddy, point DNS at
  your VPS IP. Auth handling changes (see above) but application code is
  unchanged.

### When to move off a single VPS

- The single VPS becomes a reliability concern (you need > 99.9% uptime with
  redundancy).
- The app grows to serve other users and the VPS becomes a scaling bottleneck.
- **Migration path:** Docker Compose → Docker Swarm or Kubernetes. The
  containerized architecture means migrating is moving compose files to a
  different orchestrator, not rewriting the app.

### When to move off R2

- You need point-in-time recovery, not just nightly snapshots.
- You want integrated Postgres managed backups (from Railway, Fly, Supabase).
- **Migration path:** Swap the backup script endpoint. The `pg_dump` + `aws s3 cp`
  pattern works with any S3-compatible storage (AWS S3, Backblaze B2, etc.)
  with only endpoint/credential changes.

---

## Summary

```
For a single-user personal tool running on a VPS you already own:

  Cloudflare Tunnel + Access is arguably the optimal choice.

  - Security posture: stronger than any Tier 1/2 approach (zero open ports)
  - Auth cost: near-zero (vs weeks of build time or $25+/mo for Auth-as-a-Service)
  - Ops cost: low (no cert management, no session store, no auth dependencies)
  - Vendor coupling: one vendor (Cloudflare), migratable in ~1 day if needed

  The same choice would be wrong for:
  - Public products where users self-register
  - Apps needing fine-grained per-user permissions
  - Teams who want zero vendor coupling
  - Projects that need edge-global performance
```

The goal was not to pick the most common approach or the most sophisticated one.
It was to pick the approach that answers all the deployment questions correctly
for this specific context — with the minimum ongoing maintenance burden. That
analysis points clearly at Tunnel + Access, which is why the project uses it.
