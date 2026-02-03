import React, { useMemo } from "react";

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
};

type Totals = {
  subtotal?: number | null;
  vatPercentLabel?: string;
  vat_amount?: number | null;
  total_amount?: number | null;

  // invoice-only fields (ignored for quotation)
  previous_balance?: number | null;
  amount_paid?: number | null;
  balance_remaining?: number | null;

  discount_percent?: number | null;
  discount_amount?: number | null;
};

export type RamPotteryDocItem = {
  sn: number;
  item_code?: string;
  uom?: string; // BOX / PCS
  box_qty?: number;
  units_per_box?: number;
  total_qty?: number;
  description?: string;
  unit_price_excl_vat?: number;
  unit_vat?: number;
  unit_price_incl_vat?: number;
  line_total?: number;
};

export type RamPotteryDocProps = {
  variant: "INVOICE" | "CREDIT_NOTE" | "QUOTATION";

  docNoLabel: string;
  docNoValue: string;

  dateLabel: string;
  dateValue: string; // DD/MM/YYYY from InvoicePrint.tsx (or formatted string)

  purchaseOrderLabel?: string;
  purchaseOrderValue?: string;

  // QUOTATION only
  validUntilLabel?: string; // e.g. "VALID UNTIL:"
  validUntilValue?: string; // formatted date string

  salesRepName?: string;
  salesRepPhone?: string;

  customer: Party;
  company: DocCompany;

  items: RamPotteryDocItem[];
  totals: Totals;

  preparedBy?: string | null;
  deliveredBy?: string | null;

  logoSrc?: string; // default /logo.png
};

