# Al-Raiyan VKC Show Room POS

A working React + Express + Prisma showroom POS, using the supplied Stitch screens and showroom logo. Tamil is the default, with English switching, large controls, light/dark themes, and a responsive layout. **GST is deliberately absent**, as requested.

The article/size inventory upgrade and phone-scanner guide is in [docs/FOOTWEAR-INVENTORY.md](docs/FOOTWEAR-INVENTORY.md).

For a separate free sample-data deployment, see [Render + Neon demo hosting](docs/FREE-DEMO-HOSTING.md). The root `render.yaml` selects a Free web service and enables demo safeguards; use a new dedicated database.

## Start on this Windows computer

Node.js 22 is required. The project already has a local `.env` and sample SQLite database created during development. If starting from a fresh copy, follow the next section first.

In PowerShell, inside this folder:

```powershell
npm.cmd install
npm.cmd run db:setup
npm.cmd run db:seed
npm.cmd run dev
```

Open **http://localhost:5173**. Keep that terminal running. Stop with Ctrl+C.

The locally prepared demo accounts are `owner` / `Owner-demo-2026!` and `staff` / `Staff-demo-2026!`. These are development credentials stored only in the ignored local `.env`; change passwords before using real shop data. A fresh installation uses the passwords **you choose** in `.env`.

For the installable/offline version, use the production build:

```powershell
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3001**. In Chrome or Edge, choose **Install app** from the browser menu or the app’s Install button when available. Sign in once while connected and let the product list finish loading. The development server does not enable the service worker.

## First setup on another computer

1. Install Node.js 22.
2. Copy `.env.example` to `.env`.
3. Set `OWNER_PASSWORD` and `STAFF_PASSWORD` to different passwords of at least 10 characters.
4. Generate a JWT secret with the command below; put its output in `JWT_SECRET`.
5. Keep `DB_PROVIDER=sqlite` and `DATABASE_URL=file:./dev.db` for local use.
6. Set `SEED_SAMPLE_DATA=true` for demonstration products, or `false` for an empty real shop.
7. Run the four start commands above. On macOS/Linux, use `npm` in place of `npm.cmd`.

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Seeding never overwrites existing users or products. Sample data includes 12 footwear variants, three bills, a customer, supplier, and expense. Scan `ARDEMO000001` through `ARDEMO000012` to try them.

## How to make a bill

1. Tap **புதிய பில் / NEW BILL**.
2. Click the big scan/search box and scan a barcode. A USB scanner should send **Enter** after each scan. The same variant scanned again increases its quantity and plays a short beep.
3. Enter the price agreed with the customer in the amber **Selling price** box. MRP is only a reference.
4. Choose Cash, UPI, Card, or Credit. A Credit bill needs an existing customer.
5. Enter an optional overall discount, then tap **Generate bill**.
6. Print the 80mm receipt, download an A4 PDF, or open a WhatsApp receipt message.

UPI/Card buttons **record a payment you received**; they do not charge a customer or verify a payment gateway. WhatsApp sharing opens a message for the cashier to send; attach the downloaded PDF manually if desired. Voice search depends on browser support and its speech service. Camera scanning requires camera permission and a secure context.

The Owner sees the secret cost code beside MRP in the New Bill cart, along with below-cost warnings. The code stays off customer receipts, PDFs, and WhatsApp messages. Staff can bill, manage product details and stock, record expenses, manage customers, and collect credit. Staff cannot retrieve purchase prices, cost codes, the cipher, profit reports, backups, or user management through the API. Staff-created products are marked **cost needed** until an Owner adds their purchase price. Reports explicitly flag sales made before costs were confirmed.

## Stock, costs and returns

- Every size/colour variant has its own database-unique Code128 barcode.
- Opening quantities and every stock in/out/audit, sale, and return create stock movement records.
- Receiving stock uses the **weighted average cost of remaining and incoming pairs**, rounded to the nearest paise. A zero-stock receipt adopts the incoming cost. Supplier purchases preserve their actual incoming unit cost.
- Staff stock receipts use the existing stored cost; an Owner must enter a changed supplier cost. If existing stock has no confirmed cost, add it in Products before receiving a differently priced Owner stock entry.
- Bills store the weighted purchase cost at the moment the server accepts the sale. Changing a product cost never rewrites previous bill profit.
- Returns restore stock at the original sale’s cost and blend it back into the current weighted average. Refunds use the **actual discounted amount**, with partial returns allocating every paise exactly once.
- An unpaid Credit return reduces credit first; any excess becomes a recorded refund. Credit payments are allocated to the oldest unpaid bills.
- For an exchange, record the return, refund/credit adjustment, and create a separate bill for the replacement. They remain separate accounting records.
- Stock audits replace the system count with the actual counted quantity and retain the difference in history.

Cost code mapping: `0=A, 1=J, 2=I, 3=H, 4=G, 5=F, 6=E, 7=D, 8=C, 9=B`. ₹300 → `HAA`; ₹1,250 → `JIFA`. Decimal prices preserve a dot: ₹12.50 → `JI.FA`. The real cost is always stored as integer paise. Owners can edit the ten unique uppercase letters in Settings. Reprint old labels after a cipher change. Labels use the current weighted cost; **customer receipts, PDFs, and WhatsApp messages omit cost and code**.

## Offline billing

The built PWA caches its app shell. IndexedDB stores the signed-in user’s catalogue, draft cart, held bills, offline receipts, and submission queue. Stay signed in on a trusted shop device. Sign-out clears cached catalogue/cost information, customers, drafts, holds, and receipt history for that session, and is blocked while bills need syncing.

Each bill is first saved locally with a UUID. Sync runs when connectivity returns, on opening the app, once a minute while open, and on tapping the pending-bills indicator. The server validates stock and commits the sale, stock movements, and credit balance in one serializable transaction. Repeating an accepted submission returns the existing bill; changing its content under the same ID is rejected.

Offline receipts are visibly marked **PENDING SYNC**. Accepted receipts get the server bill number. Stock on the device accounts for its pending sales. Two disconnected devices can still compete for the same last pair: the server rejects the conflicting bill and keeps it in **Bills & returns** with an actionable error. Correct stock, then Retry. Only discard a genuinely cancelled sale. Do not clear browser storage with unsynced bills.

New customers, product changes, stock updates, expenses, returns, credit collections, reports, and server PDF downloads need the server. Offline bills support thermal printing and local A4 PDF generation. Held bills and draft carts belong to that browser/device. An offline sale captures the product cost **when synced**, so its reported cost may reflect intervening inventory receipts; its selling prices and discount are preserved.

Offline sync is performed while the app is open; it does not depend on the browser providing background sync after the app is closed. The app must have been opened online on that browser before offline use. Use HTTPS for installation/camera access on phones and other computers; `localhost` is permitted for the local computer. Plain `http://192.168…` is insufficient for those features.

