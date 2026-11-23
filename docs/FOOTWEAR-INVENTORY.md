# Footwear inventory upgrade

This extends the existing POS. It retains the `Product` table as the sellable size/colour variant and keeps its IDs and sale/purchase relations. The new `Article` table holds brand, article number, name, category, gender, size system, image, supplier, and notes. Existing prices, quantities, bills, expenses and weighted-average costing are preserved. GST remains absent.

## Upgrade an existing installation

1. Finish and sync pending bills, then stop the running server with Ctrl+C.
2. Back up the current installation. This workspace already has a pre-upgrade JSON backup in `backups/` and an original-financial-data checksum baseline in `.artifacts/`.
3. Run `npm.cmd install`, `npm.cmd run db:setup`, and `npm.cmd run build`.
4. Restart with `npm.cmd start` and close/reopen all installed app windows to load the new PWA version.

On macOS/Linux use `npm` instead of `npm.cmd`. PostgreSQL setup applies the additive migration `202611150001_article_inventory`; SQLite development uses Prisma's non-destructive schema push, followed by the same idempotent metadata backfill. No reset or data-loss acceptance flag is used. Do not run the old initial-migration generator against an existing shop.

Legacy variants are put under separate, unnumbered article parents. **No manufacturer article number is invented, and unrelated legacy stock is not merged automatically.** Edit an unnumbered article to enter its real number. To attach another old size to it, open that old variant's Details and choose **Link existing stock to a registered article**. This preserves its ID, stock, cost, internal barcode and historical bill links. Conflicting sizes/colours are rejected rather than silently combining stock.

## Register Walkaroo W5687, sizes 6–12

1. Open **Products → Add product**.
2. Enter Walkaroo, W5687, the product name, category and gender. Enter only details verified from your footwear/supplier.
3. Choose UK/India or type a different size system. The list is configurable in Owner Settings. Sizes are text: `2`, `6.5`, `13`, `S`, `M`, `L`, `XL`, etc. are valid.
4. Fill the first variant's colour, purchase cost (Owner), default selling price, MRP, opening quantity and minimum stock.
5. Tap **Add sizes 6–12** to copy those initial values to seven individually editable rows. This is a convenience button, not a size restriction. Edit quantities and prices by size; add other colours with **Add size / colour**.
6. For a different manufacturer barcode per size, enter or scan it in that variant's Manufacturer Barcode field and select the printed format.
7. For a shared manufacturer barcode, put it under **Shared barcode(s)**. Use `code|format`, such as `actual-code|CODE128`. Enter an actual valid number when choosing EAN/UPC formats; sample-looking numbers are not assumed valid.
8. Add optional aliases one per line as `code|format`. Choose supplier, image and notes, then Confirm & Save.

Entering a matching brand/article number offers existing articles and their sizes. Choose the existing article to add missing sizes or colours. The server prevents duplicate article identities and duplicate size/colour rows even when two browsers submit concurrently. Existing variants' stock cannot be changed through product editing; use a stock transaction.

Manufacturer barcodes are optional. Every variant receives a unique internal `AR…` SKU/Code128 value. This is a shop identifier, **not a manufacturer EAN/GTIN**. Existing internal barcodes remain valid. Owner label sheets use internal Code128 and include the secret cost code; customer receipts/PDFs/WhatsApp messages do not include that code. The Owner's New Bill cart continues to show the secret code beside MRP.

## Scan with a phone

Use HTTPS for Android/iPhone/tablet access. `localhost` also works for development on the device running the server; a phone visiting a computer's plain HTTP LAN IP does not get the localhost exception. The existing Caddy HTTPS Compose option is documented in the main README. Direct TLS can also be configured with `TLS_CERT_PATH` and `TLS_KEY_PATH` when you have suitable certificates.

Choose **Scan product** in New Bill, or **Scan barcode** in Products/Stock. Opening the scanner starts camera access; normal pages never request it. The scanner prefers the rear camera and provides live preview, a guide, camera selection, and a flashlight button only when the browser/device exposes torch support. Browser restrictions can still prevent torch control.

