# ShortURL Deployment Guide (Ubuntu VPS + Docker)

This guide is fully rewritten as a practical runbook. Follow it top to bottom.

## What You Are Deploying

- Web app (Next.js)
- API (Fastify)
- Worker (click analytics queue consumer)
- PostgreSQL
- Redis
- Caddy reverse proxy with automatic HTTPS

Traffic flow:

- app.yourdomain.com -> web container
- api.yourdomain.com -> api container
- short.yourdomain.com -> api container (redirect-only public short links)

## Prerequisites

- Ubuntu VPS with public IP
- Docker installed
- Docker Compose plugin installed
- DNS A records created:
  - app.yourdomain.com -> VPS IP
  - api.yourdomain.com -> VPS IP
  - short.yourdomain.com -> VPS IP

## 1) Prepare the Server

Run on VPS:

sudo apt update
sudo apt install -y git curl ufw
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

docker --version
docker compose version

If compose plugin is missing:

sudo apt install -y docker-compose-plugin

## 2) Clone the Project

Choose one directory and keep it consistent:

cd /opt
sudo git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git shorturl
sudo chown -R $USER:$USER /opt/shorturl
cd /opt/shorturl

## 3) Create Production Environment File

Copy template:

cp .env.vps.example .env.vps

Edit:

nano .env.vps

Set these required values:

- POSTGRES_PASSWORD
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- BASE_URL
- CORS_ORIGIN
- NEXT_PUBLIC_API_URL
- APP_DOMAIN
- API_DOMAIN
- SHORT_DOMAIN

Optional auto-admin values:

- DEFAULT_ADMIN_EMAIL
- DEFAULT_ADMIN_PASSWORD

Recommended values pattern:

- APP_DOMAIN=app.yourdomain.com
- API_DOMAIN=api.yourdomain.com
- SHORT_DOMAIN=short.yourdomain.com
- BASE_URL=https://short.yourdomain.com
- CORS_ORIGIN=https://app.yourdomain.com
- NEXT_PUBLIC_API_URL=https://api.yourdomain.com
- DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@postgres:5432/shorturl
- REDIS_URL=redis://redis:6379

Generate strong JWT secrets:

openssl rand -base64 48
openssl rand -base64 48

Paste outputs into JWT_SECRET and JWT_REFRESH_SECRET.

If you want the deployment to auto-create your first admin account, set:

- DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
- DEFAULT_ADMIN_PASSWORD=StrongPassword123

Validate length is at least 16:

grep -E '^JWT_SECRET=|^JWT_REFRESH_SECRET=' .env.vps | awk -F= '{print $1, length($2)}'

## 4) Verify DNS Before Deploy

Run:

dig +short app.yourdomain.com
dig +short api.yourdomain.com
dig +short short.yourdomain.com

Both should return your VPS IP.

## 5) Build and Start the Full Stack

From project root:

docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build

Check status:

docker compose -f docker-compose.vps.yml --env-file .env.vps ps

Important:

- The ps command does not build anything.
- Build errors come from the up -d --build command.

## 6) First Health Check

Check logs:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=150 api worker web caddy

Check API endpoint:

curl -I https://api.yourdomain.com/health

Open in browser:

- https://app.yourdomain.com
- https://api.yourdomain.com/health
- https://short.yourdomain.com/exampleSlug (after creating a link)

## 7) Database Schema Initialization

If API logs say no migrations found, run one-time schema bootstrap:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npx prisma db push

Optional seed:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npm run prisma:seed

## 8) Functional Verification

Test in order:

1. Register account from web UI
2. Login
3. Create a short link
4. Open short link and confirm redirect
5. Open analytics page and confirm click data appears

If analytics are missing:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=200 worker

## 9) Standard Update Deployment

For every new release:

cd /opt/shorturl
git pull
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build
docker compose -f docker-compose.vps.yml --env-file .env.vps ps
docker image prune -f

## 10) Rollback Procedure

If a deployment fails:

cd /opt/shorturl
git log --oneline -n 10
git checkout PREVIOUS_COMMIT_HASH
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build

After incident:

git checkout main

## 11) Backup and Restore PostgreSQL

Backup:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec -T postgres pg_dump -U postgres shorturl > backup_shorturl.sql

Restore:

cat backup_shorturl.sql | docker compose -f docker-compose.vps.yml --env-file .env.vps exec -T postgres psql -U postgres -d shorturl

## 12) High-Value Troubleshooting

### A) API and Worker restart loop with env validation errors

Symptoms include:

