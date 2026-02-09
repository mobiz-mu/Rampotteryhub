// src/components/print/RamPotteryDoc.tsx
import React, { useMemo } from "react";
import "@/styles/rpdoc.css";

type Party = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  brn?: string | null;
  vat_no?: string | null;
  customer_code?: string | null;
};

type DocCompany = {
  brn?: string | null;
  addressLines?: string[] | null;
  phonesLine?: string | null;
  email?: string | null;
  website?: string | null;
  taglineTop?: string | null;
  taglineBottom?: string | null;
};

export type DocVariant = "INVOICE" | "CREDIT_NOTE" | "QUOTATION";

export type RamPotteryDocItem = {
  sn: number;

  item_code?: string;

  // ✅ unit
  box?: string; // old: BOX/PCS
  uom?: string; // new: BOX/PCS/KG

  // ✅ qty input (NEW)
  box_qty?: number | string | null; // for BOX and KG
  pcs_qty?: number | string | null; // for PCS

  // ✅ unit per box
  unit_per_box?: string | number; // old
  units_per_box?: string | number; // new

  total_qty?: string | number;
  description?: string;

  unit_price_excl_vat?: number;
  unit_vat?: number;
  unit_price_incl_vat?: number;
  line_total?: number;
};

type Totals = {
  subtotal?: number | null;
  vatLabel?: string; // "VAT 15%"
  vatPercentLabel?: string;
  vat_amount?: number | null;
  total_amount?: number | null;
  previous_balance?: number | null;
  amount_paid?: number | null;
  balance_remaining?: number | null;

  discount_percent?: number | null;
  discount_amount?: number | null;
};

