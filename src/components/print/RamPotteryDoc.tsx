import React, { useMemo } from "react";
import "@/styles/rpdoc.css";

type Party = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  brn?: string | null;
  vat_no?: string | null;
  customer_code?: string | null;
};

type DocCompany = {
  brn?: string | null;
  vat_no?: string | null;

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

  uom?: string;
  box?: string;

  box_qty?: number | string | null;
  pcs_qty?: number | string | null;
  grams_qty?: number | string | null;
  bags_qty?: number | string | null;

  unit_per_box?: string | number;
  units_per_box?: string | number;

  total_qty?: string | number;
  description?: string;

  unit_price_excl_vat?: number;
  unit_vat?: number;
  unit_price_incl_vat?: number;
  line_total?: number;
};

type Totals = {
  subtotal?: number | null;
  vatLabel?: string;
  vatPercentLabel?: string;

  discount_percent?: number | null;
  discount_amount?: number | null;

  vat_amount?: number | null;
  total_amount?: number | null;
  previous_balance?: number | null;

  amount_paid?: number | null;
  balance_remaining?: number | null;
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

/**
 * Practical print behavior:
 * - 10 lines or less => keep all on one page with footer
 * - 11 to 23 lines   => keep all product lines on page 1, footer on page 2
 * - more than 23     => page 1 keeps 23 lines, overflow continues, footer only on last page
 */
const SINGLE_PAGE_ROWS = 10;
const FIRST_PAGE_ROWS = 23;
const MIDDLE_PAGE_ROWS = 26;
const LAST_PAGE_ROWS = 7;

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any) {
  const x = Number(v ?? 0);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moneyBlank(v: any) {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  const x = Number(v);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString("en-MU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function txt(v: any) {
  return String(v ?? "").trim();
}

function customerPhones(customer: Party) {
  const phone = txt(customer?.phone);
  const whatsapp = txt(customer?.whatsapp);

  if (phone && whatsapp) {
    if (phone === whatsapp) return phone;
    return `${phone} / ${whatsapp}`;
  }

  return phone || whatsapp || "";
}

function normUom(it: RamPotteryDocItem): "BOX" | "PCS" | "KG" | "G" | "BAG" {
  const raw = String(it.uom || it.box || "BOX").trim().toUpperCase();
  if (raw === "PCS") return "PCS";
  if (raw === "KG" || raw === "KGS") return "KG";
  if (raw === "G" || raw === "GRAM" || raw === "GRAMS") return "G";
  if (raw === "BAG" || raw === "BAGS") return "BAG";
  return "BOX";
}

function qtyInput(it: RamPotteryDocItem): number | null {
  const u = normUom(it);

  const fallbackTotal = () => {
    const legacy = it.total_qty;
    if (legacy === null || legacy === undefined || legacy === "") return null;
    return n2(legacy);
  };

  if (u === "PCS") {
    const v = it.pcs_qty;
    if (v === null || v === undefined || v === "") return fallbackTotal();
    return n2(v);
  }

  if (u === "G") {
    const g = (it as any).grams_qty;
    if (g !== null && g !== undefined && g !== "") return n2(g);

    const bx = it.box_qty;
    if (bx !== null && bx !== undefined && bx !== "") return n2(bx);

    return fallbackTotal();
  }

  if (u === "BAG") {
    const v = (it as any).bags_qty;
    if (v !== null && v !== undefined && v !== "") return n2(v);

    const bx = it.box_qty;
    if (bx !== null && bx !== undefined && bx !== "") return n2(bx);

    return fallbackTotal();
  }

  const v = it.box_qty;
  if (v === null || v === undefined || v === "") return fallbackTotal();
  return n2(v);
}

function upb(it: RamPotteryDocItem): number | null {
  const u = normUom(it);
  if (u !== "BOX" && u !== "BAG") return null;

  const v = it.units_per_box ?? it.unit_per_box;
  if (v === null || v === undefined || v === "") return u === "BAG" ? 25 : null;

  const num = n2(v);
  if (!Number.isFinite(num) || num <= 0) return u === "BAG" ? 25 : null;

  return u === "BAG" ? Number(num.toFixed(3)) : Math.max(1, Math.trunc(num));
}

function fmtQty(uom: "BOX" | "PCS" | "KG" | "G" | "BAG", v: number | null) {
  if (v === null) return "";

  const rounded3 = Number(v.toFixed(3));
  const isWhole = Math.abs(rounded3 - Math.trunc(rounded3)) < 0.0005;

  if (uom === "KG" || uom === "G" || uom === "BAG") {
    return String(rounded3);
  }

  return isWhole ? String(Math.trunc(rounded3)) : String(rounded3);
}

function fmtTotalQty(v: any) {
  if (v === null || v === undefined || v === "") return "";
  const x = Number(v);
  if (!Number.isFinite(x)) return txt(v);

  const rounded3 = Number(x.toFixed(3));
  const isWhole = Math.abs(rounded3 - Math.trunc(rounded3)) < 0.0005;

  return isWhole ? String(Math.trunc(rounded3)) : String(rounded3);
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
        <th>QTY</th>
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

function ItemsTable({ items, minRows = 0 }: { items: RamPotteryDocItem[]; minRows?: number }) {
  const rowCount = (items || []).length;
  const pad = Math.max(0, (minRows || 0) - rowCount);

  return (
    <table className="rpdoc-table">
      <colgroup>
          <col style={{ width: "4.8%" }} />
          <col style={{ width: "8.2%" }} />
          <col style={{ width: "7.4%" }} />
          <col style={{ width: "8.6%" }} />
          <col style={{ width: "8.2%" }} />
          <col style={{ width: "24.5%" }} />
          <col style={{ width: "8.6%" }} />
          <col style={{ width: "6.2%" }} />
          <col style={{ width: "8.8%" }} />
          <col style={{ width: "14.7%" }} />
      </colgroup>      
  
    <TableHeader />

      <tbody>
        {(items || []).map((it, idx) => {
          const u = normUom(it);
          const q = qtyInput(it);
          const qtyText = fmtQty(u, q);

          const unitPerBox = upb(it);
          const unitPerBoxText = unitPerBox ? String(unitPerBox) : "";

          const totalQtyText = fmtTotalQty(it.total_qty);

          return (
            <tr key={idx}>
              <td>{it.sn}</td>
              <td>{txt(it.item_code)}</td>
              <td>{qtyText ? `${qtyText} ${u}` : ""}</td>
              <td>{u === "BOX" || u === "BAG" ? unitPerBoxText : ""}</td>
              <td>{totalQtyText}</td>
              <td className="rpdoc-desc">{txt(it.description)}</td>
              <td>{money(it.unit_price_excl_vat)}</td>
              <td>{money(it.unit_vat)}</td>
              <td>{money(it.unit_price_incl_vat)}</td>
              <td>{money(it.line_total)}</td>
            </tr>
          );
        })}

        {Array.from({ length: pad }).map((_, i) => (
          <tr key={`pad-${i}`}>
            <td>&nbsp;</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td className="rpdoc-desc"></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NotesTotals({ totals }: { totals: Totals }) {
  return (
    <div className="rpdoc-footerGrid">
      <div className="rpdoc-notesBox">
        <div className="rpdoc-notesTitle">Note:</div>
        <ul>
          <li>Goods once sold cannot be returned or exchanged.</li>
          <li>For any manufacturing defects, this invoice must be produced for refund or exchange.</li>
          <li>Customer must verify that quantity conforms with invoice, not responsible after delivery.</li>
          <li>Interest of 1% above bank rate will be charged if not settled within 30 days.</li>
          <li>The customer must verify the amount.</li>
          <li>Delivery will be done at the ground floor only.</li>
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
          <span>{moneyBlank(totals?.amount_paid)}</span>
        </div>
        <div className="rpdoc-totalRow">
          <span>BALANCE REMAINING</span>
          <span>{moneyBlank(totals?.balance_remaining)}</span>
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

function FooterArea({
  totals,
  preparedBy,
  deliveredBy,
}: {
  totals: Totals;
  preparedBy: string;
  deliveredBy: string;
}) {
  return (
    <div
  style={{
    marginTop: "2mm",
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  }}
>
  <NotesTotals totals={totals} />

  <div
    style={{
      height: "1px",
      background: "#c1121f",
      width: "100%",
      marginTop: "4px",
      marginBottom: "0px",
      flex: "0 0 auto",
    }}
  />

  <div
    style={{
      flex: "0 0 5mm",
      minHeight: "5mm",
      maxHeight: "5mm",
    }}
  />

  <div style={{ flex: "0 0 auto" }}>
    <Signatures preparedBy={preparedBy} deliveredBy={deliveredBy} />
  </div>
</div>  
);
}

function chunk<T>(arr: T[], size: number) {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

    purchaseOrderLabel,
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
  const count = docItems.length;

  const pagination = useMemo(() => {
    // 10 or less => all on one page with footer
    if (count <= SINGLE_PAGE_ROWS) {
      return {
        page1Items: docItems,
        middlePages: [] as RamPotteryDocItem[][],
        lastPageItems: [] as RamPotteryDocItem[],
        totalPages: 1,
        showFooterOnPage1: true,
      };
    }

    // 11 to 23 => page 1 keeps all product lines, footer goes to page 2
    if (count <= FIRST_PAGE_ROWS) {
      return {
        page1Items: docItems,
        middlePages: [] as RamPotteryDocItem[][],
        lastPageItems: [] as RamPotteryDocItem[],
        totalPages: 2,
        showFooterOnPage1: false,
      };
    }

    // >23 => page 1 keeps 23 lines, last page keeps footer
    const firstCount = FIRST_PAGE_ROWS;
    let remaining = docItems.slice(firstCount);

    const middlePages: RamPotteryDocItem[][] = [];
    while (remaining.length > LAST_PAGE_ROWS) {
      const take = Math.min(MIDDLE_PAGE_ROWS, remaining.length - LAST_PAGE_ROWS);
      middlePages.push(remaining.slice(0, take));
      remaining = remaining.slice(take);
    }

    return {
      page1Items: docItems.slice(0, firstCount),
      middlePages,
      lastPageItems: remaining,
      totalPages: 2 + middlePages.length,
      showFooterOnPage1: false,
    };
  }, [count, docItems]);

  const { page1Items, middlePages, lastPageItems, totalPages, showFooterOnPage1 } = pagination;

  const poLabel = variant === "QUOTATION" ? txt(purchaseOrderLabel) || "VALID UNTIL:" : "PO. No :";

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
            <div className="v">{customerPhones(customer)}</div>
          </div>

          <div className="rpdoc-kv">
            <div className="k">BRN:</div>
            <div className="v rpdoc-nowrap">{txt(customer?.brn)}</div>
          </div>

          <div className="rpdoc-kv">
            <div className="k">VAT NO:</div>
            <div className="v rpdoc-nowrap">{txt(customer?.vat_no)}</div>
          </div>
        </div>
      </div>

      <div className="rpdoc-box rpdoc-box--invoiceMeta">
        <div className="rpdoc-boxHead">
          BRN: {txt(company?.brn) || "-"}
          <span className="rpdoc-dot">•</span>
          VAT NO: {txt(company?.vat_no) || "-"}
        </div>

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
            <div className="k">{poLabel}</div>
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

  const Page1 = (
    <section className="rpdoc-page">
      <div className="rpdoc-pageNumber">Page 1 / {totalPages}</div>

      <div className="rpdoc-frame">
        {HeaderBlock}
        {BoxesBlock}

        <div className="rpdoc-tableWrap">
          <ItemsTable items={page1Items} minRows={showFooterOnPage1 ? SINGLE_PAGE_ROWS : FIRST_PAGE_ROWS} />
        </div>

        {showFooterOnPage1 ? (
          <FooterArea totals={totals} preparedBy={txt(preparedBy)} deliveredBy={txt(deliveredBy)} />
        ) : null}
      </div>
    </section>
  );

  const MiddlePages = middlePages.map((chunkItems, i) => {
    const pageNo = i + 2;

    return (
      <section className="rpdoc-page" key={`p-mid-${pageNo}`}>
        <div className="rpdoc-pageNumber">
          Page {pageNo} / {totalPages}
        </div>

        <div className="rpdoc-frame">
          <div className="rpdoc-tableWrap">
            <ItemsTable items={chunkItems} minRows={MIDDLE_PAGE_ROWS} />
          </div>
        </div>
      </section>
    );
  });

  const LastPage =
    !showFooterOnPage1 && count <= FIRST_PAGE_ROWS ? (
      <section className="rpdoc-page" key="p-last-footer-only">
        <div className="rpdoc-pageNumber">
          Page 2 / 2
        </div>

        <div className="rpdoc-frame">
          <FooterArea totals={totals} preparedBy={txt(preparedBy)} deliveredBy={txt(deliveredBy)} />
        </div>
      </section>
    ) : !showFooterOnPage1 ? (
      <section className="rpdoc-page" key="p-last">
        <div className="rpdoc-pageNumber">
          Page {totalPages} / {totalPages}
        </div>

        <div className="rpdoc-frame">
          <div className="rpdoc-tableWrap">
            <ItemsTable items={lastPageItems} minRows={LAST_PAGE_ROWS} />
          </div>

          <FooterArea totals={totals} preparedBy={txt(preparedBy)} deliveredBy={txt(deliveredBy)} />
        </div>
      </section>
    ) : null;

  return (
    <div className="rpdoc-pages" id="rpdoc-root">
      {Page1}
      {MiddlePages}
      {LastPage}
    </div>
  );
}