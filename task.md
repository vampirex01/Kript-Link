# URL Shortener — Complete Build Guide

> Work through each phase in order. Check off tasks as you complete them.
> Every phase produces a working, deployable state — never leave a phase half-done.

---

## Phase 0 — Project setup & tooling

### 0.1 Repository & environment
- [ ] Create a new Git repository (`url-shortener`)
- [ ] Create `.gitignore` (node_modules, .env, dist, coverage)
- [ ] Create root `README.md` with project description
- [ ] Create `/.env.example` with all required env var keys (no values)
- [ ] Copy `.env.example` → `.env` and fill in local values

### 0.2 Monorepo structure
Create the following folder structure:
```
url-shortener/
├── apps/
│   ├── api/          # Node.js backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Shared TypeScript types
├── .env
├── .env.example
└── package.json      # Root workspace config
```
- [ ] Init root `package.json` with `"workspaces": ["apps/*", "packages/*"]`
- [ ] Install root dev dependencies: `typescript`, `eslint`, `prettier`
- [ ] Create shared `tsconfig.base.json` at root
- [ ] Create `packages/shared/src/types.ts` (Link, User, ClickLog interfaces)

### 0.3 Backend scaffold (`apps/api`)
- [ ] `npm init` inside `apps/api`
- [ ] Install: `fastify`, `@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/multipart`
- [ ] Install: `prisma`, `@prisma/client`, `ioredis`, `bullmq`, `nanoid`, `bcrypt`, `zod`
- [ ] Install dev: `tsx`, `nodemon`, `@types/node`, `@types/bcrypt`
- [ ] Create `apps/api/src/index.ts` — basic Fastify server on port 3001
- [ ] Verify server starts: `npm run dev`

### 0.4 Frontend scaffold (`apps/web`)
- [ ] `npx create-next-app@latest apps/web --typescript --tailwind --app`
- [ ] Install: `axios`, `swr`, `recharts`, `react-hook-form`, `zod`, `@hookform/resolvers`
- [ ] Install: `lucide-react`, `clsx`, `qrcode`
- [ ] Verify Next.js dev server starts on port 3000

### 0.5 Database setup
- [ ] Install and start PostgreSQL locally (or use Railway/Neon for cloud)
- [ ] Install and start Redis locally (or use Upstash for cloud)
- [ ] Add `DATABASE_URL` and `REDIS_URL` to `.env`
- [ ] Run `npx prisma init` inside `apps/api`
- [ ] Verify `prisma/schema.prisma` was created

---

## Phase 1 — Database schema

### 1.1 Write Prisma schema
Create `apps/api/prisma/schema.prisma` with the following models:

- [ ] **Team** model:
  ```
  id, name, slug (unique), plan, createdAt
  ```

- [ ] **User** model:
  ```
  id, email (unique), passwordHash, plan, role, teamId (FK),
  createdAt, updatedAt
  ```

- [ ] **Link** model:
  ```
  id, userId (FK), slug (unique), destinationUrl, title,
  active (default true), expiresAt, scheduledAt, passwordHash,
  maxClicks, clickCount (default 0), createdAt, updatedAt
  ```

- [ ] **ClickLog** model:
  ```
  id, linkId (FK), clickedAt, ipHash, country, city, region,
  deviceType, browser, os, referrer, utmSource, utmMedium,
  utmCampaign, utmTerm, utmContent, isBot, language
  ```

- [ ] **GeoRule** model:
  ```
  id, linkId (FK), countryCode, deviceType, language,
  redirectUrl, priority, createdAt
  ```

- [ ] **ApiKey** model:
  ```
  id, userId (FK), keyHash (unique), label, scopes (String[]),
  lastUsedAt, expiresAt, createdAt
  ```

- [ ] **CustomDomain** model:
  ```
  id, userId (FK), domain (unique), verified (default false),
  sslStatus, createdAt
  ```

- [ ] **LinkStats** model (pre-aggregated, updated by cron):
  ```
  id, linkId (FK unique), totalClicks, uniqueClicks,
  clicksToday, clicks7d, clicks30d, topCountry,
  topReferrer, updatedAt
  ```

