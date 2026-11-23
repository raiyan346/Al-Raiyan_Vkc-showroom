# Private shop and fictional portfolio demo

Both Render services use this repository's `main` branch and the same application code. Production keeps its existing URL. The demo uses an independently created Neon project, never a branch or copy of production.

| Environment | Website | Database | Access |
| --- | --- | --- | --- |
| Production | https://al-raiyan-vkc-showroom.onrender.com | Production Neon project / `vkc_mart` | Private Owner login |
| Demo | https://vkc-showroom-demo.onrender.com | Independent demo Neon project / `vkc_demo` | Explore Demo visitor account |

Use only the demo link on portfolios, resumes and GitHub project showcases. The production link is for the shop's trusted devices.

## Server configuration

Set `APP_ENV=production` or `demo`, the matching `DEMO_MODE=false` or `true`, `PUBLIC_ACCESS=false`, `PUBLIC_REGISTRATION_ENABLED=false`, a unique random `SESSION_SECRET` of at least 48 characters, and the exact HTTPS `APP_BASE_URL`. Each service gets its own `DATABASE_URL`, `DIRECT_URL`, `EXPECTED_DATABASE_HOST` (non-pooler hostname) and `EXPECTED_DATABASE_NAME`. Demo also pins the production hostname in `PRODUCTION_DATABASE_HOST` so it can reject that host. These are server variables, never `VITE_` variables.

`DATABASE_URL` uses a scoped read/write runtime role; `DIRECT_URL` is reserved for migrations and protected operator scripts. Both require TLS. Production must set `SEED_SAMPLE_DATA=false`. Demo seeds fictional data through its separate seed routine. Database markers verify the environment before startup, seeding or reset. Missing or mismatched production configuration stops startup.

The build command remains `npm ci --include=dev && node server/scripts/db-setup.js --generate-only && npm run build`. Start with `npm run start:render`. Node 22 and `TRUST_PROXY=1` apply on Render. Let Render supply `PORT`.

## Authentication and offline data

Passwords use bcrypt. Login creates a random server-side database session, expiring after 8 hours. Only an HttpOnly, Secure, SameSite=Strict, host-only cookie carries its identifier. Login rotates sessions and CSRF tokens. Every mutation requires a matching CSRF header/cookie and the configured Origin. Logout revokes the session; password changes and account disablement invalidate sessions. Login rate limiting applies. No authentication tokens are stored in localStorage, IndexedDB, URLs or logs.

LocalStorage holds only non-secret user metadata and expiry for offline rendering on an already authenticated shop device. IndexedDB continues holding that user's saved catalogue and pending bills. Offline access ends at the recorded session expiry. Reconnect to renew the CSRF token and sync. Never clear browser storage with pending bills. Logout clears cached private data and is blocked until pending bills sync.

The demo has a fictional shared visitor account with Staff permissions for billing, products, stock and customers. The server caps every demo session at Staff even if an account is accidentally assigned Owner. The cost cipher, purchase prices, cost labels, profit reports, financial exports, daily closings, account administration, password changes and backups are forbidden for demo visitors. Old demo caches are stripped of confidential cost fields without discarding pending bills or drafts. No maintenance/reset endpoint is exposed. Existing UPI/Card controls only record payment types; there is no payment gateway. WhatsApp/external sharing is disabled in demo mode. Demo PDF and thermal/local receipts are labeled SAMPLE.

New production installations generate a private cost cipher in the database. Public examples in the source are fictional development mappings. Existing shop mappings are preserved on deploy; the authenticated Owner can view or change the private mapping in Settings. Never copy a real shop mapping or its data into the demo or source files.

## Safe database commands

Supply the environment's server variables securely before running:

```powershell
npm.cmd run db:migrate:production
npm.cmd run db:migrate:demo
npm.cmd run db:seed:demo
npm.cmd run db:reset:demo -- --confirm-demo-reset
```

Migration commands refuse a mismatched environment. Hosted startup refuses destructive migration SQL. Generate and review migrations locally; never reset production. Demo reset requires `APP_ENV=demo`, `DEMO_MODE=true`, matching URL pins, the persisted demo marker, the actual `vkc_demo` database name, and the explicit confirmation flag. It removes only the fictional demo data, then reseeds 42 size/colour variants and sample transactions. Run it periodically as an operator, with the demo migration credentials; never give those credentials to visitors.

Initial production accounts come from protected environment configuration. `OWNER_USERNAME` selects the initial admin username (default `owner`); seeding preserves an existing active Owner after a username change. Existing accounts and shop records are preserved. To change the Owner password through the operator CLI, supply `OWNER_USERNAME` and `OWNER_PASSWORD` securely and run `npm.cmd run admin:password -- --confirm-owner-change`. This revokes the Owner's sessions and does not touch shop transactions.

## Develop, verify demo, then promote manually

Manual production promotion is the selected release policy. Production startup compares Render's source commit with `PRODUCTION_APPROVED_COMMIT` **before migrations or seeding**. A newer automatic deployment fails closed and leaves the current version serving traffic.

1. Develop inside this checkout. Run `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run test:browser`. Review any new additive Prisma migration.
2. Commit and push `main`. The demo service tracks `main`. If the Git provider is not connected and a push does not trigger a build, use Render's **Deploy latest commit** on the demo service.
3. Wait for demo to become Live, then run `npm.cmd run release:verify -- FULL_COMMIT_SHA`. Test any changed feature in the demo. The verifier checks the exact deployed SHA and cross-environment session isolation.
4. In the private shop, download **Settings → Back up now** to a private location. Confirm it downloaded successfully. Do not commit backups or publish them as build artifacts.
5. Set the production Render variable `PRODUCTION_APPROVED_COMMIT` to that exact tested SHA. Use **Manual Deploy → Deploy a specific commit**, supplying the same SHA. This also disables ordinary automatic production deploys. Do not select a newer commit.
6. After Live, verify private login, an unauthenticated `/api/products` returning 401, stock, reports, invoice download and logout. Avoid fake test bills in production. Save the release SHA with the backup.

Git provider connection and automatic release automation require account-level setup. The current deployment policy deliberately retains manual production approval. Render Free may sleep; first access can take longer. Temporary server backup files do not survive restarts, so download independent private copies. Neon is the durable store for shop records.
