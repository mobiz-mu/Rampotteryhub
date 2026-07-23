// src/components/print/PublicPreviewChrome.tsx
//
// Chrome for public/token document links (customer-facing invoice, quotation,
// credit note previews shared via WhatsApp/copy-link). These pages already
// render outside the app's AppLayout (no sidebar/header — see App.tsx), so
// this is purely: a compact `no-print` action bar limited to Save PDF /
// Print / an optional safe Close, and a clean "link unavailable" state. No
// button here ever navigates into an internal system route.
import { Button } from "@/components/ui/button";
import { FileWarning } from "lucide-react";

export function PublicPreviewToolbar({
  docLabel,
  onSavePdf,
  onPrint,
  onClose,
}: {
  docLabel: string;
  onSavePdf?: () => void;
  onPrint: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card/90 px-4 py-3 shadow-sm backdrop-blur">
      <div className="text-sm text-muted-foreground">{docLabel}</div>
      <div className="flex flex-wrap gap-2">
        {onClose ? (
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Close
          </Button>
        ) : null}
        {onSavePdf ? (
          <Button variant="outline" className="rounded-xl" onClick={onSavePdf}>
            Save PDF
          </Button>
        ) : null}
        <Button className="rounded-xl" onClick={onPrint}>
          Print
        </Button>
      </div>
    </div>
  );
}

export function PublicLinkError({ message }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <FileWarning className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold text-foreground">Document link expired or unavailable</div>
        <div className="mt-2 text-sm text-muted-foreground">
          {message || "This link may have been revoked, expired, or the document could not be found. Please contact us for a new link."}
        </div>
      </div>
    </div>
  );
}