If permission is denied, no camera is found, or the browser lacks camera support, use **Manual barcode** or **Scan from photo**. Photos should show the complete barcode, both white margins, and sharp bars. EAN-13, EAN-8, UPC-A, UPC-E, Code128 and Code39 are enabled through ZXing; native BarcodeDetector is not required. Closing the scanner releases video tracks, including streams that finish opening after close. One scan operation returns one result.

- One matching variant: add that exact size/colour to the bill.
- Shared barcode: show a size/colour chooser with stock. A sold-out size remains visible and disabled; it is never silently replaced by another size.
- Unknown barcode: offer Add New Product and carry the scanned text into product registration.
- Scan again in a new operation: increase the selected variant's quantity in the existing cart line, subject to stock validation.

Alias/shared mappings are included in the signed-in user's cached catalogue, so manual/keyboard/camera lookup uses the same resolution rules offline after an online refresh. Product registration, stock changes, and supplier returns require the server. Pending offline bills still sync through the existing UUID-based transaction flow.

## Inventory and P&L

Stock In, Stock Out, Audit and Supplier Return operate on variant IDs. Scanning a shared code during stock work asks for the exact size. Each change creates a stock movement; new UI requests carry stable UUIDs so retries do not create duplicate receipts/adjustments. Legacy stock API callers should start sending `id` for safe retries. Supplier returns reduce inventory and create an auditable movement; supplier cash/credit settlements are not automatically entered as operating expenses.

New bills snapshot brand and article in addition to size, actual selling price, discount allocation and historical weighted cost. Brand/article/size reports use those snapshots and reverse returns with their original costs. Old bills without captured article/brand metadata are labelled **Unrecorded legacy…** in those new dimensions; their financial totals are preserved rather than reconstructed using today's price or guessed attributes. Purchases are not counted again as operating expenses; COGS is recognized through actual sales as before.

The new report sections show profit by brand/article/size, current inventory value, and out-of-stock counts. Per-variant minimum stock overrides the shop-wide alert threshold. Existing today/week/month/year, expenses, closing and net-profit calculations remain in place.

## Data/API notes

- `Product.barcode` stays unique because it is the internal shop barcode. It is never repurposed as a manufacturer barcode.
- `Barcode.value` is an indexed string **without a global unique constraint**. Its mapping target is unique, allowing one value on multiple variants or at article level. Leading zeros are preserved. UPC-A and its equivalent zero-prefixed EAN-13 resolve consistently.
- `POST /api/articles` accepts metadata and variants atomically; `GET /api/articles/:id` reads details; `GET /api/articles` supports lookup.
- `GET /api/barcodes/resolve?value=…` returns `UNKNOWN`, `UNIQUE` or `CHOOSE_VARIANT`, with role-filtered variants.
- `POST /api/articles/:id/attach-variant` links a legacy variant without changing its financial identity.
- `GET /api/products?all=true` includes inactive variants; default catalogue/billing excludes inactive variants.
- Stock request `id` is a UUID. Repeating it with changed content is rejected. `SUPPLIER_RETURN` is supported by `/api/stock/adjust`.
- Owner purchase costs, profit, cipher settings and label access retain their existing restrictions. Staff can manage allowed product/stock operations without reading costs.
- Backups are version 2 and include articles, barcode mappings, stock-operation IDs and product-change audits. Restore continues to accept version 1 into an empty database; setup/seed then backfills legacy article metadata.

## Verification

Run `npm.cmd test`, `npm.cmd run build`, then `npm.cmd run test:browser`. For the HTTPS browser suite in PowerShell:

```powershell
$env:POS_TEST_HTTPS='true'
npm.cmd run test:browser
```

HTTPS tests create a disposable certificate using OpenSSL (`TEST_OPENSSL_PATH` can point to its executable) and accept it **only in the test browser**. Tests use separate databases and never alter the real shop's inventory. They cover W5687 creation/persistence, shared selection, repeated scans, unique aliases, check digits, size-specific stock/sales/returns, idempotency, no overselling, historical P&L, legacy linking, backup restore, camera-denial recovery, real uploaded-image decoding, rear-camera constraints and track cleanup.

Browser emulation does not prove focus/torch behavior on a physical Android phone or iPhone. Verify those devices on your actual HTTPS address before shop rollout. Docker/PostgreSQL execution also needs validation on a machine with Docker installed.