function n2(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/** ✅ Hide 0.00: show blank if 0/empty */
function fmtMoney(v: any) {
  const x = n2(v);
  if (Math.abs(x) < 0.000001) return "";
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function RamPotteryDoc(props: RamPotteryDocProps) {
  const {
    variant,
    docNoLabel,
    docNoValue,
    dateLabel,
    dateValue,
    purchaseOrderLabel,
    purchaseOrderValue,
    validUntilLabel,
    validUntilValue,
    salesRepName,
    salesRepPhone,
    customer,
    company,
    items,
    totals,
    preparedBy,
    deliveredBy,
    logoSrc,
  } = props;

  const docTitle =
    variant === "CREDIT_NOTE" ? "VAT CREDIT NOTE" : variant === "QUOTATION" ? "QUOTATION" : "VAT INVOICE";

  const showPO = Boolean(purchaseOrderLabel);
  const showValid = variant === "QUOTATION" && Boolean(validUntilLabel);

  const brn = company?.brn || "";
  const vat = company?.vat_no || "";

  // invoice-only money math
  const grossTotal = n2(totals?.total_amount) + n2(totals?.previous_balance);
  const computedBalance = Math.max(0, grossTotal - n2(totals?.amount_paid));
  const balanceRemaining =
    totals?.balance_remaining === null || totals?.balance_remaining === undefined
      ? computedBalance
      : n2(totals.balance_remaining);

  const logo = logoSrc || "/logo.png";

  const ROWS_PER_PAGE = 6;

  const pages = useMemo(() => {
    const list = (items || []).map((x, idx) => ({
      ...x,
      sn: Number.isFinite(Number(x.sn)) ? x.sn : idx + 1,
    }));

    const raw = list.length ? chunk(list, ROWS_PER_PAGE) : [[]];

    // pad each page to exactly 6 rows for fixed form height
    return raw.map((p) => {
      const padded = [...p];
      while (padded.length < ROWS_PER_PAGE) {
        padded.push({
          sn: -1,
          item_code: "",
          uom: "",
          units_per_box: 0,
          total_qty: 0,
          description: "",
          unit_price_excl_vat: 0,
          unit_vat: 0,
          unit_price_incl_vat: 0,
          line_total: 0,
        });
      }
      return padded;
    });
  }, [items]);

  const totalPages = pages.length;

  return (
    <>
      {pages.map((pageItems, pageIndex) => {
        const pageNo = pageIndex + 1;
        const isLast = pageNo === totalPages;

        return (
          <div className="rpdoc-page rpdoc-page--paged" key={`rpdoc-${pageNo}`}>
            {/* Page number bottom-right */}
            <div className="rpdoc-pageno">
              Page {pageNo} of {totalPages}
            </div>

            {/* HEADER */}
            <div className="rpdoc-headerTop">
              <div className="rpdoc-headerTop-left">
                <img className="rpdoc-logoTop" src={logo} alt="Ram Pottery Logo" />
              </div>

              <div className="rpdoc-headerTop-center">
                <h1 className="rpdoc-titleOneRow">RAM POTTERY LTD</h1>

                <div className="rpdoc-subTwoRows">
                  <div>MANUFACTURER &amp; IMPORTER OF QUALITY CLAY</div>
                  <div>PRODUCTS AND OTHER RELIGIOUS ITEMS</div>
                </div>

                <div className="rpdoc-addrTwoRows">
                  <div>Robert Kennedy Street, Reunion Maurel,</div>
                  <div>Petit Raffray - Mauritius</div>
                </div>

                <div className="rpdoc-phonesOneRow">
                  <span>Tel: +230 57788884 +230 58060268 +230 52522844</span>
                </div>

                <div className="rpdoc-mailWebOneRow">
                  <span>Email: info@rampottery.com</span>
                  <span className="rpdoc-gap" />
                  <span>Web: www.rampottery.com</span>
                </div>

                <div className="rpdoc-docOneRow">{docTitle}</div>
              </div>

              <div className="rpdoc-headerTop-right" />
            </div>

            {/* TOP BOXES */}
            <div className="rpdoc-topgrid">
              <div className="rpdoc-box">
                <div className="rpdoc-box-title">CUSTOMER DETAILS</div>
                <div className="rpdoc-box-body">
                  <div className="rpdoc-row">
                    <div className="k">Name:</div>
                    <div className="v">{customer?.name || ""}</div>
                  </div>
                  <div className="rpdoc-row">
                    <div className="k">ADDRESS:</div>
                    <div className="v">{customer?.address || ""}</div>
                  </div>
                  <div className="rpdoc-row">
                    <div className="k">Tel:</div>
                    <div className="v">{customer?.phone || ""}</div>
                  </div>

                  <div className="rpdoc-row-split">
                    <div className="rpdoc-pair">
                      <div className="k">BRN:</div>
                      <div className="v">{customer?.brn || ""}</div>
                    </div>
                    <div className="rpdoc-pair">
                      <div className="k">VAT No:</div>
                      <div className="v">{customer?.vat_no || ""}</div>
                    </div>
                  </div>

                  <div className="rpdoc-row">
                    <div className="k">CUSTOMER CODE:</div>
                    <div className="v">{customer?.customer_code || ""}</div>
                  </div>
                </div>
              </div>

              <div className="rpdoc-box">
                {/* ✅ VAT in one line */}
                <div className="rpdoc-box-title rpdoc-nowrap">
                  BRN: {brn} | VAT: {vat}
                </div>

                <div className="rpdoc-box-body">
                  <div className="rpdoc-row">
                    <div className="k">{docNoLabel}</div>
                    <div className="v">{docNoValue}</div>
                  </div>
                  <div className="rpdoc-row">
                    <div className="k">{dateLabel}</div>
                    <div className="v">{dateValue}</div>
                  </div>

                  {showValid ? (
                    <div className="rpdoc-row">
                      <div className="k">{validUntilLabel}</div>
                      <div className="v">{validUntilValue || ""}</div>
                    </div>
                  ) : null}

                  {showPO ? (
                    <div className="rpdoc-row">
                      <div className="k">{purchaseOrderLabel}</div>
                      <div className="v">{purchaseOrderValue || ""}</div>
                    </div>
                  ) : null}

                  <div className="rpdoc-row">
                    <div className="k">SALES REP:</div>
                    <div className="v">
                      {salesRepName || ""}
                      {salesRepPhone ? (
                        <>
                          <span className="rpdoc-gap" />
                          <span className="rpdoc-red">Tel: {salesRepPhone}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ITEMS TABLE */}
            <table className="rpdoc-table2">
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "29%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>

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
                {pageItems.map((it, i) => {
                  const isBlank = it.sn === -1;
                  const uom = (it.uom || "").toUpperCase();
                  const upb = n2(it.units_per_box);
                  const totalQty = n2(it.total_qty);

                  return (
                    <tr key={`${pageNo}-${i}`}>
                      <td className="c">{isBlank ? "\u00A0" : it.sn}</td>
                      <td className="c">{isBlank ? "\u00A0" : it.item_code || ""}</td>
                      <td className="c">{isBlank ? "\u00A0" : uom}</td>
                      <td className="c">{isBlank ? "\u00A0" : upb ? String(upb) : ""}</td>
                      <td className="c">{isBlank ? "\u00A0" : totalQty ? String(totalQty) : ""}</td>
                      <td className="l desc">{isBlank ? "\u00A0" : it.description || ""}</td>
                      <td className="r">{isBlank ? "\u00A0" : fmtMoney(it.unit_price_excl_vat)}</td>
                      <td className="r">{isBlank ? "\u00A0" : fmtMoney(it.unit_vat)}</td>
                      <td className="r">{isBlank ? "\u00A0" : fmtMoney(it.unit_price_incl_vat)}</td>
                      <td className="r">{isBlank ? "\u00A0" : fmtMoney(it.line_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* LAST PAGE ONLY: NOTES + TOTALS + SIGNATURES */}
            {isLast ? (
              <>
                <div className="rpdoc-bottomgrid">
                  <div className="rpdoc-notes">
                    <div className="rpdoc-notes-title">{variant === "QUOTATION" ? "Terms:" : "Note:"}</div>

                    <ul>
                      {variant === "QUOTATION" ? (
                        <>
                          <li>This quotation is valid until the date mentioned above.</li>
                          <li>Prices may change after validity date or if quantities change.</li>
                          <li>Payment terms: as agreed with RAM POTTERY LTD.</li>
                          <li>Delivery: as agreed.</li>
                          <li>All cheques to be issued on RAM POTTERY LTD.</li>
                          <li>
                            Bank transfer to: <span className="rpdoc-accountRed">000 44 570 46 59</span> MCB Bank
                          </li>
                          <li>This document is not a tax invoice.</li>
                        </>
                      ) : (
                        <>
                          <li>Goods once sold cannot be returned or exchanged.</li>
                          <li>For any other manufacturing defects, must provide this invoice for a refund or exchange.</li>
                          <li>
                            Customer must verify that the quantity of goods conforms with their invoice; otherwise, we will
                            not be responsible after delivery
                          </li>
                          <li>
                            Interest of <span className="redStrong">1%</span> above the bank rate will be charged on sum due
                            if not settled within <span className="redStrong">30 days</span>.
                          </li>
                          <li>All cheques to be issued on RAM POTTERY LTD.</li>
                          <li>
                            Bank transfer to: <span className="rpdoc-accountRed">000 44 570 46 59</span> MCB Bank
                          </li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div className="rpdoc-totals">
                    <div className="trow">
                      <div className="rpdoc-nowrap">SUB TOTAL</div>
                      <div className="money">{fmtMoney(totals?.subtotal)}</div>
                    </div>

                    <div className="trow">
                      <div className="rpdoc-nowrap">{(totals?.vatPercentLabel || "VAT").toUpperCase()}</div>
                      <div className="money">{fmtMoney(totals?.vat_amount)}</div>
                    </div>

                    {(n2(totals?.discount_percent) > 0 || n2(totals?.discount_amount) > 0) && (
                      <>
                        <div className="trow">
                          <div className="rpdoc-nowrap">DISCOUNT %</div>
                          <div className="money">{fmtMoney(totals?.discount_percent)}</div>
                        </div>
                        <div className="trow">
                          <div className="rpdoc-nowrap">DISCOUNT AMOUNT</div>
                          <div className="money">{fmtMoney(totals?.discount_amount)}</div>
                        </div>
                      </>
                    )}

                    <div className="trow">
                      <div className="rpdoc-nowrap">TOTAL AMOUNT</div>
                      <div className="money">{fmtMoney(totals?.total_amount)}</div>
                    </div>

                    {/* invoice-only totals */}
                    {variant !== "QUOTATION" ? (
                      <>
                        <div className="trow">
                          <div className="rpdoc-nowrap">PREVIOUS BALANCE</div>
                          <div className="money">{fmtMoney(totals?.previous_balance)}</div>
                        </div>
                        <div className="trow">
                          <div className="rpdoc-nowrap">GROSS TOTAL</div>
                          <div className="money">{fmtMoney(grossTotal)}</div>
                        </div>
                        <div className="trow">
                          <div className="rpdoc-nowrap">AMOUNT PAID</div>
                          <div className="money">{fmtMoney(totals?.amount_paid)}</div>
                        </div>
                        <div className="trow">
                          <div className="rpdoc-nowrap">BALANCE REMAINING</div>
                          <div className="money">{fmtMoney(balanceRemaining)}</div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="rpdoc-sign">
                  <div className="signcol">
                    <div className="line" />
                    <div className="label">Signature</div>
                    <div className="meta">Prepared by: {preparedBy || ""}</div>
                  </div>

                  <div className="signcol">
                    <div className="line" />
                    <div className="label">Signature</div>
                    <div className="meta">
                      {variant === "QUOTATION" ? "Approved by: __________________" : `Delivered by: ${deliveredBy || ""}`}
                    </div>
                  </div>

                  <div className="signcol">
                    <div className="line" />
                    <div className="label">Customer Signature</div>
                    <div className="meta">
                      Customer Name: __________________
                      <br />
                      <i>Please verify before sign</i>
                    </div>
                  </div>
                </div>

                <div className="rpdoc-footerSpace" />
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}


