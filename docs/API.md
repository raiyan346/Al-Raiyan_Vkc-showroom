# REST API

Base URL `/api`. Except login and health, send `Authorization: Bearer <JWT>`. Amounts in API requests/responses are **integer paise**; CSV/Excel import prices are rupees. IDs are UUIDs except generated Code128 values, bill display numbers and payment allocation suffixes. Error responses are JSON `{ "error": "Readable message" }`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Database health |
| POST | `/auth/login` | Public, rate limited | `{username,password}` → `{token,user}` |
| GET | `/auth/me` | Both | Current account identity |
| POST | `/auth/password` | Both | `{current,password}`; revoke existing JWTs |
| GET/PUT | `/settings` | Read both; write Owner | Shop name/address/phone, low-stock threshold, cipher (Owner only) |
| POST | `/cost-code/decode` | Owner | `{code}` → rupee `{amount}` |
| GET/POST | `/users` | Owner | List/create `{name,username,password,role}` |
| PATCH | `/users/:id` | Owner | `{active}`; revokes prior tokens |
| GET/POST | `/products` | Both | List/create variants |
| PUT/DELETE | `/products/:id` | Both | Edit details / soft delete |
| POST | `/products/:id/restore` | Both | Undo soft delete |
| POST | `/products/import` | Both | `{format:"csv"|"xlsx",content,confirm:false}` preview; `confirm:true` atomically creates all rows |
| POST | `/labels` | Owner | `{ids:[productId]}` → barcode-label data with current cost codes |
| GET/POST | `/sales` | Both | Last 200 bills / commit bill |
| GET | `/sales/:id` | Both | Full bill with original line snapshots and returns |
| GET | `/sales/:id/pdf` | Both | Customer A4 receipt PDF |
| POST | `/sales/:id/returns` | Both | Idempotent return and stock/credit/refund update |
| GET/POST | `/customers` | Both | List balances / add `{name,phone}` |
| GET | `/customers/:id/history` | Both | Purchases, returns, credit payments, balance |
| POST | `/customers/:id/payments` | Both | Idempotent `{id,amount,mode}` collection |
| GET/POST | `/suppliers` | Both | List/add `{name,phone,address}` |
| GET | `/suppliers/:id/purchases` | Both | Supplier history; costs redacted for Staff |
| POST | `/stock/in` | Both | Supplier receipt with weighted cost update |
| POST | `/stock/adjust` | Both | Stock out or scanned audit |
| GET | `/stock/movements` | Both | Last 200 adjustments/sales/returns |
| GET/POST | `/expenses` | Both | Last 500 expenses / add `{category,note,amount,day}` |
| DELETE | `/expenses/:id` | Owner | Remove an erroneous expense |
| GET | `/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Owner | Inclusive date-range metrics and alerts |
| GET | `/reports/export/xlsx` or `/reports/export/pdf` | Owner | Same date parameters; downloadable report |
| GET | `/closing?day=YYYY-MM-DD&opening=10000` | Owner | Expected cash and its components |
| POST | `/closing` | Owner | `{day,opening,counted,note}` upserts daily snapshot |
| GET | `/closings` | Owner | Last 100 saved closings |
| POST | `/backups` | Owner | Create server backup; returns filename, not confidential data |

## Product body

```json
{"name":"VKC sandal","brand":"VKC","category":"Sandals","size":"8","color":"Brown","mrp":59900,"purchasePrice":30000,"quantity":12,"photo":null}
```

`purchasePrice` is writable/readable only to Owners. Staff creations have an unconfirmed zero cost until an Owner enters it, and do not return this field. Editing product `quantity` is deliberately ignored; use stock endpoints for an auditable quantity change. Optional photos accept PNG/JPEG/WebP data URLs (up to the configured size) or HTTPS URLs. The API creates a unique Code128 value.

## Bill body

```json
{
  "id":"885bde4b-25ce-4bad-b09a-fdb202f1e24e",
  "customerId":null,
  "items":[{"productId":"PRODUCT_UUID","quantity":2,"unitPrice":45000}],
  "discount":10000,
  "paymentMode":"CASH",
  "cashTendered":100000,
  "soldAt":"2026-11-14T08:30:00.000Z"
}
```

The server ignores no financial totals: it accepts only this strict input shape and computes totals/cost/profit itself. One row per product ID. Cash must cover total; Credit requires a customer. Repeated IDs with the same normalized body and user return the original accepted bill. Reuse with changed content fails. Posting times are authoritative for reports; soldAt preserves the device timestamp. Stock decrement is conditional, and all movements/credit and invoice rows commit atomically.

## Return body

```json
{"id":"RETURN_UUID","reason":"Wrong size","refundMode":"CASH","items":[{"saleItemId":"LINE_UUID","quantity":1}]}
```

Only purchased, not-yet-returned quantities are valid. The discounted line value determines the refund. A Credit return reduces remaining credit before recording any refundable excess. Returns use their UUID for retry safety and reject reuse for different content. Replacements are separately billed.

## Stock bodies

```json
{"supplierId":null,"reference":"Supplier invoice 20","items":[{"productId":"PRODUCT_UUID","quantity":10,"unitCost":32000}]}
```

`unitCost` is optional; only Owners can set a changed purchase cost. Staff receipts use the existing cost. Weighted average is rounded to integer paise and affects only subsequent sales/current labels.

```json
{"productId":"PRODUCT_UUID","kind":"AUDIT","quantity":13,"note":"Physical count"}
```

`AUDIT` is actual remaining stock; `OUT` is quantity to remove. Adjustments cannot make stock negative. Bulk imports/stock receipts validate and commit as one transaction.

## Confidentiality and status codes

Staff sales, histories and products omit purchase costs, profits, cipher and request hashes. Customer receipt generators use explicit selling fields and never the whole product/sale object. Owner report/label/settings/user/backup checks are enforced server-side.

Validation/business errors: 400. Missing/expired/disabled sessions: 401. Owner-only access: 403. Missing record: 404. Unique conflicts: 409. Unexpected database failure: 500. Clients must retain unsynced bills on network failures or rejected stock validation and offer deliberate retry/review.


## Article inventory extension

See [Footwear inventory](FOOTWEAR-INVENTORY.md) for article and barcode contracts, stock-operation retry IDs, shared barcode selection, legacy linking, and snapshot-based profit dimensions. `Product` remains the variant entity; `Product.barcode` is an internal Code128, while manufacturer and shared mappings live in `Barcode` without a global unique value constraint.
