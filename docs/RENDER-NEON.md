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
| `BACKUP_DIR` | `/tmp/alraiyan-backups` for Free; use a persistent mount for a paid disk |

Let Render supply `PORT`. Initial usernames are `owner` and `staff`. Change passwords in the app's Settings after signing in. Seeding creates missing accounts/settings and preserves existing users, products, and bills.

Startup applies committed PostgreSQL migrations through `DIRECT_URL`, then seeds accounts before accepting traffic. The application's runtime database queries use `DATABASE_URL` and its pooled connection. Builds only generate the Prisma client; they do not migrate the database.

## Verify a deployment

Wait for Render's specific deployment to become `live`, then verify HTTPS, `/api/health`, both account roles, products, reports, and the PWA assets. Test mutations against a separate Neon branch to keep production free of test stock and bills. Ensure unauthenticated API requests fail and Staff cannot access Owner reports or backups.

## Free hosting and backups

Render Free services can sleep when idle, so the first request after inactivity can take longer. The app needs an initial online sign-in before offline billing works. Main records remain in Neon across app restarts and deploys.

Files under `/tmp` are temporary and do not survive a Render restart. The automatic daily JSON copies are therefore temporary on Free. Use **Settings → Back up now** to download a copy to your own device. These files include customer information and password hashes; keep them private. For unattended, durable backup retention, configure independent persistent storage or an appropriate Neon restore/backup plan.

Deployment secrets are configured through the Render connector. The repository contains no Blueprint, so configuration changes are made on that service rather than synced from `render.yaml`.
