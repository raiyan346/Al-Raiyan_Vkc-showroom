# Render hosting with Neon

The React PWA and Express API run together in one Render Node web service. Neon stores the PostgreSQL database. Use the existing application, roles, and migrations.

## Service configuration

- Node: 22
- Region: Singapore (same region as the Neon project)
- Build: `npm ci --include=dev && node server/scripts/db-setup.js --generate-only && npm run build`
- Start: `npm run start:render`
- HTTP health check: `/api/health` (the server also accepts Render's default TCP checks)

Set these server environment variables in Render. Never commit their real values:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `DB_PROVIDER` | `postgresql` |
| `DATABASE_URL` | Neon pooled URL with `sslmode=require`, `connection_limit=5`, `connect_timeout=15`, and `pool_timeout=20` |
| `DIRECT_URL` | Neon direct URL with `sslmode=require` and `connect_timeout=15` |
| `JWT_SECRET` | At least 32 random characters |
| `OWNER_PASSWORD` | Unique initial owner password, at least 10 characters |
| `STAFF_PASSWORD` | Different initial staff password, at least 10 characters |
| `SEED_SAMPLE_DATA` | `false` |
| `TRUST_PROXY` | `1` |
| `PUBLIC_ACCESS` | `true` to open the shop without sign-in; anyone with the URL can use Owner features |
| `BACKUP_DIR` | `/tmp/alraiyan-backups` for Free; use a persistent mount for a paid disk |

Let Render supply `PORT`. This hosted shop uses `PUBLIC_ACCESS=true` at the owner's request: the dashboard opens directly and all shop operations use the existing Owner identity. No password or bearer token is sent to browsers. Account/password controls and sign-out are hidden in this mode. Anyone who can reach the URL can view and change shop records and download backups.

Set `PUBLIC_ACCESS=false` to require sign-in. Initial usernames are `owner` and `staff`; use Settings to change passwords. Seeding creates missing accounts/settings and preserves existing users, products, and bills in either mode.

Startup applies committed PostgreSQL migrations through `DIRECT_URL`, then seeds accounts before accepting traffic. The application's runtime database queries use `DATABASE_URL` and its pooled connection. Builds only generate the Prisma client; they do not migrate the database.

## Verify a deployment

Wait for Render's specific deployment to become `live`, then verify HTTPS, `/api/health`, products, reports, and the PWA assets. With public access enabled, verify a fresh browser opens the dashboard without a login form and ordinary shop APIs work without a bearer token. With sign-in required, verify both account roles, unauthenticated API requests failing, and Staff being unable to access Owner reports or backups. Test mutations against a separate Neon branch to keep production free of test stock and bills.

## Free hosting and backups

Render Free services can sleep when idle, so the first request after inactivity can take longer. The app needs an initial online sign-in before offline billing works. Main records remain in Neon across app restarts and deploys.

Files under `/tmp` are temporary and do not survive a Render restart. The automatic daily JSON copies are therefore temporary on Free. Use **Settings → Back up now** to download a copy to your own device. These files include customer information and password hashes; keep them private. For unattended, durable backup retention, configure independent persistent storage or an appropriate Neon restore/backup plan.

Deployment secrets are configured through the Render connector. The repository contains no Blueprint, so configuration changes are made on that service rather than synced from `render.yaml`.