### 1.2 Indexes
Add the following indexes in schema.prisma:
- [ ] `@@index([linkId, clickedAt])` on ClickLog — all analytics queries use this
- [ ] `@@index([userId, createdAt])` on Link — dashboard link list
- [ ] `@@index([linkId, priority])` on GeoRule — routing rule lookup
- [ ] `@@index([slug])` on Link — redirect lookup (already unique, so indexed)

### 1.3 Run migration
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Verify all tables created: `npx prisma studio`
- [ ] Seed one test user and one test link via `prisma/seed.ts`
- [ ] Run `npx prisma db seed` and verify seed data in Studio

---

## Phase 2 — Core redirect engine

> This is the most performance-critical code in the entire project. Get it right before adding features.

### 2.1 Redis client
- [ ] Create `apps/api/src/lib/redis.ts` — singleton ioredis client
- [ ] Export `getAsync(key)`, `setAsync(key, value, ttlSeconds)`, `delAsync(key)` helpers
- [ ] Write a test: set a key, get it back, verify value

### 2.2 Slug generator
- [ ] Create `apps/api/src/lib/sluggen.ts`
- [ ] Function `generateSlug()`: uses nanoid with alphabet `[a-zA-Z0-9]`, length 7
- [ ] Function `isSlugAvailable(slug, prisma)`: checks DB + Redis blacklist
- [ ] Function `generateUniqueSlug(prisma)`: loops generateSlug until isSlugAvailable
- [ ] Unit test: generate 10000 slugs, verify no duplicates, verify all match regex

### 2.3 Redirect handler
- [ ] Create `apps/api/src/routes/redirect.ts`
- [ ] Register route: `GET /:slug`
- [ ] Step 1: Check Redis cache for `slug:${slug}` → if hit, use cached destination
- [ ] Step 2: If cache miss → query Prisma for link where `slug = slug AND active = true`
- [ ] Step 3: If not found → return 404 with JSON error
- [ ] Step 4: Check `expiresAt` — if expired → return 410 Gone
- [ ] Step 5: Check `maxClicks` — if reached → return 410 Gone
- [ ] Step 6: Check `passwordHash` — if set → return 401 with `requiresPassword: true`
- [ ] Step 7: Check `scheduledAt` — if in the future → return 404
- [ ] Step 8: Run geo rules (see section 2.4)
- [ ] Step 9: Cache result in Redis with TTL 3600 seconds
- [ ] Step 10: Enqueue click log job (async, do NOT await)
- [ ] Step 11: Return `302` redirect to destination URL
- [ ] Load test: verify redirect completes in < 80ms with warm cache

### 2.4 Geo routing
- [ ] Install MaxMind GeoLite2: `npm install maxmind`
- [ ] Download `GeoLite2-City.mmdb` from MaxMind (free account required)
- [ ] Create `apps/api/src/lib/geo.ts` — load mmdb file, export `lookupIP(ip): GeoResult`
- [ ] Create `apps/api/src/lib/router.ts` — function `resolveDestination(link, geoResult, userAgent, acceptLanguage)`:
  - [ ] Load geo rules for this linkId (cache in Redis for 60s)
  - [ ] Sort rules by priority ascending
  - [ ] For each rule: check if country, deviceType, language all match (null = wildcard)
  - [ ] Return first matching rule's `redirectUrl`, or link's `destinationUrl` as fallback
- [ ] Test with mock visitor from BD, US, and unknown country

### 2.5 Password interstitial
- [ ] Create API route: `POST /api/links/:slug/unlock`
- [ ] Accept body: `{ password: string }`
- [ ] Compare with bcrypt against `link.passwordHash`
- [ ] On success: return `{ destination: url }` + set short-lived cookie `unlocked_${slug}`
- [ ] On failure: increment attempt counter in Redis, return 401
- [ ] After 10 failed attempts from same IP: return 429 Too Many Requests

### 2.6 Analytics queue worker
- [ ] Create `apps/api/src/workers/clickWorker.ts`
- [ ] Define BullMQ queue named `"click-events"`
- [ ] Worker processes each job:
  - [ ] Parse user-agent string (install `ua-parser-js`)
  - [ ] Look up geo from IP hash using MaxMind
  - [ ] Parse referrer domain from `referrer` header
  - [ ] Parse UTM params from destination URL query string
  - [ ] Detect bot: check UA against known crawler list
  - [ ] Write to `ClickLog` table
  - [ ] Increment `Link.clickCount` by 1
