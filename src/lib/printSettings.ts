// src/lib/printSettings.ts
//
// Persisted calibration settings for dot-matrix / continuous printing.
// Dot-matrix printers frequently need small alignment nudges, so these values
// are user-adjustable from the print screen toolbar and stored in
// localStorage (no backend / migration required).

export type DotMatrixMode = "data" | "full";

export type DotMatrixSettings = {
  /** "data" = overlay values onto pre-printed stationery (DEFAULT).
   *  "full" = also draw labels/frame for printing on blank paper. */
  mode: DotMatrixMode;

  /** Global nudges applied to every field, in points (1in = 72pt). */
  offsetX: number;
  offsetY: number;

  /** Typography for the printed values. */
  fontSize: number; // pt
  lineHeight: number; // pt

  /** Paper size in inches (continuous stationery default 9.18 x 12.61). */
  paperWidthIn: number;
  paperHeightIn: number;

  /** Item table flow. */
  firstRowTop: number; // pt — top of the first item row
  rowHeight: number; // pt — vertical step between rows
  rowsPerPage: number;

  /** Full-template only. */
  showLogo: boolean;

  /** Show a light alignment grid on screen (never printed). */
  showGuides: boolean;

  /** Print a small "Page x/y" marker (default off to avoid clashing). */
  showPageNumbers: boolean;
};

export const DEFAULT_DOT_MATRIX_SETTINGS: DotMatrixSettings = {
  mode: "data",
  offsetX: 0,
  offsetY: 0,
  fontSize: 9,
  lineHeight: 10,
  paperWidthIn: 9.18,
  paperHeightIn: 12.61,
  firstRowTop: 392,
  rowHeight: 18,
  rowsPerPage: 12,
  showLogo: false,
  showGuides: false,
  showPageNumbers: false,
};

const STORAGE_KEY = "rp_dotmatrix_settings_v1";

export function loadDotMatrixSettings(): DotMatrixSettings {
  if (typeof window === "undefined") return { ...DEFAULT_DOT_MATRIX_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DOT_MATRIX_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DOT_MATRIX_SETTINGS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_DOT_MATRIX_SETTINGS };
  }
}

export function saveDotMatrixSettings(s: DotMatrixSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / private mode errors */
  }
}

export function resetDotMatrixSettings(): DotMatrixSettings {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return { ...DEFAULT_DOT_MATRIX_SETTINGS };
}