export type RamPotteryDocProps = {
  variant?: DocVariant;
  docTitle?: string;

  companyName?: string;
  logoSrc?: string;

  customer: Party;
  company: DocCompany;

  docNoLabel?: string;
  docNoValue?: string;

  dateLabel?: string;
  dateValue?: string;

  purchaseOrderLabel?: string;
  purchaseOrderValue?: string;

  salesRepName?: string;
  salesRepPhone?: string;

  items: RamPotteryDocItem[];
  totals: Totals;

  preparedBy?: string | null;
  deliveredBy?: string | null;

  showFooterBar?: boolean;
};

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any) {
  const x = Number(v ?? 0);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function txt(v: any) {
  return String(v ?? "").trim();
}

/** normalize uom to BOX/PCS/KG */
function normUom(it: RamPotteryDocItem): "BOX" | "PCS" | "KG" {
  const u = String(it.uom || it.box || "BOX").trim().toUpperCase();
  if (u === "PCS") return "PCS";
  if (u === "KG" || u === "KGS") return "KG";
  return "BOX";
}

/** qty input: for BOX/KG use box_qty; for PCS use pcs_qty; fallback to total_qty if legacy */
function qtyInput(it: RamPotteryDocItem): number | null {
  const u = normUom(it);

  // helper: fallback to total_qty if qty fields missing
  const fallbackTotal = () => {
    const legacy = it.total_qty;
    if (legacy === null || legacy === undefined || legacy === "") return null;
    return n2(legacy);
  };

  if (u === "PCS") {
    const v = it.pcs_qty;
    if (v === null || v === undefined || v === "") return fallbackTotal(); // ✅ fallback added
    return n2(v);
  }

  // BOX or KG
  const v = it.box_qty;
  if (v === null || v === undefined || v === "") return fallbackTotal(); // ✅ keep fallback
  return n2(v);
}


/** units per box: only for BOX */
function upb(it: RamPotteryDocItem): number | null {
  const u = normUom(it);
  if (u !== "BOX") return null;
  const v = it.units_per_box ?? it.unit_per_box;
  if (v === null || v === undefined || v === "") return null;
  const x = Math.max(1, Math.trunc(n2(v)));
  return x;
}

/** display qty nicely */
function fmtQty(uom: "BOX" | "PCS" | "KG", v: number | null) {
  if (v === null) return "";
  if (uom === "KG") {
    // show up to 3dp, no trailing zeros
    const s = String(Number(v.toFixed(3)));
    return s;
  }
  // integer for BOX/PCS
  return String(Math.trunc(v));
}

function TableHeader() {
  return (
    <thead>
      <tr>
        <th>SN</th>
        <th>
          ITEM
          <br />
          CODE
        </th>
        {/* IMPORTANT: this column in your PNG is actually "Qty (BOX/PCS/KG)" */}
        <th>BOX</th>
        <th>
          UNIT
          <br />
          PER
          <br />
          BOX
        </th>
        <th>
          TOTAL
          <br />
          QTY
        </th>
        <th>DESCRIPTION</th>
        <th>
          UNIT
          <br />
          PRICE
          <br />
          (EXCL
          <br />
          VAT)
        </th>
        <th>VAT</th>
        <th>
          UNIT
          <br />
          PRICE
          <br />
          (INCL
          <br />
          VAT)
        </th>
        <th>
          TOTAL
          <br />
          AMOUNT
          <br />
          (INCL VAT)
        </th>
      </tr>
    </thead>
  );
}

function ItemsTable({ items }: { items: RamPotteryDocItem[] }) {
  return (
    <table className="rpdoc-table">
      <colgroup>
        <col style={{ width: "5.2%" }} />
        <col style={{ width: "8.5%" }} />
        <col style={{ width: "6.5%" }} />
        <col style={{ width: "9.0%" }} />
        <col style={{ width: "8.5%" }} />
        <col style={{ width: "23.0%" }} />
        <col style={{ width: "9.2%" }} />
        <col style={{ width: "6.8%" }} />
        <col style={{ width: "9.2%" }} />
        <col style={{ width: "14.1%" }} />
      </colgroup>

      <TableHeader />

      <tbody>
        {(items || []).map((it, idx) => {
  const u = normUom(it);
  const q = qtyInput(it);
  const qtyText = fmtQty(u, q);

  const unitPerBox = upb(it);
  const unitPerBoxText = unitPerBox ? String(unitPerBox) : "";

  return (
    <tr key={idx}>
      <td>{it.sn}</td>
      <td>{txt(it.item_code)}</td>

      {/* BOX column now shows "2 BOX" / "12 PCS" / "0.450 KG" */}
      <td>{qtyText ? `${qtyText} ${u}` : ""}</td>

      {/* UPB only for BOX */}
      <td>{u === "BOX" ? unitPerBoxText : ""}</td>

      <td>{txt(it.total_qty)}</td>
      <td className="rpdoc-desc">{txt(it.description)}</td>
      <td>{money(it.unit_price_excl_vat)}</td>
      <td>{money(it.unit_vat)}</td>
      <td>{money(it.unit_price_incl_vat)}</td>
      <td>{money(it.line_total)}</td>
    </tr>
  );
})}
      </tbody>
    </table>
  );
}

function NotesTotals({ totals, balanceRemaining }: { totals: Totals; balanceRemaining: number }) {
  return (
    <div className="rpdoc-footerGrid">
      <div className="rpdoc-notesBox">
        <div className="rpdoc-notesTitle">Note:</div>
        <ul>
          <li>Goods once sold cannot be returned or exchanged.</li>
          <li>For any manufacturing defects, this invoice must be produced for refund or exchange.</li>
          <li>Customer must verify that quantity conforms with invoice, not responsible after delivery.</li>
          <li>Interest of 1% above bank rate will be charged if not settled within 30 days.</li>
          <li>
            All cheques to be issued on <span className="rpdoc-redStrong">RAM POTTERY LTD.</span>
          </li>
          <li>
            Bank transfer to <span className="rpdoc-redStrong">000 44 570 46 59</span> MCB Bank
          </li>
        </ul>
      </div>

      <div className="rpdoc-totalsBox">
        <div className="rpdoc-totalRow">
          <span>SUB TOTAL</span>
          <span>{money(totals?.subtotal)}</span>
        </div>
        <div className="rpdoc-totalRow">
          <span>{txt(totals?.vatLabel || totals?.vatPercentLabel) || "VAT 15%"}</span>
          <span>{money(totals?.vat_amount)}</span>
        </div>
        <div className="rpdoc-totalRow rpdoc-totalRowBig">
          <span>TOTAL AMOUNT</span>
          <span>{money(totals?.total_amount)}</span>
        </div>
        <div className="rpdoc-totalRow">
          <span>PREVIOUS BALANCE</span>
          <span>{money(totals?.previous_balance)}</span>
        </div>
        <div className="rpdoc-totalRow">
          <span>GROSS TOTAL</span>
          <span>{money(n2(totals?.total_amount) + n2(totals?.previous_balance))}</span>
        </div>
        <div className="rpdoc-totalRow">
          <span>AMOUNT PAID</span>
          <span>{money(totals?.amount_paid)}</span>
        </div>
        <div className="rpdoc-totalRow">
          <span>BALANCE REMAINING</span>
          <span>{money(balanceRemaining)}</span>
        </div>
      </div>
    </div>
  );
}

function Signatures({ preparedBy, deliveredBy }: { preparedBy: string; deliveredBy: string }) {
  return (
    <div className="rpdoc-signatures">
      <div className="rpdoc-sig">
        <div className="rpdoc-sigLine" />
        <div className="rpdoc-sigTitle">Signature</div>
        <div className="rpdoc-sigSub">Prepared by : {preparedBy}</div>
      </div>

      <div className="rpdoc-sig">
        <div className="rpdoc-sigLine" />
        <div className="rpdoc-sigTitle">Signature</div>
        <div className="rpdoc-sigSub">Delivered by : {deliveredBy}</div>
      </div>

      <div className="rpdoc-sig">
        <div className="rpdoc-sigLine" />
        <div className="rpdoc-sigTitle">Signature</div>
        <div className="rpdoc-sigSub">Customer Name:.................................</div>
      </div>
    </div>
  );
}

export default function RamPotteryDoc(props: RamPotteryDocProps) {
  const {
    variant = "INVOICE",
    docTitle,

    companyName = "RAM POTTERY LTD",
    logoSrc = "/logo.png",
    customer,
    company,

    docNoLabel =
      variant === "QUOTATION" ? "QUOTATION NO:" : variant === "CREDIT_NOTE" ? "CREDIT NOTE NO:" : "INVOICE NO:",
    docNoValue = "",

    dateLabel = "DATE:",
    dateValue = "",

    purchaseOrderLabel = variant === "QUOTATION" ? "VALID UNTIL:" : "PO NO.:",
    purchaseOrderValue = "",

    salesRepName = "",
    salesRepPhone = "",

    items,
    totals,

    preparedBy = "",
    deliveredBy = "",
  } = props;

  const computedTitle =
    docTitle || (variant === "CREDIT_NOTE" ? "CREDIT NOTE" : variant === "QUOTATION" ? "QUOTATION" : "VAT INVOICE");

  const addressLines = company?.addressLines?.length
    ? company.addressLines
    : ["Robert Kennedy Street, Reunion Maurel,", "Petit Raffray - Mauritius"];

  const phonesLine = company?.phonesLine || "Tel: +230 57788884 +230 58060268 +230 52522844";
  const email = company?.email || "info@rampottery.com";
  const website = company?.website || "www.rampottery.com";

  const taglineTop = company?.taglineTop || "MANUFACTURER & IMPORTER OF QUALITY CLAY";
  const taglineBottom = company?.taglineBottom || "PRODUCTS AND OTHER RELIGIOUS ITEMS";

  const docItems = useMemo(() => (items || []).map((x, i) => ({ ...x, sn: x?.sn ?? i + 1 })), [items]);

  const balanceRemaining = useMemo(() => {
    const gross = n2(totals?.total_amount) + n2(totals?.previous_balance);
    return Number.isFinite(Number(totals?.balance_remaining))
      ? n2(totals?.balance_remaining)
      : Math.max(0, gross - n2(totals?.amount_paid));
  }, [totals?.total_amount, totals?.previous_balance, totals?.amount_paid, totals?.balance_remaining]);

  const splitFooterToSecondPage = docItems.length >= 7;
  const totalPages = splitFooterToSecondPage ? 2 : 1;

  const HeaderBlock = (
    <div className="rpdoc-header">
      <div className="rpdoc-headerGrid">
        <div className="rpdoc-logoCol">
          <img className="rpdoc-logoImg" src={logoSrc} alt="Ram Pottery" draggable={false} />
        </div>

        <div className="rpdoc-headerCenter">
          <div className="rpdoc-companyName">{companyName}</div>

          <div className="rpdoc-taglines">
            <div>{taglineTop}</div>
            <div>{taglineBottom}</div>
          </div>

          <div className="rpdoc-address">
            {addressLines.map((l, idx) => (
              <div key={idx}>{l}</div>
            ))}
          </div>

          <div className="rpdoc-contact">
            <div className="rpdoc-contactLine">
              <span className="rpdoc-redStrong">Tel:</span> {phonesLine.replace(/^Tel:\s*/i, "")}
            </div>
            <div className="rpdoc-contactLine">
              <span className="rpdoc-redStrong">Email:</span> {email}
              <span className="rpdoc-dot">•</span>
              <span className="rpdoc-redStrong">Web:</span> {website}
            </div>
          </div>

          <div className="rpdoc-title">{computedTitle}</div>
        </div>

        <div className="rpdoc-headerSpacer" />
      </div>
    </div>
  );

  const BoxesBlock = (
    <div className="rpdoc-boxes">
      <div className="rpdoc-box">
        <div className="rpdoc-boxHead">CUSTOMER DETAILS</div>
        <div className="rpdoc-boxBody">
          <div className="rpdoc-kv">
            <div className="k">Name:</div>
            <div className="v">{txt(customer?.name)}</div>
          </div>
          <div className="rpdoc-kv">
            <div className="k">Address:</div>
            <div className="v">{txt(customer?.address)}</div>
          </div>
          <div className="rpdoc-kv">
            <div className="k">Tel:</div>
            <div className="v">{txt(customer?.phone)}</div>
          </div>

          <div className="rpdoc-kvLine">
            <div className="kvPair">
              <div className="k">BRN:</div>
              <div className="v rpdoc-nowrap">{txt(customer?.brn)}</div>
            </div>

            <div className="kvPair">
              <div className="k">VAT NO:</div>
              <div className="v rpdoc-nowrap">{txt(customer?.vat_no)}</div>
            </div>
          </div>

          <div className="rpdoc-kv">
            <div className="k">Customer Code:</div>
            <div className="v">{txt(customer?.customer_code)}</div>
          </div>
        </div>
      </div>

      <div className="rpdoc-box">
        <div className="rpdoc-boxHead">BRN: {txt(company?.brn) || "-"}</div>
        <div className="rpdoc-boxBody">
          <div className="rpdoc-kv">
            <div className="k">{docNoLabel}</div>
            <div className="v">{txt(docNoValue)}</div>
          </div>
          <div className="rpdoc-kv">
            <div className="k">{dateLabel}</div>
            <div className="v">{txt(dateValue)}</div>
          </div>
          <div className="rpdoc-kv">
            <div className="k">{purchaseOrderLabel}</div>
            <div className="v">{txt(purchaseOrderValue)}</div>
          </div>

          <div className="rpdoc-kv">
            <div className="k">Sales Rep :</div>
            <div className="v">{txt(salesRepName)}</div>
          </div>
          <div className="rpdoc-kv">
            <div className="k">Tel:</div>
            <div className="v">{txt(salesRepPhone)}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const FooterBlock = (
    <div className="rpdoc-footerRegion">
      <NotesTotals totals={totals} balanceRemaining={balanceRemaining} />
      <div className="rpdoc-signaturesWrap">
        <Signatures preparedBy={txt(preparedBy)} deliveredBy={txt(deliveredBy)} />
      </div>
    </div>
  );

  const Page1 = (
    <section className="rpdoc-page">
      <div className="rpdoc-pageNumber">Page 1 / {totalPages}</div>

      <div className="rpdoc-frame">
        {HeaderBlock}
        {BoxesBlock}

        <div className="rpdoc-tableWrap">
          <ItemsTable items={docItems} />
        </div>

        {!splitFooterToSecondPage ? FooterBlock : null}
      </div>
    </section>
  );

  const Page2 = splitFooterToSecondPage ? (
    <section className="rpdoc-page">
      <div className="rpdoc-pageNumber">Page 2 / {totalPages}</div>
      <div className="rpdoc-frame">{FooterBlock}</div>
    </section>
  ) : null;

  return (
    <div className="rpdoc-pages" id="rpdoc-root">
      {Page1}
      {Page2}
    </div>
  );
}