- JWT_SECRET String must contain at least 16 characters
- JWT_REFRESH_SECRET String must contain at least 16 characters

Fix:

cd /opt/shorturl
nano .env.vps

Regenerate secrets:

openssl rand -base64 48
openssl rand -base64 48

Restart:

docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate api worker

Verify:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=120 api worker

### B) qrcode TypeScript build error during Docker build

Error example:

- TS7016 Could not find declaration file for module qrcode

Fix from root folder:

cd /opt/shorturl
git pull
grep -n "@types/qrcode" apps/api/package.json

If missing, hotfix:

npm install -D @types/qrcode -w @shorturl/api

If workspace command fails, use fallback:

cd apps/api
npm install -D @types/qrcode
cd ../..

Rebuild:

docker compose -f docker-compose.vps.yml --env-file .env.vps build --no-cache api worker
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d api worker

### C) Workspace command fails with no workspaces found

Common causes:

- Wrong workspace name case (must be @shorturl/api)
- Not running from repository root where package.json exists

Correct usage:

cd /opt/shorturl
npm install -D @types/qrcode -w @shorturl/api

### D) HTTPS certificate not issued

Check:

- DNS points to VPS
- Ports 80 and 443 are open
- Caddy logs

Command:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=200 caddy

### E) API reachable internally but domain fails

You probably started only api/worker. Start web and caddy too:

docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build web caddy

Then test:

curl -I https://api.yourdomain.com/health

### F) `@prisma/client did not initialize yet` runtime crash

Symptoms in logs:

- `@prisma/client did not initialize yet. Please run "prisma generate"`
- API and worker keep restarting
- Caddy shows 502 for `api.yourdomain.com`

Cause:

- The API/worker image was built without Prisma runtime artifacts in final node_modules.

Fix:

cd /opt/shorturl
git pull

docker compose -f docker-compose.vps.yml --env-file .env.vps build --no-cache api worker
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate api worker

Verify:

docker compose -f docker-compose.vps.yml --env-file .env.vps ps
docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=120 api worker

Then re-check health:

curl -I https://api.yourdomain.com/health

### G) `P2021` table does not exist (for example `public.Link`)

Symptoms:

- API is up (`/health` returns 200)
- Register or link routes fail with Prisma error code `P2021`
- Logs show `The table public.Link does not exist in the current database`

Cause:

- There are no Prisma migration files in this repo, so `prisma migrate deploy` does not create tables.

Fix (one-time bootstrap):

cd /opt/shorturl
docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npx prisma db push

Optional seed data:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npm run prisma:seed

Verify tables exist:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec postgres psql -U postgres -d shorturl -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

Restart app services:

docker compose -f docker-compose.vps.yml --env-file .env.vps restart api worker web

Verify only fresh logs:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --since=2m --tail=150 api worker

### H) Register test with curl returns JSON body error

Symptom:

- API logs show: `Body is not valid JSON but content-type is set to 'application/json'`

Cause:

- Shell quoting broke the JSON payload.

Use this exact command:

curl -sS -X POST "https://api.yourdomain.com/api/auth/register" -H 'content-type: application/json' -d '{"email":"admin@yourdomain.com","password":"StrongPass123"}'

### I) Frontend tries calling `http://localhost:3001`

Symptom:

- Browser network tab shows requests to `http://localhost:3001/...`

Cause:

- `NEXT_PUBLIC_API_URL` was not injected at web image build time, so Next.js used the localhost fallback.

Fix:

1. Ensure `.env.vps` contains:
  `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
2. Rebuild and recreate web image/container:

docker compose -f docker-compose.vps.yml --env-file .env.vps build --no-cache web
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate web caddy

3. Hard refresh browser (Ctrl+Shift+R) and test again.

## 13) Daily Operations Quick Commands

Status:

docker compose -f docker-compose.vps.yml --env-file .env.vps ps

Tail all logs:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs -f

Restart one service:

docker compose -f docker-compose.vps.yml --env-file .env.vps restart api
docker compose -f docker-compose.vps.yml --env-file .env.vps restart worker
docker compose -f docker-compose.vps.yml --env-file .env.vps restart web
docker compose -f docker-compose.vps.yml --env-file .env.vps restart caddy

Stop stack:

docker compose -f docker-compose.vps.yml --env-file .env.vps down

Dangerous full reset (deletes DB and Redis volumes):

docker compose -f docker-compose.vps.yml --env-file .env.vps down -v

## 14) One-Line Deploy Shortcut

cd /opt/shorturl && git pull && docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build && docker compose -f docker-compose.vps.yml --env-file .env.vps ps