- [ ] Start worker in `apps/api/src/index.ts`
- [ ] Test: fire a redirect, verify ClickLog row created within 2 seconds

---

## Phase 3 — Authentication

### 3.1 JWT setup
- [ ] Add `JWT_SECRET` to `.env` (generate with `openssl rand -base64 32`)
- [ ] Register `@fastify/jwt` plugin in Fastify with the secret
- [ ] Create `apps/api/src/lib/auth.ts`:
  - [ ] `signTokens(userId)` → returns `{ accessToken (15min), refreshToken (30d) }`
  - [ ] `verifyAccess(token)` → returns userId or throws
- [ ] Create Fastify preHandler hook `requireAuth` — reads `Authorization: Bearer <token>`, attaches `request.user`

### 3.2 Auth routes
- [ ] `POST /api/auth/register`:
  - [ ] Validate body: `{ email, password }` with Zod (password min 8 chars)
  - [ ] Check email not already in use
  - [ ] Hash password with bcrypt (rounds: 12)
  - [ ] Create User in DB
  - [ ] Return `{ user, accessToken, refreshToken }`
- [ ] `POST /api/auth/login`:
  - [ ] Validate email + password
  - [ ] Fetch user, compare bcrypt hash
  - [ ] Return `{ user, accessToken, refreshToken }`
- [ ] `POST /api/auth/refresh`:
  - [ ] Accept `{ refreshToken }` in body
  - [ ] Verify token, issue new access token
- [ ] `POST /api/auth/logout`:
  - [ ] Add refresh token to Redis blocklist with TTL = token remaining lifetime
- [ ] Test all 4 routes with a REST client (Insomnia/Postman)

### 3.3 Rate limiting on auth
- [ ] Register `@fastify/rate-limit` plugin
- [ ] Apply to `/api/auth/login`: max 10 requests per 15 minutes per IP
- [ ] Apply to `/api/auth/register`: max 5 per hour per IP
- [ ] Return 429 with `retryAfter` header when limit hit

---

## Phase 4 — Link management API

### 4.1 Create link — `POST /api/links`
- [ ] Apply `requireAuth` preHandler
- [ ] Validate body with Zod:
  ```
  destinationUrl: url (required)
  slug?: string (3-50 chars, alphanumeric + hyphens, optional)
  title?: string (max 200 chars)
  expiresAt?: ISO datetime
  scheduledAt?: ISO datetime
  password?: string
  maxClicks?: positive integer
  ```
- [ ] If custom slug provided: check availability, throw 409 if taken
- [ ] If no slug: call `generateUniqueSlug()`
- [ ] If password: bcrypt hash it before storing
- [ ] Validate destination URL is not in phishing blacklist (check against safe-browsing API or a local blocklist)
- [ ] Create Link in DB
- [ ] Return created link object

### 4.2 List links — `GET /api/links`
- [ ] Apply `requireAuth`
- [ ] Query params: `page` (default 1), `limit` (default 20, max 100), `search`, `status` (active/expired/all), `sort` (created/clicks)
- [ ] Join with `LinkStats` for click counts
- [ ] Return `{ links: [...], total, page, pages }`

### 4.3 Get single link — `GET /api/links/:id`
- [ ] Apply `requireAuth`
- [ ] Verify link belongs to requesting user
- [ ] Include `LinkStats`, `GeoRule[]`, and `CustomDomain` in response

### 4.4 Edit link — `PATCH /api/links/:id`
- [ ] Apply `requireAuth`, verify ownership
- [ ] Accept any subset of: `destinationUrl`, `title`, `active`, `expiresAt`, `maxClicks`, `password`
- [ ] Slug change: only allow if new slug is available
- [ ] If `destinationUrl` changed: re-run phishing check
- [ ] Invalidate Redis cache entry for this slug: `DEL slug:${slug}`
- [ ] If new slug: also cache under new slug, delete old cache key
- [ ] Return updated link

