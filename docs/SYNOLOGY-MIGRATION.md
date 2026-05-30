# Migrating from Vercel + Supabase to a Synology NAS

Self-host the app on a Synology NAS (Container Manager) with Postgres + MinIO,
exposed over HTTPS by a Cloudflare Tunnel.

- **NAS CPU:** Intel Celeron J4025 (x86-64 → images build for `linux/amd64`)
- **Stack:** `postgres` · `minio` · `app` (Next.js standalone) · `cloudflared`
- **Domain:** `YOURDOMAIN` (app) + `media.YOURDOMAIN` (MinIO)

Phase 1 (code: standalone build, MinIO storage, Docker files) is already done on
the `migrate/synology` branch. This runbook covers Phases 2–6, run on cutover day.

---

## Prerequisites

- DSM 7.2+ with **Container Manager** installed.
- SSH enabled on the NAS (Control Panel → Terminal & SNMP → Enable SSH), or use
  Container Manager's GUI for `docker compose`.
- On your PC: Docker Desktop (to build) and **PostgreSQL 16 client tools**
  (`pg_dump`, `pg_restore`) — `winget install PostgreSQL.PostgreSQL` or the EDB installer.
- A Cloudflare account with `YOURDOMAIN` using Cloudflare nameservers
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
   | *(blank)* | YOURDOMAIN | HTTP | `app:3000` |
   | media | YOURDOMAIN | HTTP | `minio:9000` |

   `cloudflared` runs in the compose network, so it resolves the `app` and `minio`
   service names. Cloudflare auto-creates the DNS records and provisions TLS.

> Leave **Host header** untouched — MinIO presigned uploads rely on the original
> `media.YOURDOMAIN` Host header to validate the signature.

---

## Phase 5 — Cron (replace Vercel Cron with Synology Task Scheduler)

The cron API routes already require `CRON_SECRET`. Create two scheduled tasks:

**Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script.**

- Task 1 — daily, **02:00**:
  ```bash
  curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" \
    https://YOURDOMAIN/api/cron/late-invoice-alerts
  ```
- Task 2 — daily, **02:30**:
  ```bash
  curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" \
    https://YOURDOMAIN/api/cron/landlord-promise-alerts
  ```

> **Timezone:** Vercel Cron ran in **UTC**; Task Scheduler uses the **NAS local time**.
> Set the times to match the wall-clock you actually want (e.g. for the same effective
> time as before, convert 02:00 UTC to your NAS timezone).

---

## Phase 6 — Build, deploy, cut over

### 6.1 Build the image (GitHub Actions → GHCR)

The image is built in CI by `.github/workflows/build-image.yml` and pushed to
**GitHub Container Registry**. Just push the branch (or run the workflow manually
from the Actions tab):

```powershell
git push -u origin migrate/synology
```

Watch **GitHub → Actions → "Build NAS image"**. It produces:
`ghcr.io/tolattd2/rent-house-management:migrate-synology` (and `:latest` from `main`).

> **Make the package pullable by the NAS.** By default a new GHCR package is private.
> Either: (a) GitHub → your profile → Packages → this package → Package settings →
> change visibility to **Public** (simplest), or (b) keep it private and create a
> **classic Personal Access Token** with `read:packages` for the NAS to log in with.

> _Fallback (no CI):_ if you ever fix local Docker, `.\scripts\build-image.ps1`
> builds the same image to a tarball for `docker load`.

### 6.2 Pull + run on the NAS

```bash
# Only if the GHCR package is private:
echo "YOUR_PAT_WITH_read:packages" | docker login ghcr.io -u tolattd2 --password-stdin

cp .env.production.example .env.production   # then edit with real secrets
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d
docker compose ps                            # all services healthy?
docker compose logs -f app                   # watch first boot
```

To deploy a new version later: push to the branch → wait for the Action → on the NAS
`docker compose pull && docker compose up -d`.

### 6.3 Re-register the Telegram webhook

In the running app: **Settings → Telegram tenant linking → toggle Off then On.**
This calls `/api/telegram/setup-webhook`, which registers
`https://YOURDOMAIN/api/telegram/webhook` **with the secret_token** the
validator expects. (Do *not* use a raw Telegram `setWebhook` call — it skips the secret.)

### 6.4 Smoke test

- [ ] Log in (NextAuth) at `https://YOURDOMAIN`
- [ ] Billing list loads with migrated data; status-card filters work
- [ ] Generate / view an invoice PDF
- [ ] Send a custom Telegram reminder **with a photo** → confirms presigned upload to
      MinIO + public fetch via `media.YOURDOMAIN`
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
