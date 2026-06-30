# Ram Pottery Hub — Launch-Readiness Report

Final pass: centered Dot-Matrix document title, removed the on-screen helper
card, and a full launch-readiness inspection. A4/PDF printing is unchanged.

---

## 1. Validation results (all passing)

| Check | Command | Result |
|-------|---------|--------|
| Install | `npm install` | OK |
| Audit | `npm audit` | **0 vulnerabilities** |
| Frontend types | `npx tsc -p tsconfig.app.json --noEmit` | **0 errors** |
| Server types | `npm run build:server` | **0 errors** |
| Build | `npm run build` | **Success** |
| Tests | `npm test` | **3 passed** |
| API health | `GET /api/health` | **200** `{"ok":true,"service":"ram-pottery-api"}` |
| Credit-note routes | `GET /api/credit-notes` | **mounted** (reaches DB layer, not 404) |
| Quotation routes | `GET /api/quotations` | **mounted** |
| Unknown route | `GET /api/nonexistent` | **404** (correct) |
| Proxy (default) | resolver | `http://localhost:3001` |
| Proxy (`API_PORT=3010`) | Vite dev → proxied health | `http://localhost:3010`, **200** (verified end-to-end) |

---

## 2. This round's fixes

### 2.1 Dot-Matrix document title — centered under the Web line
Previously the document type printed at the top-left as the first line. It now
renders as a dedicated centered element:
- `src/components/print/DotMatrixDocument.tsx` renders
  `<div className="dm-document-title">{INVOICE|QUOTATION|CREDIT NOTE}</div>`.
- `src/styles/dotMatrixPrint.css` `.dm-document-title`: `position:absolute; top:196pt`
  (~2.72in — just below the pre-printed `Web: www.rampottery.mu` line at ~186pt and
  above the `CUSTOMER DETAILS` area at ~233pt), `left:50%; transform:translateX(-50%);`
  `width:3in; text-align:center; font-size:18pt; font-weight:900; color:#000;`
  `text-transform:uppercase; letter-spacing:0.04em;`
- It is big/bold/black, centered, and does not overlap the customer or document
  details. The data-only rule is unchanged (no company name/labels/boxes/headers/
  notes/totals labels/signature labels are printed — only the title and values).
- The render test asserts the title is the `.dm-document-title` element with text
  `INVOICE`.

### 2.2 Removed the on-screen helper/info card
The "Pre-printed continuous stationery — data only / Paper size / Scale / Margins /
Background graphics / Orientation" card was removed from all Dot-Matrix print
screens. The page now shows only: a small top action bar (**Print** + **Back**),
the document title, and the data-only print preview. Auto-print after data is
ready is retained. Nothing instructional is shown or printed.

Applies to Invoice, Quotation and Credit-Note dot-matrix screens (all three share
`DotMatrixDocument`).

---

## 3. Launch-readiness inspection

**Routing / pages.** Every page lazily imported in `src/App.tsx` resolves to an
existing file (a successful `npm run build` also proves all imports resolve — no
broken/blank pages). No dead framework API folders remain (`src/api`, `src/app`
were removed earlier; confirmed absent).

**Print flows.**
- A4/PDF: `/invoices/:id/print`, `/quotations/:id/print`, `/credit-notes/:id/print`
  — unchanged.
- Dot Matrix: same routes + `?format=dot-matrix` — renders data-only and
  auto-prints; the render test confirms values are present (not blank).
- Public links: `/.../:id/print?t=<token>` and `…&format=dot-matrix`.
- Buttons on `InvoiceView` / `QuotationView` / `CreditNoteView`: **Print PDF** +
  **Print Dot Matrix**.
- Three-dot row menus on `Invoices` / `CreditNotes` / `Quotation`: **Print PDF** +
  **Dot Matrix Print** (plus View / Edit / Share-WhatsApp / Void where supported).