### 4.5 Delete link — `DELETE /api/links/:id`
- [ ] Apply `requireAuth`, verify ownership
- [ ] Soft-delete: set `active = false` (do not delete row — preserve analytics)
- [ ] Invalidate Redis cache
- [ ] Return 204 No Content

### 4.6 Bulk create — `POST /api/links/bulk`
- [ ] Apply `requireAuth`
- [ ] Accept array of up to 1000 link objects
- [ ] Process in batches of 100 (avoid DB timeout)
- [ ] Return array of `{ index, success, link?, error? }`

### 4.7 Geo rules — `PUT /api/links/:id/geo-rules`
- [ ] Apply `requireAuth`, verify ownership
- [ ] Accept array of geo rule objects: `{ countryCode, deviceType, language, redirectUrl, priority }`
- [ ] Replace all existing rules for this link (delete + insert)
- [ ] Invalidate geo rules cache: `DEL georules:${linkId}`
- [ ] Return updated rule set

---

## Phase 5 — Analytics API

### 5.1 Stats aggregator (cron job)
- [ ] Create `apps/api/src/jobs/aggregateStats.ts`
- [ ] Runs every 5 minutes (use `node-cron`)
- [ ] For each link with new clicks since last run:
  - [ ] Count total clicks, unique IP hashes
  - [ ] Count clicks in last 24h, 7d, 30d
  - [ ] Find top country (mode of country column)
  - [ ] Find top referrer domain (mode of referrer column)
  - [ ] Upsert into `LinkStats` table
- [ ] Register cron in `apps/api/src/index.ts`

### 5.2 Summary endpoint — `GET /api/links/:id/analytics`
- [ ] Apply `requireAuth`, verify ownership
- [ ] Query params: `period` = `7d | 30d | 90d | all`
- [ ] Return:
  ```json
  {
    "totalClicks": 0,
    "uniqueClicks": 0,
    "clicksInPeriod": 0,
    "topCountry": "BD",
    "topReferrer": "facebook.com",
    "topDevice": "mobile",
    "topBrowser": "Chrome",
    "botPercentage": 0.02
  }
  ```

### 5.3 Time series — `GET /api/links/:id/analytics/timeseries`
- [ ] Query params: `granularity` = `hour | day | week`, `from`, `to` (ISO dates)
- [ ] Run SQL: `SELECT date_trunc($granularity, clickedAt), COUNT(*) FROM ClickLog WHERE linkId = $id AND clickedAt BETWEEN $from AND $to GROUP BY 1 ORDER BY 1`
- [ ] Return array of `{ date, clicks }` — fill in zero-value dates for gaps

### 5.4 Geo breakdown — `GET /api/links/:id/analytics/geo`
- [ ] Return top 50 countries with click counts and percentage of total
- [ ] Also return top 20 cities within the period

### 5.5 Referrer breakdown — `GET /api/links/:id/analytics/referrers`
- [ ] Group by referrer domain
- [ ] Categorise into channels: `social`, `email`, `search`, `direct`, `other`
  - social: facebook.com, twitter.com, instagram.com, linkedin.com, t.co, etc.
  - search: google.com, bing.com, duckduckgo.com, etc.
  - email: mail.google.com, outlook.live.com, etc.
- [ ] Return: `{ byDomain: [...], byChannel: [...] }`

### 5.6 Device breakdown — `GET /api/links/:id/analytics/devices`
- [ ] Return click breakdown by: `deviceType`, `browser`, `os`
- [ ] Include `isBot` split

