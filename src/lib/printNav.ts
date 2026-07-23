// src/lib/printNav.ts
//
// Shared helpers for print pages: building the Dot Matrix toggle URL and a
// reliable Back button that doesn't depend on `window.history.length`
// (which counts unrelated browser-tab history and is unreliable when a print
// page is opened via a direct URL, a new tab, or a page refresh).
import { useNavigate, useLocation } from "react-router-dom";

/** Builds the URL for the Dot Matrix variant of a print page (adds/keeps ?format=dot-matrix). */
export function dotMatrixUrl(baseHref: string): string {
  const [path, query = ""] = baseHref.split("?");
  const params = new URLSearchParams(query);
  params.set("format", "dot-matrix");
  return `${path}?${params.toString()}`;
}

/** Builds the URL for the PDF/A4 variant of a print page (removes ?format=dot-matrix if present). */
export function pdfUrl(baseHref: string): string {
  const [path, query = ""] = baseHref.split("?");
  const params = new URLSearchParams(query);
  params.delete("format");
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Reliable "Back" navigation for print pages.
 *
 * React Router sets `location.key` to `"default"` when the current entry is
 * the first one in the tab's in-app history (direct URL open, new tab, or a
 * refresh that reset navigation state). In that case `navigate(-1)` would
 * either no-op or leave the SPA, so we fall back to a known-good list route
 * instead.
 *
 * In public/token mode (`isPublicMode: true`) this NEVER navigates to an
 * internal app route — a customer opening a shared invoice/quotation/credit-
 * note link must not be able to land on `/invoices`, `/credit-notes`, etc.
 * It only closes the tab/window when it was opened as a popup
 * (`window.opener` present); otherwise there is no safe destination and the
 * caller should hide the Back/Close button entirely (check `canGoBack`).
 */
export function usePrintBackNav(fallbackPath: string, isPublicMode?: boolean) {
  const navigate = useNavigate();
  const location = useLocation();

  const canClosePublic = isPublicMode ? typeof window !== "undefined" && !!window.opener : true;

  function goBack() {
    if (isPublicMode) {
      if (typeof window !== "undefined" && window.opener) window.close();
      return;
    }
    if (location.key && location.key !== "default") {
      navigate(-1);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  }

  goBack.canGoBack = canClosePublic;
  return goBack;
}
