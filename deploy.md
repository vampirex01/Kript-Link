# Kript Link Deployment Guide (Ubuntu VPS + Docker)

This runbook matches the current codebase and container setup.

## Architecture

Services deployed by docker-compose.vps.yml:

- web: Next.js app
- api: Fastify API
- worker: click analytics worker
- postgres: PostgreSQL 16
- redis: Redis 7
- caddy: reverse proxy + automatic HTTPS

Traffic routing:

- app.yourdomain.com -> web:3000
- api.yourdomain.com -> api:3001
- short.yourdomain.com -> api:3001

Why short domain matters:

- Public short links should use BASE_URL on short.yourdomain.com
- API remains on api.yourdomain.com and is not exposed in generated short links

## 1) VPS Prerequisites

Run on your VPS:

sudo apt update
sudo apt install -y git curl ufw
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

Install Docker if needed, then verify:

docker --version
docker compose version

If compose plugin is missing:

sudo apt install -y docker-compose-plugin

## 2) DNS Setup

Create A records pointing to the VPS public IP:

- app.yourdomain.com
- api.yourdomain.com
- short.yourdomain.com

Verify before deploy:

dig +short app.yourdomain.com
dig +short api.yourdomain.com
dig +short short.yourdomain.com

All should return your VPS IP.

## 3) Clone Project

Example path:

cd /opt
sudo git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git Kript-Link
sudo chown -R $USER:$USER /opt/Kript-Link
cd /opt/Kript-Link

## 4) Configure .env.vps

Create env file from template:

cp .env.vps.example .env.vps
nano .env.vps

Required variables:

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
- NODE_ENV

Optional variables:

- IPINFO_TOKEN
- GOOGLE_SAFE_BROWSING_API_KEY
- WORKER_CONCURRENCY
- DEFAULT_ADMIN_EMAIL
- DEFAULT_ADMIN_PASSWORD

Recommended production pattern:

- APP_DOMAIN=app.yourdomain.com
- API_DOMAIN=api.yourdomain.com
- SHORT_DOMAIN=short.yourdomain.com
- BASE_URL=https://short.yourdomain.com
- CORS_ORIGIN=https://app.yourdomain.com
- NEXT_PUBLIC_API_URL=https://api.yourdomain.com
- DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@postgres:5432/shorturl
- REDIS_URL=redis://redis:6379
- NODE_ENV=production

Generate secure JWT secrets:

openssl rand -base64 48
openssl rand -base64 48

Paste values into JWT_SECRET and JWT_REFRESH_SECRET.

Validate both are at least 16 chars:

grep -E '^JWT_SECRET=|^JWT_REFRESH_SECRET=' .env.vps | awk -F= '{print $1, length($2)}'

## 5) Optional Auto Admin Bootstrap

If you want first admin account automatically created on API start:

- DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
- DEFAULT_ADMIN_PASSWORD=StrongPassword123

Current behavior:

- If account exists, it is upgraded to OWNER + APPROVED
- If account does not exist, it is created as OWNER + APPROVED
- Both variables must be provided together

## 6) Build and Start Stack

From repository root:

docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build

Check status:

docker compose -f docker-compose.vps.yml --env-file .env.vps ps

Check logs:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=200 api worker web caddy

## 7) Initialize Database Schema

Important for this repo:

- There are no Prisma migration files committed
- API startup runs migrate deploy and db push
- If you still see missing table errors, run manual bootstrap once

Manual bootstrap:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npx prisma db push

Optional seed:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npm run prisma:seed

## 8) Health and Functional Checks

Health endpoint:

curl -I https://api.yourdomain.com/health

Open in browser:

- https://app.yourdomain.com
- https://api.yourdomain.com/health

Functional flow:

1. Register from web
2. Login
3. Create a short link
4. Confirm generated short link uses short.yourdomain.com
5. Open short link and confirm redirect
6. Confirm analytics appears in dashboard

If worker not processing clicks:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=200 worker

## 9) Deploy Updates

Normal update flow:

cd /opt/Kript-Link
git pull
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build
docker compose -f docker-compose.vps.yml --env-file .env.vps ps
docker image prune -f

One-line shortcut:

cd /opt/Kript-Link && git pull && docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build && docker compose -f docker-compose.vps.yml --env-file .env.vps ps

## 10) Rollback

cd /opt/Kript-Link
git log --oneline -n 10
git checkout PREVIOUS_COMMIT_HASH
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build

After rollback test:

git checkout main

## 11) Backup and Restore

Backup:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec -T postgres pg_dump -U postgres shorturl > backup_shorturl.sql

Restore:

cat backup_shorturl.sql | docker compose -f docker-compose.vps.yml --env-file .env.vps exec -T postgres psql -U postgres -d shorturl

## 12) Troubleshooting

A) Docker build fails with package-lock.json not found

Symptom:

- Failed on COPY package.json package-lock.json

Status in current repo:

- Fixed in Dockerfile.api and Dockerfile.web using package\*.json
- Build now works with or without package-lock.json

If server still shows old behavior:

cd /opt/Kript-Link
git pull
docker compose -f docker-compose.vps.yml --env-file .env.vps build --no-cache api worker web

B) API health is up but routes fail with Prisma P2021 table missing

Fix:

docker compose -f docker-compose.vps.yml --env-file .env.vps exec api npx prisma db push
docker compose -f docker-compose.vps.yml --env-file .env.vps restart api worker web

C) Frontend calls http://localhost:3001

Cause:

- NEXT_PUBLIC_API_URL missing at build time

Fix:

1. Set NEXT_PUBLIC_API_URL=https://api.yourdomain.com in .env.vps
2. Rebuild web image:

docker compose -f docker-compose.vps.yml --env-file .env.vps build --no-cache web
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate web caddy

D) HTTPS certificates not issued

Check:

- DNS records resolve to VPS
- Ports 80 and 443 open
- Caddy logs:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=200 caddy

E) API/worker restart with env validation errors

Typical error:

- JWT secret too short

Fix:

- Regenerate secrets
- Update .env.vps
- Recreate services:

docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate api worker

F) Admin panel inaccessible

Check:

- Logged in user role is OWNER
- If first deployment, set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD, then recreate api:

docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate api

## 13) Daily Operations Commands

Status:

docker compose -f docker-compose.vps.yml --env-file .env.vps ps

Tail logs:

docker compose -f docker-compose.vps.yml --env-file .env.vps logs -f

Restart services:

docker compose -f docker-compose.vps.yml --env-file .env.vps restart api
docker compose -f docker-compose.vps.yml --env-file .env.vps restart worker
docker compose -f docker-compose.vps.yml --env-file .env.vps restart web
docker compose -f docker-compose.vps.yml --env-file .env.vps restart caddy

Stop stack:

docker compose -f docker-compose.vps.yml --env-file .env.vps down

Dangerous full reset (deletes postgres and redis data):

docker compose -f docker-compose.vps.yml --env-file .env.vps down -v
