# Migrating from Vercel + Supabase to a Synology NAS

Self-host the app on a Synology NAS (Container Manager) with Postgres + MinIO,
exposed over HTTPS by a Cloudflare Tunnel.

- **NAS CPU:** Intel Celeron J4025 (x86-64 → images build for `linux/amd64`)
- **Stack:** `postgres` · `minio` · `app` (Next.js standalone) · `cloudflared`
- **Domain:** `happyhomebyhas.com` (app) + `media.happyhomebyhas.com` (MinIO)

Phase 1 (code: standalone build, MinIO storage, Docker files) is already done on
the `migrate/synology` branch. This runbook covers Phases 2–6, run on cutover day.

---

## Prerequisites

- DSM 7.2+ with **Container Manager** installed.
- SSH enabled on the NAS (Control Panel → Terminal & SNMP → Enable SSH), or use
  Container Manager's GUI for `docker compose`.
- On your PC: Docker Desktop (to build) and **PostgreSQL 16 client tools**
  (`pg_dump`, `pg_restore`) — `winget install PostgreSQL.PostgreSQL` or the EDB installer.
- A Cloudflare account with `happyhomebyhas.com` using Cloudflare nameservers
  (free plan is fine). If the domain isn't on Cloudflare yet, add the site in the
  Cloudflare dashboard and update the nameservers at your registrar first.

---

## Phase 2 — Database migration (Supabase → NAS Postgres)

The Supabase `public` schema was created by Prisma, so we move structure **and**
data together — no separate `prisma migrate` needed.

### 2.1 Dump from Supabase (on your PC)

Get the **direct** connection string from Supabase → Project Settings → Database →
Connection string (URI). Then:

```powershell
# PowerShell — quote the URL
pg_dump "postgresql://postgres:[PWD]@db.[REF].supabase.co:5432/postgres" `
  --schema=public --no-owner --no-privileges -Fc -f happyhome.dump
```

### 2.2 Bring up Postgres on the NAS, exposed to the LAN temporarily

On the NAS, in the project folder (where `docker-compose.yml` and `.env.production` live):

1. In `docker-compose.yml`, temporarily **uncomment** the `postgres` `ports: ["5432:5432"]` block.
2. Start just the database:
   ```bash
   docker compose --env-file .env.production up -d postgres
   ```

### 2.3 Restore into the NAS (from your PC)

```powershell
pg_restore --no-owner --no-privileges --clean --if-exists `
  -d "postgresql://happyhome:[PASS]@[NAS_LAN_IP]:5432/happyhome" happyhome.dump
```

### 2.4 Verify, then re-secure

```bash
# On the NAS — spot-check row counts
docker compose exec postgres psql -U happyhome -d happyhome -c \
  "select 'tenants' t, count(*) from \"Tenant\" union all
   select 'rooms', count(*) from \"Room\" union all
   select 'billings', count(*) from \"Billing\" union all
   select 'users', count(*) from \"User\";"
```

Compare against Supabase. When they match, **re-comment** the `5432:5432` port and
recreate: `docker compose --env-file .env.production up -d postgres`. The DB is now
reachable only on the internal Docker network.

> **Future schema changes:** point `DATABASE_URL` at the NAS (re-expose 5432 on the
> LAN briefly) and run `npx prisma migrate deploy` from your PC.

---

## Phase 3 — Storage (optional: copy old media)

Media URLs are **not** stored in the DB — they're only sent to Telegram, which
caches them. So existing reminder media keeps working in old chats with no action.

Only if you want the old files in MinIO too, mirror them (Supabase exposes an
S3-compatible endpoint under Project Settings → Storage):

```bash
# Using the MinIO client `mc` (run inside a temporary container or on the NAS)
mc alias set supa  https://[REF].supabase.co/storage/v1/s3  [KEY] [SECRET]
mc alias set local http://[NAS_LAN_IP]:9000                 [MINIO_USER] [MINIO_PASS]
mc mirror supa/reminder-media local/reminder-media
```

The `reminder-media` bucket itself and its public-read policy are created
automatically by the `minio-init` service on first `docker compose up`.

---