**Credits.** Outstanding-only (fully-paid hidden, no Paid filter); cards =
Customers With Due / Total Due / Partially Paid / Total Outstanding / Unpaid
Invoices; payment methods = Cash, Bank Transfer, MCB Juice, Cheque, Card, Other
(placeholder, readable, `z-[100]` inside the dialog); oldest-first allocation,
partial → Partially Paid, full → cleared & removed from list, overpayment
prevented, payment history shown. Method saves to `invoice_payments.method`.

**API / proxy.** `GET /api/health` = 200. `/api/credit-notes` and `/api/quotations`
are mounted. The Vite dev proxy follows `VITE_API_TARGET` → `http://localhost:${API_PORT}`
→ `:3001` and logs the resolved target; verified end-to-end with `API_PORT=3010`.

**Security / config.** `npm audit` = 0 vulnerabilities. `xlsx` replaced by
`exceljs`. Real `.env` is excluded from the zip; `.env.example` is included.
Service-role key is server-side only (not exposed via Vite).

**UI / responsiveness.** App-wide premium layer (cards, tables, Radix
menus/selects/popovers, mobile-safe dialogs, pill badges, rounded inputs, focus
rings, clean horizontal table scroll) plus the dot-matrix screen cleanup.

---

## 4. Files changed this round
- `src/components/print/DotMatrixDocument.tsx` — centered title element; removed
  helper/info card; minimal no-data message
- `src/styles/dotMatrixPrint.css` — `.dm-document-title` centered style
- `src/test/dotMatrix.test.tsx` — asserts centered title element
- `REPORT.md` — this report

(Earlier rounds: Supabase types rebuilt; credit-note routes mounted; `x-rp-user`
header fix; dead Vercel/Next API + orphaned QR files removed; `xlsx`→`exceljs`;
dynamic Vite proxy; Dot-Matrix system + blank-print fix + auto-print; Credits
outstanding-only + payment-method dropdown; global premium UI layers.)

---

## 5. Run locally

```bash
cp .env.example .env        # fill in your Supabase values
npm install
npm run dev:all             # frontend (:8080) + Express API
# verify
npx tsc -p tsconfig.app.json --noEmit
npm run build:server
npm run build
npm test
```

If the API runs on a non-default port, set `API_PORT` (e.g. `API_PORT=3010`) or
`VITE_API_TARGET`; the Vite proxy follows it — no `/api/auth/me` ECONNREFUSED.

### Dot-matrix print (Chrome / Edge)
Custom/Continuous paper 9.18in × 12.61in · Scale 100% (not "Fit to page") ·
Margins None · Headers/footers Off · Background graphics Off · Portrait.
(The on-screen card was removed by request; these settings are documented here.)

---

## 6. Deployment notes
- Frontend: `npm run build` → `dist/` (static host). `vercel.json` rewrites
  `/api/*` to the Render Express API.
- Server: `npm run build:server` → `dist-server/`, run `node dist-server/index.js`
  with `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `API_PORT` set in the
  host environment. Keep the service-role key server-side only.
- Supabase: types in `src/integrations/supabase/types.ts` were reconstructed to
  match the live schema used by the app; regenerate canonically with
  `supabase gen types typescript --project-id <ref>` when convenient.

---

## 7. Known limitations
- Dot-matrix coordinates come from the supplied stationery PDF; if a specific
  printer is a hair off, constants in `dotMatrixLayout.ts` / `printSettings.ts`
  can be nudged in code (no user-facing calibration, by request).
- The UI is an app-wide design-system enhancement, not a per-page hand-rewrite,
  to protect business logic.
- Supabase/RLS behaviour can only be fully verified against the live project with
  real credentials; the code paths and route mounts are correct.

## 8. Launch-readiness status
**READY** — types (frontend + server) clean, build clean, tests passing, audit
clean, API health + route mounts confirmed, proxy verified on default and 3010,
no dead API folders, no real secrets in the zip, dot-matrix data-only print
centered title + non-blank, A4/PDF unchanged.