## Labels and printing

Owners can select products and print an A4 sheet of Code128 labels, or print labels immediately after a bulk import or stock receipt. A CSV example is available in Products and at `client/public/sample-products.csv`. CSV/XLSX import validates every row before writing and shows a preview; prices in those files are **rupees**, quantities are whole numbers. Import adds new variants; it does not overwrite stock.

The label layout is three columns of 64 × 40 mm with 2 mm gaps, A4 paper and 7 mm margins. Match this to your actual stationery. In the printer dialog choose 100% scale and disable browser headers/footers. For receipts choose the thermal printer’s 80 mm paper size and minimal margins. A physical printer/USB scanner and phone camera need a shop hardware check; browser tests emulate keyboard scanning. Standard on-screen labels remain at least 18 px; printed receipts/labels use compact print sizes.

## Reports and cash closing

Owner reports include today/week/month/year and custom dates, net sales, cost of goods, gross profit/loss, cash expenses, net profit, trend/category charts, per-product and per-bill profit, low stock and stock not sold for 60 days. Excel and PDF exports are available. Prices and totals are stored in paise; overall discounts are apportioned to products.

Dates use **Asia/Kolkata**. Reports recognize sales when the server accepts them and returns on the return posting date. The original device sale timestamp stays on the bill. Per-bill rows retain original totals; period summaries deduct returns. The reported loss figure sums below-cost sale lines before subsequent returns; net profit includes period returns and expenses. Low/dead stock are current alerts, independent of the selected report dates.

All expenses are cash from the drawer, as confirmed. Closing cash = opening cash + cash sales + cash credit collections − cash refunds − cash expenses. Enter actual cash and save the difference. Backdated entries can change the expected result, so recalculate a saved closing if those entries change.

## Docker Compose with PostgreSQL

Install Docker with Compose. Docker was unavailable in the development environment; container startup must be checked on your deployment machine.

1. Prepare `.env` as above, including strong `JWT_SECRET`, owner/staff passwords, and `POSTGRES_PASSWORD`.
2. Use a long database password made of letters and digits, because it is embedded in the connection URL. Set `SEED_SAMPLE_DATA=false` for a real shop.
3. Run:

```sh
docker compose up --build -d
docker compose logs -f app
```