### 5.7 Export — `GET /api/links/:id/analytics/export`
- [ ] Query params: `format` = `csv | json`, `from`, `to`
- [ ] Max 100,000 rows per request (return 400 if range too large)
- [ ] Stream response for large exports (don't buffer full result in memory)
- [ ] Set `Content-Disposition: attachment; filename="clicks-{slug}-{date}.csv"`

---

## Phase 6 — Advanced link features

### 6.1 QR code generation — `GET /api/links/:id/qr`
- [ ] Install `qrcode` package
- [ ] Query params: `size` (px, default 300), `format` (png|svg), `color` (hex), `bgColor` (hex)
- [ ] Generate QR for `https://yourdomain.com/{slug}`
- [ ] Return image with correct Content-Type header (`image/png` or `image/svg+xml`)

### 6.2 Custom domains — `POST /api/domains`
- [ ] Accept body: `{ domain: string }`
- [ ] Validate domain format (regex)
- [ ] Check domain not already registered by another user
- [ ] Create `CustomDomain` record with `verified = false`
- [ ] Return CNAME record instructions: `CNAME {domain} → links.yourdomain.com`
- [ ] `POST /api/domains/:id/verify`: check DNS CNAME resolves correctly (use `dns.resolve()`)
- [ ] `DELETE /api/domains/:id`: remove domain
- [ ] Update redirect handler to accept requests on custom domains

### 6.3 API keys — `POST /api/api-keys`
- [ ] Apply `requireAuth`
- [ ] Accept body: `{ label, scopes: string[], expiresAt? }`
- [ ] Valid scopes: `links:read`, `links:write`, `analytics:read`, `domains:manage`
- [ ] Generate a key: `sk_live_{nanoid(32)}`
- [ ] Store SHA-256 hash of key (never store plaintext)
- [ ] Return key **once** (plaintext) — user must copy it now
- [ ] `GET /api/api-keys`: list keys (show label, scopes, lastUsedAt — never the key itself)
- [ ] `DELETE /api/api-keys/:id`: revoke key
- [ ] Update `requireAuth` to also accept `Authorization: Bearer sk_live_...` API keys

### 6.4 Webhooks — `POST /api/webhooks`
- [ ] Apply `requireAuth`
- [ ] Accept body: `{ url, events: ['click'] }`
- [ ] Validate URL is reachable (HEAD request with timeout)
- [ ] Store webhook config in DB (add `Webhook` model to schema)
- [ ] In click worker: after writing ClickLog, enqueue webhook delivery job
- [ ] Webhook delivery worker: POST click payload to webhook URL with HMAC-SHA256 signature header
- [ ] Retry failed deliveries: 3 attempts with exponential backoff (1min, 5min, 30min)

### 6.5 Link-in-bio page (optional bonus)
- [ ] Add `UserProfile` model: `{ username, bio, avatarUrl, theme }`
- [ ] Public page route: `GET /u/:username` → render list of user's public links
- [ ] API: `PUT /api/profile` to update bio, avatar, theme

---

## Phase 7 — Security hardening

### 7.1 Phishing / malware protection
- [ ] Create `apps/api/src/lib/safebrowsing.ts`
- [ ] Implement Google Safe Browsing API v4 lookup (requires API key from Google Cloud)
- [ ] Cache "safe" results for 1 hour in Redis (avoid redundant API calls)
- [ ] Cache "unsafe" results permanently (once flagged, always blocked)
- [ ] Call this check in: create link, edit link destination URL
- [ ] Add a daily re-check job for all active links created in last 30 days

### 7.2 Rate limiting (global)
- [ ] Redirect endpoint: max 120 req/min per IP
- [ ] API endpoints: max 300 req/min per authenticated user
- [ ] Anonymous API: max 30 req/min per IP
- [ ] Burst protection: drop to 10 req/s per IP if sustained 500 req/min detected
- [ ] Store counters in Redis with sliding window algorithm

### 7.3 Abuse reporting
- [ ] Add `LinkReport` model: `{ id, linkId, reporterIp, reason, createdAt }`
- [ ] Public endpoint `POST /report/:slug`: accept `{ reason }`, create report
- [ ] Auto-disable link if it receives 5+ reports in 24 hours
- [ ] Email notification to link owner on first report
- [ ] Admin endpoint `GET /api/admin/reports`: paginated report queue
- [ ] Admin endpoint `POST /api/admin/reports/:id/resolve`: mark reviewed, reinstate or keep disabled

### 7.4 Input sanitisation
- [ ] All user-supplied strings: run through `validator.js` for type checking
- [ ] Destination URLs: reject `javascript:`, `data:`, `vbscript:`, `file://` schemes
- [ ] Custom slugs: allowlist `[a-zA-Z0-9-_]` only, min 3, max 50 chars
- [ ] Reject slugs that are reserved words: `api`, `admin`, `login`, `signup`, `www`, `app`, `u`, `report`
- [ ] Title/label fields: strip HTML tags before storing

### 7.5 Privacy compliance
- [ ] Never store raw IP addresses — store `SHA256(ip + daily_salt)` only
- [ ] Daily salt rotates at midnight — old hashes become unlinkable
- [ ] Store salt in Redis with 48h TTL
- [ ] Add `DELETE /api/account` endpoint to purge all user data (GDPR right to erasure)
- [ ] Add link to Privacy Policy in all email footers

---

## Phase 8 — Frontend dashboard

### 8.1 Authentication pages
- [ ] `/login` — email + password form, redirect to `/dashboard` on success
- [ ] `/register` — sign up form with email, password, confirm password
- [ ] `/forgot-password` — email input, show "check your email" message
- [ ] Implement JWT token storage in `httpOnly` cookie (not localStorage)
- [ ] Create `useAuth()` hook: returns `{ user, login, logout, isLoading }`
- [ ] Protect all `/dashboard` routes: redirect to `/login` if not authenticated

### 8.2 Dashboard — link list (`/dashboard`)
- [ ] Fetch links from `GET /api/links` with SWR
- [ ] Display each link as a card:
  - Short URL (copyable button)
  - Destination URL (truncated)
  - Total clicks (from LinkStats)
  - Active/disabled toggle
  - Created date
  - Edit and Delete buttons
- [ ] Search bar — filter links by title or destination URL
- [ ] Status filter tabs: All / Active / Expired / Disabled
- [ ] Sort dropdown: Newest / Most clicks / Alphabetical
- [ ] Pagination (20 per page)

### 8.3 Create link modal
- [ ] Floating `+ New Link` button
- [ ] Modal with form:
  - [ ] Destination URL input (required, validate on blur)
  - [ ] Custom slug input (optional, availability check on blur — debounced 500ms)
  - [ ] Title input (optional)
  - [ ] Expiry date picker (optional)
  - [ ] Password toggle + input (optional)
  - [ ] Max clicks input (optional)
- [ ] On submit: POST to `/api/links`, show success toast, refresh list
- [ ] Show generated short URL immediately after creation with one-click copy

### 8.4 Edit link page (`/dashboard/links/:id`)
- [ ] Load link data from `GET /api/links/:id`
- [ ] Editable fields: destination URL, title, active toggle, expiry, password, max clicks
- [ ] Geo rules section:
  - [ ] Table of existing rules with edit/delete per row
  - [ ] "Add rule" form: country picker, device type, language, redirect URL, priority
  - [ ] Drag-to-reorder priority (or manual priority number input)
- [ ] Save button — PATCH to `/api/links/:id`, show success/error toast
- [ ] Danger zone section: delete link (confirmation dialog)

### 8.5 Analytics page (`/dashboard/links/:id/analytics`)
- [ ] Stats cards row: Total clicks · Unique · Today · This week
- [ ] Clicks over time chart (Recharts LineChart):
  - [ ] Period selector: 7d / 30d / 90d / all
  - [ ] Granularity selector: hourly / daily / weekly
  - [ ] Smooth line, hover tooltip with exact count
- [ ] Geo section:
  - [ ] Top 10 countries bar chart
  - [ ] Clickable: drill into city breakdown for a country
- [ ] Referrers section:
  - [ ] Donut chart: social / email / search / direct / other
  - [ ] Table: top 10 referrer domains with counts
- [ ] Device section:
  - [ ] Cards: % mobile · % desktop · % tablet
  - [ ] Top 5 browsers bar chart
  - [ ] Top 5 OS bar chart
- [ ] Export button → `GET /api/links/:id/analytics/export?format=csv`
- [ ] QR code display + download button (PNG and SVG)

### 8.6 Settings page (`/dashboard/settings`)
- [ ] Profile section: update name, email, password
- [ ] API keys section:
  - [ ] List existing keys (label, scopes, created, last used)
  - [ ] Create new key: label + scopes checkboxes
  - [ ] Show key once after creation with copy button + warning
  - [ ] Revoke button per key
- [ ] Custom domains section:
  - [ ] List verified and pending domains
  - [ ] Add domain form + CNAME instructions
  - [ ] Verify domain button (polls `POST /api/domains/:id/verify`)
- [ ] Webhooks section:
  - [ ] List webhooks with URL and event types
  - [ ] Add webhook form
  - [ ] Delete webhook

---

## Phase 9 — Performance & infrastructure

### 9.1 Edge caching with Cloudflare (optional but recommended)
- [ ] Create Cloudflare account and add your domain
- [ ] Enable Cloudflare proxy on your domain's DNS
- [ ] Set cache rules: cache `/:slug` GET requests at edge for 60 seconds
- [ ] Set no-cache on `/api/*` routes
- [ ] Enable Cloudflare's Bot Fight Mode
- [ ] Verify redirect latency from remote location < 100ms

### 9.2 Database optimisation
- [ ] Enable connection pooling: install `pg-bouncer` or use Prisma's `pgBouncer` flag
- [ ] Set Postgres `max_connections = 100` for production
- [ ] Add `VACUUM ANALYZE` scheduled weekly on `click_logs`
- [ ] Partition `ClickLog` table by month for databases with > 50M rows:
  - [ ] Create `click_logs_2025_01`, `click_logs_2025_02`, etc. partitions
  - [ ] Set up automatic partition creation trigger
- [ ] Add a read replica for analytics queries (separate from write path)

### 9.3 Redis optimisation
- [ ] Set `maxmemory-policy allkeys-lru` — evict least recently used keys if memory full
- [ ] Set `maxmemory 512mb` (adjust to instance size)
- [ ] Enable Redis persistence: `appendonly yes` (AOF) for rate limit counters
- [ ] Cache link data with appropriate TTLs:
  - Active link: 3600s
  - Geo rules: 300s
  - User session: 86400s

### 9.4 Worker scaling
- [ ] Run click worker as a separate process (`apps/api/src/workers/clickWorker.ts`)
- [ ] Add `WORKER_CONCURRENCY` env var (default 10, tune based on DB capacity)
- [ ] Monitor queue depth: alert if `click-events` queue depth > 10,000
- [ ] Add dead letter queue for failed jobs after 3 retries

### 9.5 Monitoring & alerting
- [ ] Install `pino` for structured JSON logging in Fastify
- [ ] Log every redirect: `{ slug, destination, country, device, durationMs }`
- [ ] Log every error with stack trace
- [ ] Set up uptime monitoring (UptimeRobot free tier or Better Uptime)
- [ ] Alert on: redirect latency p95 > 200ms, error rate > 1%, queue depth > 5000

---

## Phase 10 — Deployment

### 10.1 Environment variables (production)
Ensure these are set in your hosting environment:
```
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
MAXMIND_DB_PATH
GOOGLE_SAFE_BROWSING_API_KEY
BASE_URL                     # https://yourdomain.com
CORS_ORIGIN                  # https://yourdomain.com
NODE_ENV=production
```

### 10.2 API deployment
- [ ] Build TypeScript: `tsc --project tsconfig.json`
- [ ] Write `Dockerfile` for `apps/api`:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY dist/ ./dist/
  CMD ["node", "dist/index.js"]
  ```
- [ ] Deploy to Railway / Render / Fly.io
- [ ] Set all production env vars in hosting dashboard
- [ ] Run `npx prisma migrate deploy` (not `dev`) in production
- [ ] Verify health check endpoint `GET /health` returns 200

### 10.3 Worker deployment
- [ ] Deploy click worker as a separate service (or separate Fly Machine)
- [ ] Worker reads same `DATABASE_URL` and `REDIS_URL` as API
- [ ] Set `WORKER_CONCURRENCY=5` to start

### 10.4 Frontend deployment
- [ ] Set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` in Vercel env vars
- [ ] Deploy `apps/web` to Vercel with `vercel --prod`
- [ ] Verify API calls succeed from deployed frontend (check CORS headers)
- [ ] Set up custom domain on Vercel

### 10.5 DNS configuration
- [ ] Point `yourdomain.com` → Vercel (frontend)
- [ ] Point `api.yourdomain.com` → your API host
- [ ] Point `links.yourdomain.com` → your API host (for custom domain redirects)
- [ ] Enable HTTPS everywhere (Let's Encrypt / Cloudflare SSL)

### 10.6 Post-deployment checklist
- [ ] Create a test link and verify redirect works end-to-end
- [ ] Verify analytics appear in dashboard after clicking the link
- [ ] Verify geo data is populated in ClickLog
- [ ] Test rate limiting: hit redirect 130 times in 60s, verify 429 returned
- [ ] Test phishing protection: submit a known malicious URL, verify it is blocked
- [ ] Test expired link: set `expiresAt` to past, verify 410 returned
- [ ] Test password link: visit link, verify interstitial shown
- [ ] Test API key auth: create a key, make an API call with it
- [ ] Run Lighthouse audit on dashboard: target > 90 performance score

---

## Phase 11 — Pro features (post-launch)

### 11.1 A/B split routing
- [ ] Add `ABVariant` model: `{ id, linkId, destinationUrl, percentage, label }`
- [ ] In redirect handler: if link has AB variants, use weighted random to select destination
- [ ] Log `abVariantId` in ClickLog
- [ ] Analytics: show click distribution across variants

### 11.2 Retargeting pixels
- [ ] Add `RetargetingPixel` model: `{ id, linkId, pixelType (facebook|google), pixelId }`
- [ ] On redirect: serve an HTML interstitial page for ~100ms that fires the pixel, then JS-redirects
- [ ] Only apply if visitor is a real human (not bot)

### 11.3 One-time links
- [ ] Already handled by `maxClicks = 1` — verify this works correctly
- [ ] Add dedicated "one-time link" toggle in the UI for discoverability

### 11.4 Deep links for mobile apps
- [ ] Store `iosScheme` and `androidScheme` on Link model
- [ ] On redirect: detect iOS/Android UA, attempt app scheme first, fall back to web URL
- [ ] Serve a smart interstitial: try `youapp://deeplink`, after 500ms redirect to App Store

### 11.5 Team & billing
- [ ] Implement team invitations: `POST /api/teams/invite { email, role }`
- [ ] Role-based link access: owner, editor (can edit), viewer (analytics only)
- [ ] Integrate Stripe for paid plans:
  - [ ] Free: 100 links, basic analytics, 30-day retention
  - [ ] Pro: unlimited links, full analytics, custom domains, API access
  - [ ] Team: Pro + team management + SLA
- [ ] Enforce plan limits on link creation endpoint
- [ ] Webhook from Stripe on subscription change → update `User.plan`

---

## Ongoing maintenance tasks

- [ ] Update MaxMind GeoLite2 database weekly (schedule in cron)
- [ ] Review and clear dead letter queue weekly
- [ ] Rotate JWT_SECRET quarterly (requires all users to re-login)
- [ ] Review abuse report queue daily
- [ ] Monitor click log table growth — add partition when > 50M rows
- [ ] Update dependencies monthly (`npm audit`, `npm outdated`)
- [ ] Back up PostgreSQL daily — verify restore works monthly

---

## Quick reference — key files

| File | Purpose |
|---|---|
| `apps/api/src/index.ts` | Fastify server entry point |
| `apps/api/src/routes/redirect.ts` | Core redirect handler |
| `apps/api/src/routes/links.ts` | Link CRUD API |
| `apps/api/src/routes/analytics.ts` | Analytics endpoints |
| `apps/api/src/routes/auth.ts` | Auth endpoints |
| `apps/api/src/lib/redis.ts` | Redis client |
| `apps/api/src/lib/geo.ts` | IP geolocation |
| `apps/api/src/lib/router.ts` | Geo rules engine |
| `apps/api/src/lib/sluggen.ts` | Slug generation |
| `apps/api/src/lib/safebrowsing.ts` | Phishing check |
| `apps/api/src/lib/auth.ts` | JWT helpers |
| `apps/api/src/workers/clickWorker.ts` | Analytics queue worker |
| `apps/api/src/jobs/aggregateStats.ts` | Stats cron job |
| `apps/api/prisma/schema.prisma` | Full database schema |
| `apps/web/app/dashboard/page.tsx` | Link list dashboard |
| `apps/web/app/dashboard/links/[id]/analytics/page.tsx` | Analytics view |

---

*Total estimated build time: 6–10 weeks for a solo developer.*
*Phases 1–6 = a fully functional, production-ready URL shortener.*
*Phases 7–10 = production-hardened and deployed.*
*Phase 11 = revenue-generating pro features.*
