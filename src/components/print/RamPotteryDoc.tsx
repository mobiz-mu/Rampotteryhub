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
  vat_no?: string | null;
  addressLines?: string[] | null;
  phonesLine?: string | null;
  email?: string | null;
  website?: string | null;
  taglineTop?: string | null;
  taglineBottom?: string | null;
};

export type RamPotteryDocItem = {
  sn: number;
  item_code?: string;
  box?: string; // "BOX" / "PCS" / "KG"
  unit_per_box?: string | number;
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
  vat_amount?: number | null;
  total_amount?: number | null;
  previous_balance?: number | null;
  amount_paid?: number | null;
  balance_remaining?: number | null;
};

export type RamPotteryDocProps = {
  docTitle?: string;
  companyName?: string;

  logoSrc?: string; // default "/logo.png"

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

  /** disabled by default now */
  showFooterBar?: boolean;
  footerBarText?: string;
};

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any) {
  const n = n2(v);
  return n.toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function txt(v: any) {
  return String(v ?? "").trim();
}

export default function RamPotteryDoc(props: RamPotteryDocProps) {
  const {
    docTitle = "VAT INVOICE",
    companyName = "RAM POTTERY LTD",
    logoSrc = "/logo.png",

    customer,
    company,

    docNoLabel = "Invoice No:",
    docNoValue = "",

    dateLabel = "Date:",
    dateValue = "",

    purchaseOrderLabel = "Purchase Order No:",
    purchaseOrderValue = "",

    salesRepName = "",
    salesRepPhone = "",

    items,
    totals,

    preparedBy = "",
    deliveredBy = "",

    // ✅ default OFF (removes thank-you red bar)
    showFooterBar = false,
    footerBarText = "We thank you for your purchase and look forward to being of service to you again",
  } = props;

  const brn = txt(company?.brn);
  const vatNo = txt(company?.vat_no);

  const addressLines = company?.addressLines?.length
    ? company.addressLines
    : ["Robert Kennedy Street, Reunion Maurel,", "Petit Raffray - Mauritius"];

  const phonesLine = company?.phonesLine || "Tel: +230 57788884  +230 58060268  +230 52522844";
  const email = company?.email || "info@rampottery.com";
  const website = company?.website || "www.rampottery.com";

  const taglineTop = company?.taglineTop || "MANUFACTURER & IMPORTER OF QUALITY CLAY";
  const taglineBottom = company?.taglineBottom || "PRODUCTS AND OTHER RELIGIOUS ITEMS";

  const computedBalance = useMemo(() => {
    const gross = n2(totals?.total_amount) + n2(totals?.previous_balance);
    return Math.max(0, gross - n2(totals?.amount_paid));
  }, [totals?.total_amount, totals?.previous_balance, totals?.amount_paid]);

  const balanceRemaining =
    totals?.balance_remaining === null || totals?.balance_remaining === undefined
      ? computedBalance
      : n2(totals.balance_remaining);

  return (
    // ✅ A4 wrapper: centers + prevents overflow in print/pdf
    <div className="rpdoc-a4">
      <div className="rpdoc-shell">
        <div className="invoice-container">
          {/* HEADER (logo left, content centered) */}
          <div className="header">
            <div className="rpdoc-headerGrid">
              <div className="rpdoc-headerLeft">
                <img className="rpdoc-logoBig" src={logoSrc} alt="Ram Pottery Logo" />
              </div>

              <div className="rpdoc-headerCenter">
                <div className="company-name">{companyName}</div>

                <div className="company-details">
                  <div className="tagline">{taglineTop}</div>
                  <div className="tagline">{taglineBottom}</div>
                  <br />
                  {addressLines.map((l, idx) => (
                    <React.Fragment key={idx}>
                      {l}
                      <br />
                    </React.Fragment>
                  ))}
                  
                  {phonesLine}
                  
                  <div className="rpdoc-contact-line">
                  <span className="label-red">Email:</span> {email}
                  <span className="sep">•</span>
                  <span className="label-red">Web:</span> {website}
                </div>
               </div>
                <div className="vat-invoice">{docTitle}</div>
              </div>

              <div className="rpdoc-headerRight" />
            </div>
          </div>

          {/* CUSTOMER + INVOICE DETAILS */}
          <div className="row">
            <div className="box">
              <div className="box-title">CUSTOMER DETAILS</div>
              <div className="box-content rpdoc-boxContentTight">
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

                <div className="rpdoc-kv-row2">
                  <div className="rpdoc-kv">
                    <div className="k">BRN:</div>
                    <div className="v">{txt(customer?.brn)}</div>
                  </div>
                  <div className="rpdoc-kv">
                    <div className="k">VAT No:</div>
                    <div className="v">{txt(customer?.vat_no)}</div>
                  </div>
                </div>

                <div className="rpdoc-kv">
                  <div className="k">Customer Code:</div>
                  <div className="v">{txt(customer?.customer_code)}</div>
                </div>
              </div>
            </div>

            <div className="box">
              <div className="right-box-header">
                BRN: {brn || "-"} | VAT: {vatNo || "-"}
              </div>

              <div className="box-content rpdoc-boxContentTight">
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

                <div className="rpdoc-kv rpdoc-sales-row">
                 <div className="k">Sales Rep:</div>

                 <div className="v rpdoc-sales-flex">
                    <span className="rpdoc-sales-name">{txt(salesRepName)}</span>

                      {salesRepPhone && (
                    <span className="rpdoc-sales-phone">
                      Tel: {txt(salesRepPhone)}
                    </span>
                  )}
               </div>
              </div>
              </div>
            </div>
          </div>

          {/* TABLE */}
          <table className="invoice-table">
            <thead>
              <tr>
                <th>SN</th>
                <th>ITEM CODE</th>
                <th>BOX</th>
                <th>UNIT PER BOX</th>
                <th>TOTAL QTY</th>
                <th>DESCRIPTION</th>
                <th>
                  UNIT PRICE
                  <br />
                  (EXCL VAT)
                </th>
                <th>VAT</th>
                <th>
                  UNIT PRICE
                  <br />
                  (INCL VAT)
                </th>
                <th>
                  TOTAL AMOUNT
                  <br />
                  (INCL VAT)
                </th>
              </tr>
            </thead>

            <tbody>
              {(items || []).map((it, idx) => (
                <tr key={idx}>
                  <td>{it.sn}</td>
                  <td>{txt(it.item_code)}</td>
                  <td>{txt(it.box)}</td>
                  <td>{txt(it.unit_per_box)}</td>
                  <td>{txt(it.total_qty)}</td>
                  <td className="desc">{txt(it.description)}</td>
                  <td>{money(it.unit_price_excl_vat)}</td>
                  <td>{money(it.unit_vat)}</td>
                  <td>{money(it.unit_price_incl_vat)}</td>
                  <td>{money(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* NOTES + TOTALS */}
          <div className="notes-totals">
            <div className="notes">
              <div className="notes-title">Note:</div>

              <ul>
                <li>Goods once sold cannot be returned or exchanged.</li>
                <li>For any manufacturing defects, this invoice must be produced for refund or exchange.</li>
                <li>Customer must verify that quantity conforms with invoice; not responsible after delivery.</li>
                <li>Interest of 1% above bank rate will be charged if not settled within 30 days.</li>
                <li className="note-emphasis">All cheques to be issued on RAM POTTERY LTD.</li>
                <li className="note-emphasis">Bank transfer to 000 44 570 46 59 MCB Bank</li>
              </ul>
            </div>

            <div className="totals">
              <table>
                <tbody>
                  <tr>
                    <td>SUB TOTAL</td>
                    <td>{money(totals?.subtotal)}</td>
                  </tr>
                  <tr>
                    <td>{txt(totals?.vatLabel) || "VAT"}</td>
                    <td>{money(totals?.vat_amount)}</td>
                  </tr>
                  <tr>
                    <td>TOTAL AMOUNT</td>
                    <td>{money(totals?.total_amount)}</td>
                  </tr>
                  <tr>
                    <td>PREVIOUS BALANCE</td>
                    <td>{money(totals?.previous_balance)}</td>
                  </tr>
                  <tr>
                    <td>GROSS TOTAL</td>
                    <td>{money(n2(totals?.total_amount) + n2(totals?.previous_balance))}</td>
                  </tr>
                  <tr>
                    <td>AMOUNT PAID</td>
                    <td>{money(totals?.amount_paid)}</td>
                  </tr>
                  <tr>
                    <td>BALANCE REMAINING</td>
                    <td>{money(balanceRemaining)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SIGNATURES */}
          <div className="signatures">
            <div className="signature-box">
              <div className="signature-line"></div>
              <div>
                <b>Signature</b>
              </div>
              <div>Prepared by: {txt(preparedBy)}</div>
            </div>

            <div className="signature-box">
              <div className="signature-line"></div>
              <div>
                <b>Signature</b>
              </div>
              <div>Delivered by: {txt(deliveredBy)}</div>
            </div>

            <div className="signature-box">
              <div className="signature-line"></div>
              <div>
                <b>Customer Signature</b>
              </div>
              <div>Customer Name: __________</div>
              <div>Please verify before sign</div>
            </div>
          </div>

          {/* ✅ Footer bar removed (still supported if you want later) */}
          {showFooterBar ? <div className="footer-bar">{footerBarText}</div> : null}

          {/* Page footer placeholder (InvoicePrint adds counters via CSS) */}
          <div className="rp-page-footer" />
        </div>
      </div>
    </div>
  );
}

