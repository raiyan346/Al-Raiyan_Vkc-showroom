# Free sample demo: Render + Neon

This deploys a separate sample-data copy. It does not edit a resume or portfolio,
upload a local database, or copy real shop records. The app is accessible to anyone
with the URL, but signing in requires the demo owner or staff password. Passwords
are generated in Render and are not displayed on the sign-in page.

## Accounts and secrets

1. Sign up at [Render](https://dashboard.render.com/) and
   [Neon](https://console.neon.tech/) using GitHub if preferred. Enable two-factor
   authentication on the accounts. Select Free plans; do not authorize paid
   upgrades. Avoid adding a payment method for this demo.
2. Create a **new Neon project and empty database dedicated to this demo**.
   Do not reuse an existing shop database. Choose a nearby region, preferably
   Singapore to match the Render service.
3. In Neon's Connect dialog, turn connection pooling **off** and copy the direct
   PostgreSQL URL into Render's secret `DATABASE_URL` field. Keep `sslmode=require`
   and any other Neon-supplied security parameters. Add `connect_timeout=30` and
   `connection_limit=5` to the query parameters (use `&` after an existing `?`).
   One direct URL is adequate for this small single-server demo and allows Prisma
   migrations to run without a separate migration credential.
4. Never put a database URL, Render key, login password or recovery code in chat,
   a screenshot, GitHub, `render.yaml`, or a frontend `VITE_*` variable.

## Deploy the repository

Push the reviewed deployment changes to GitHub first. In Render choose **New →
Blueprint**, connect `raiyan346/Al-Raiyan_Vkc-showroom`, and select the
`hosting/free-demo` branch containing these changes. Use the root `render.yaml`.

Review the creation screen: it must show **one Free Docker web service**, with no
Render database, disk, cron job, paid workspace upgrade, or other paid resource.
Paste the new Neon URL when prompted for `DATABASE_URL`. The Blueprint generates
`JWT_SECRET`, `OWNER_PASSWORD`, and `STAFF_PASSWORD`; leave these generated values
private. Automatic deploys are disabled so source updates can be reviewed first.

The Docker build generates Prisma for PostgreSQL and builds React. On startup it
applies the committed migrations, checks the demo database, seeds sample records,
and serves frontend and API from the same HTTPS origin. Existing demo records are
preserved on restart. It does not automatically reset the demo each day.

In Render's Environment view, retrieve the generated `OWNER_PASSWORD` and
`STAFF_PASSWORD` privately. Sign in as `owner` or `staff` respectively. Do not share
these passwords until you want another person to use the shared demo. Changing
an environment password after the first seed does **not** change an existing
database account; demo password changes are intentionally blocked through the app.

## Demo safeguards

- `DEMO_MODE=true` and `SEED_SAMPLE_DATA=true` are set only on the hosted copy.
- Seeding refuses an existing database without the demo shop marker. Always use
  a fresh database: this guard is not a substitute for selecting the correct URL,
  because startup migrations run before the seed check.
- A visible notice requests sample information only. Visitors share all sample
  changes; there is no per-visitor database isolation or automatic reset.
- Password changes, user creation/deactivation, shop settings changes, new
  customer/supplier records, and manual backup creation are blocked by the API.
  Sample contact phone values are intentionally non-dialable.
- Normal sample billing, stock, returns, expense entry, reports and PDFs remain
  available. Existing role permissions still apply. Demo writes and logins have
  per-IP limits; `TRUST_PROXY_HOPS=1` is for Render's proxy, not direct local use.
- `X-Robots-Tag: noindex, nofollow` discourages indexing; it is not access control.
- Git and Docker exclude environment files, SQLite files, private keys, and the
  known backup/artifact directories. Review tracked files before every upload.

## Verify after deployment

1. Render must report a healthy deployment at `/api/health` (`{"ok":true}`).
2. `/api/config` must return `{"demoMode":true}` and no secrets.
3. Open the HTTPS URL on desktop and phone. Confirm the sample-demo notice.
4. Sign in as owner. Check the 12 sample variants, three starting bills, sample
   customer, supplier, reports, and receipt download. Try barcode `ARDEMO000001`.
5. Make one sample bill and confirm stock falls exactly once. Test a return.
6. Sign in as staff and confirm purchase costs, cipher, and owner reports remain
   inaccessible. Confirm password/settings/account changes are disabled.
7. Restart the service and confirm database records persist. A service restart
   should not create duplicate sample records.

Local checks: `npm test`, `npm run build`, and `npm run test:browser`. These use
isolated SQLite test databases. They do not verify cloud PostgreSQL connectivity,
Docker startup, phone hardware, or the live HTTPS deployment; complete the live
checks above before treating hosting as verified.

## Free-tier limits and cleanup

[Render Free](https://render.com/docs/free) sleeps after 15 minutes without
traffic; waking can take about a minute. Monthly usage limits can suspend free
services. Builds and bandwidth can incur overage charges when a payment method
is present; monitor usage and leave paid resources/upgrades disabled. Free hosting
cannot guarantee uninterrupted service or zero errors.

[Neon Free](https://neon.com/pricing) has storage and compute allowances. Stay on
the Free plan and monitor them. Render's temporary disk does not preserve local
backup files across restarts. Automatic local backups are not a durable backup
service, and this deployment is only a disposable sample demo.

To take it offline, suspend or delete the Render demo service. Remove the
dedicated Neon demo project only when its sample records are no longer needed.
Never delete a real shop database as part of demo cleanup.
