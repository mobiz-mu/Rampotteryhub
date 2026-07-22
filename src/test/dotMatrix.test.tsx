import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DotMatrixDocument from "@/components/print/DotMatrixDocument";

// jsdom has no window.print — stub it so auto-print doesn't throw.
beforeEach(() => {
  cleanup();
  window.print = vi.fn();
});

const sample = {
  docType: "INVOICE",
  docNo: "INV-2026-0001",
  date: "30/06/2026",
  po: "PO-77",
  salesRep: "Ramesh",
  salesRepCell: "+230 5777 0000",
  customer: {
    name: "Acme Traders Ltd",
    address: "12 Royal Road, Port Louis",
    cell: "+230 5888 1111",
    brn: "C99887766",
    vat_no: "VAT123456",
  },
  items: [
    {
      sn: 1,
      item_code: "POT-001",
      description: "Clay Diya Large",
      uom: "BOX",
      box_qty: 5,
      units_per_box: 12,
      total_qty: 60,
      unit_price_excl_vat: 10,
      unit_vat: 1.5,
      unit_price_incl_vat: 11.5,
      line_total: 690,
    } as any,
  ],
  totals: {
    subtotal: 600,
    vat: 90,
    total: 690,
    previousBalance: 0,
    grossTotal: 690,
    amountPaid: 200,
    balanceRemaining: 490,
  },
};

describe("DotMatrixDocument (data-only overlay)", () => {
  it("renders the variable values (not a blank page)", () => {
    render(<DotMatrixDocument data={sample} autoPrint={false} />);

    // Document + customer values present
    expect(screen.getByText("INV-2026-0001")).toBeTruthy();
    expect(screen.getAllByText("Acme Traders Ltd").length).toBeGreaterThan(0);
    expect(screen.getByText("C99887766")).toBeTruthy();

    // Item + totals values present
    expect(screen.getByText("POT-001")).toBeTruthy();
    expect(screen.getByText("Clay Diya Large")).toBeTruthy();
    expect(screen.getAllByText("690.00").length).toBeGreaterThan(0); // total / gross / line
    expect(screen.queryByText("490.00")).toBeNull(); // balance remaining intentionally blank in Dot Matrix

    // The print root exists so the print-CSS visibility override applies.
    expect(document.querySelector(".dm-print-root")).toBeTruthy();
    expect(document.querySelector(".dot-matrix-page")).toBeTruthy();

    // Document title is the dedicated centered element (not a top-left field).
    const title = document.querySelector(".dm-document-title");
    expect(title).toBeTruthy();
    expect(title?.textContent).toBe("INVOICE");
  });

  it("does NOT print automatically when there is no data", () => {
    const printSpy = window.print as unknown as ReturnType<typeof vi.fn>;
    render(<DotMatrixDocument data={{ items: [] }} autoPrint={true} />);
    expect(screen.getByText(/No document data to print/i)).toBeTruthy();
    expect(printSpy).not.toHaveBeenCalled();
  });
});