Open **http://localhost:8080**. PostgreSQL and backups use named persistent volumes. PostgreSQL has no host-exposed port. The app automatically generates its PostgreSQL client, applies the committed initial migration, and creates missing accounts/settings. It never resets or reseeds existing shop products.

For HTTPS on a domain pointing to the server, set `POS_DOMAIN=pos.your-domain.in`, allow ports 80/443, then:

```sh
docker compose -f compose.yml -f compose.https.yml up --build -d
```

The optional Caddy gateway obtains a certificate for that domain. This needs reachable DNS and domain validation. It does not make a private LAN IP into a trusted HTTPS origin automatically.

Production schema changes require reviewed, committed PostgreSQL migrations under `server/prisma/postgresql/migrations`. `db:setup` uses `migrate deploy` for PostgreSQL and `db push` only for local SQLite. `server/prisma/schema.prisma` is the canonical schema; setup writes a provider-specific copy. Do not regenerate/edit the initial migration after it has been applied. `tools/generate-migration.js` is only for recreating the initial migration before first deployment. There is no automatic migration of existing SQLite shop data into PostgreSQL; the empty-database backup restore below can transfer this app’s records.

## Backups and restore

The server saves a consistent JSON database snapshot at startup and after each India calendar-day change while running, checking hourly. It retains the latest 30 files. Use **Settings → Back up now** for an additional snapshot. Backups include all records, password hashes, and customer data; keep access limited to the owner and copy them to another device.

Local default: `server/backups/` when using `npm start`; Docker: `/app/backups` in the `pos_backups` volume.

```sh
docker compose cp app:/app/backups ./downloaded-backups
```

To restore, stop the app, configure `.env` for a **new empty database**, run `npm run db:setup` without seeding, then:

```sh
node server/scripts/restore.js /absolute/path/to/backup.json --confirm-empty-database
```

The restore refuses any database containing records and runs all inserts in one transaction. Use the accounts in the backup after restoring. For production, retain the PostgreSQL database volume and independent backups; `docker compose down` preserves volumes, but removing volumes deletes data.

## Test and verify

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

Core tests cover cipher examples/custom mappings/invalid data, money validation, negotiated-price profit, discount allocation, exact partial returns, weighted costs, and keyboard scanner behavior. Integration tests use a separate disposable SQLite database and cover authorization, confidential fields, atomic/idempotent sales, last-pair concurrency, credit/returns, stock, imports, PDFs, and report reconciliation. They do not touch the seeded development database. Browser tests use another isolated database and installed Chrome (`PLAYWRIGHT_CHANNEL=msedge` can select Edge).

Browser scenarios check Tamil-first sign-in, the six Stitch home tiles, mobile layout/dark mode, keyboard barcode checkout with negotiated pricing, receipt confidentiality, offline reload/queue/reconnect, and Staff permissions. Screenshots are saved in `.artifacts/`; failure traces go in `test-results/`. Hardware printing and real Android/iPhone camera focus, torch, and voice recognition require manual verification. HTTPS browser tests exercise camera-denial recovery, track cleanup, rear-camera constraints, and genuine image decoding. PostgreSQL container integration needs Docker on the target machine.

Tamil text uses a bundled Noto Sans Tamil font for offline display and PDFs. Its SIL Open Font License is included at `client/public/fonts/OFL.txt`.

## Folder guide

```text
client/                     React + Vite + Tailwind PWA
  src/App.jsx               Login, shell, home tiles, shared state
  src/Billing.jsx           Scanner/cart, holds, receipts, returns
  src/Products.jsx          Articles, size variants, manufacturer barcodes
  src/CameraScanner.jsx     Rear camera, torch, images, manual scanning
  src/VariantPicker.jsx     Shared-barcode size/colour selection
  src/Inventory.jsx         Import, labels, stock, suppliers
  src/Management.jsx        Reports, expenses, customers, settings
  src/lib.js                API, IndexedDB queue, sync, receipts
  public/                   Showroom logo, icons, sample CSV
packages/core/              Cost code, paise math, weighted costs, scan logic
server/
  prisma/schema.prisma      Canonical SQLite-compatible schema
  prisma/postgresql/        Production migration history
  prisma/seed.js            Idempotent accounts and optional demo data
  src/app.js                Authenticated REST API and validation
  src/sales.js              Atomic billing, returns, credit collection
  src/reports.js            IST reports and cash reconciliation
  src/backup.js              Consistent rotating backups
  src/documents.js          A4 receipts and report exports
  scripts/                  Database setup and empty-database restore
  tests/                    Disposable database integration tests
tests/browser/              Chrome PWA workflow tests
Dockerfile / compose.yml    PostgreSQL deployment
docs/API.md                 Endpoint and data contracts
```