## Phase 4 — Cloudflare Tunnel (public HTTPS, no port forwarding)

1. Cloudflare **Zero Trust** dashboard → Networks → **Tunnels** → *Create a tunnel*
   → **Cloudflared** → name it (e.g. `happyhome-nas`).
2. On the "Install connector" screen, copy the **token** → paste into
   `.env.production` as `CLOUDFLARE_TUNNEL_TOKEN`. (The `cloudflared` container uses it;
   you don't install anything manually.)
3. In the tunnel's **Public Hostnames**, add two:

   | Subdomain | Domain | Type | URL |
   |---|---|---|---|
   | *(blank)* | happyhomebyhas.com | HTTP | `app:3000` |
   | media | happyhomebyhas.com | HTTP | `minio:9000` |

   `cloudflared` runs in the compose network, so it resolves the `app` and `minio`
   service names. Cloudflare auto-creates the DNS records and provisions TLS.

> Leave **Host header** untouched — MinIO presigned uploads rely on the original
> `media.happyhomebyhas.com` Host header to validate the signature.

---

## Phase 5 — Cron (replace Vercel Cron with Synology Task Scheduler)

The cron API routes already require `CRON_SECRET`. Create two scheduled tasks:

**Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script.**

- Task 1 — daily, **02:00**:
  ```bash
  curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" \
    https://happyhomebyhas.com/api/cron/late-invoice-alerts
  ```
- Task 2 — daily, **02:30**:
  ```bash
  curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" \
    https://happyhomebyhas.com/api/cron/landlord-promise-alerts
  ```

> **Timezone:** Vercel Cron ran in **UTC**; Task Scheduler uses the **NAS local time**.
> Set the times to match the wall-clock you actually want (e.g. for the same effective
> time as before, convert 02:00 UTC to your NAS timezone).

---

## Phase 6 — Build, deploy, cut over

### 6.1 Build the image (on your PC)

```powershell
.\scripts\build-image.ps1      # builds linux/amd64 and writes happyhome-app.tar
```

### 6.2 Load + run on the NAS

```bash
docker load -i happyhome-app.tar
cp .env.production.example .env.production   # then edit with real secrets
docker compose --env-file .env.production up -d
docker compose ps                            # all services healthy?
docker compose logs -f app                   # watch first boot
```

### 6.3 Re-register the Telegram webhook

In the running app: **Settings → Telegram tenant linking → toggle Off then On.**
This calls `/api/telegram/setup-webhook`, which registers
`https://happyhomebyhas.com/api/telegram/webhook` **with the secret_token** the
validator expects. (Do *not* use a raw Telegram `setWebhook` call — it skips the secret.)

### 6.4 Smoke test

- [ ] Log in (NextAuth) at `https://happyhomebyhas.com`
- [ ] Billing list loads with migrated data; status-card filters work
- [ ] Generate / view an invoice PDF
- [ ] Send a custom Telegram reminder **with a photo** → confirms presigned upload to
      MinIO + public fetch via `media.happyhomebyhas.com`
- [ ] Link a tenant by messaging the bot → confirms the inbound webhook
- [ ] Manually run a cron task in Task Scheduler → check the alert fires

### 6.5 Decommission

Once everything passes for a safety window (a few days):

- Remove the Vercel project (or leave it idle).
- Keep Supabase **read-only** as a backup until you're confident, then delete.

---

## Backups (do this — the NAS is now your single source of truth)

Add a nightly Task Scheduler job:

```bash
# Dump DB + sync MinIO data to a NAS shared folder; keep 14 days
docker compose exec -T postgres pg_dump -U happyhome happyhome \
  | gzip > /volume1/backups/happyhome/db-$(date +%F).sql.gz
find /volume1/backups/happyhome -name 'db-*.sql.gz' -mtime +14 -delete
```

Also point **Hyper Backup** at the `postgres-data` and `minio-data` Docker volumes
(or the backups folder) for an off-site copy.

---

## Rollback

Nothing is destructive until Phase 6.5. To revert: re-point the Cloudflare DNS (or
restore the old DNS) back to Vercel and re-enable the Supabase project. The
`migrate/synology` branch stays separate from `main` until you merge it.
