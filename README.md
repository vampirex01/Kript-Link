# URL Shortener

A full-stack URL shortener built with Fastify, Prisma, Redis, BullMQ, and Next.js.

## Workspace

- `apps/api` - Fastify API, redirect engine, auth, analytics
- `apps/web` - Next.js dashboard
- `packages/shared` - shared TypeScript types

## Quick Start

1. Copy `.env.example` to `.env` and set values.
2. Provide local infrastructure:
   - Preferred: Docker Desktop + `npm run db:up`
   - Alternative: install PostgreSQL + Redis natively and run them on `localhost:5432` and `localhost:6379`
3. Install dependencies:
   - `npm install`
4. Run migrations:
   - `Copy-Item .env apps/api/.env -Force`
   - `npm run prisma:migrate`
5. Seed database:
   - `npm run prisma:seed`
6. Run API:
   - `npm run dev:api`
7. Run Web:
   - `npm run dev:web`

## Dependency Management

- Start local Postgres + Redis: `npm run db:up`
- Stop containers: `npm run db:down`
- Stream service logs: `npm run db:logs`

## Notes

- API defaults to port `3001`.
- Web defaults to port `3000`.
- Redis and PostgreSQL are required for full functionality.

## UI Status

The web app currently includes:

- Landing page
- Authentication pages (`/login`, `/register`, `/forgot-password`)
- Dashboard links list with search/filter/sort/pagination
- Create link modal
- Link edit page (core fields + geo rules + delete)
- Analytics page with charts (timeseries, geo, referrer channels, device breakdown)
- Settings page (API keys, domains, webhooks)

If you want, the next UI chunk can focus on:

- Better mobile navigation and table/card behavior for dense analytics screens
- Toast notifications and optimistic updates
- Stronger empty states and loading skeletons
- Full token handling via secure cookie session flow

## Deployment

### Recommended stack

- Web: Vercel (for `apps/web`)
- API + Worker: Railway or Render (for `apps/api`)
- Database: managed PostgreSQL (Railway/Neon/Supabase)
- Redis: managed Redis (Upstash/Railway Redis)

### 1) Deploy API (Railway/Render)

Use `apps/api/Dockerfile`.

Required environment variables:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `BASE_URL` (public short-link base URL, e.g. `https://short.yourdomain.com`)
- `CORS_ORIGIN`
- `NODE_ENV=production`
- Optional: `IPINFO_TOKEN`, `GOOGLE_SAFE_BROWSING_API_KEY`, `WORKER_CONCURRENCY`

If you deploy with the included VPS Caddy setup, also define:

- `SHORT_DOMAIN` (e.g. `short.yourdomain.com`)

Start command (if not using Docker CMD):

- API: `npx prisma migrate deploy && node dist/index.js`

### 2) Deploy Worker (separate service)

Create a second service from the same `apps/api` source with command:

- `npm run worker`

Worker uses the same env as API (`DATABASE_URL`, `REDIS_URL`, etc).

### 3) Deploy Web (Vercel)

Project root: `apps/web`

Environment variable on Vercel:

- `NEXT_PUBLIC_API_URL=https://YOUR_API_DOMAIN`

After deploy, set API CORS:

- `CORS_ORIGIN=https://YOUR_WEB_DOMAIN`

### 4) Production checklist

1. Verify API health endpoint: `/health`
2. Run migrations in production: `npx prisma migrate deploy`
3. Test auth flow (register/login)
4. Create a link and test redirect
5. Confirm analytics appears after clicks
6. Confirm worker is consuming queue jobs
