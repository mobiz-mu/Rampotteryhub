import React from "react";
import { waLink } from "@/lib/whatsapp";
import { useLocation } from "react-router-dom";

const WA_SUPPORT_PHONE = "2307788884";

export default function WhatsAppFab() {
  const loc = useLocation();

  // Default message (support/help)
  const msg = `Hi Ram Pottery Hub 👋\n\nI need help with: ${loc.pathname}`;
  const href = waLink(WA_SUPPORT_PHONE, msg);

  return (
    <button
      type="button"
      aria-label="WhatsApp"
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
      className="
        fixed bottom-5 right-5 z-[9999]
        h-12 w-12 rounded-full
        shadow-lg hover:shadow-xl
        transition-transform active:scale-95
        overflow-hidden
      "
      style={{ background: "transparent" }}
    >
      <img
        src="/whatsapp.png"
        alt="WhatsApp"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </button>
  );
}

