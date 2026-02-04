// src/components/layout/AppHeader.tsx
import { Bell, Search, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

export function AppHeader() {
  const [isDark, setIsDark] = useState<boolean>(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });

    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setIsDark((v) => !v);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A0B0B]" />
        <Input
          placeholder="Search invoices, customers, stock..."
          className={`
            pl-10 bg-muted/40
            border border-[#6E0A0A]/70
            focus-visible:ring-0 focus-visible:outline-none
            shadow-[0_0_0_1px_rgba(110,10,10,0.25)]
            rp-search
          `}
        />
        {/* subtle animated red glow ring */}
        <span className="pointer-events-none absolute inset-0 rounded-md rp-searchGlow" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Live indicator */}
        <div className="flex items-center gap-2 mr-1 select-none">
          <span className="relative live-dot h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.65)]" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tracking-wide">
            Live
          </span>
        </div>

        {/* Dark mode */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-muted-foreground hover:text-foreground"
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>
      </div>

      <style>{`
        /* ---------- Live pulse ---------- */
        @keyframes livePulse {
          0% { transform: scale(1); opacity: .9; }
          50% { transform: scale(1.35); opacity: .35; }
          100% { transform: scale(1); opacity: .9; }
        }
        .live-dot::after{
          content:"";
          position:absolute;
          inset:-6px;
          border-radius:9999px;
          background: rgba(34, 197, 94, 0.35);
          animation: livePulse 2s ease-in-out infinite;
        }

        /* ---------- Premium dark-red animated search ---------- */
        .rp-search{
          border-radius: 12px;
          transition: box-shadow .25s ease, border-color .25s ease, background .25s ease;
        }

        .rp-search:focus{
          border-color: rgba(140, 18, 18, .95);
          box-shadow:
            0 0 0 1px rgba(140, 18, 18, .35),
            0 10px 26px rgba(0,0,0,.10);
          background: rgba(255,255,255,.02);
        }

        @keyframes rpRedBreath {
          0%   { opacity: .18; filter: blur(10px); }
          50%  { opacity: .35; filter: blur(12px); }
          100% { opacity: .18; filter: blur(10px); }
        }

        .rp-searchGlow{
          border-radius: 12px;
          box-shadow: 0 0 0 2px rgba(110,10,10,0.20);
          animation: rpRedBreath 2.6s ease-in-out infinite;
          opacity: .22;
          mix-blend-mode: multiply;
        }

        /* glow only when hovering or focusing inside */
        .rp-searchGlow{ opacity: 0; }
        .rp-search:focus + .rp-searchGlow,
        .rp-search:hover + .rp-searchGlow{
          opacity: 1;
        }

        /* Dark mode tuning */
        :root.dark .rp-search{
          background: rgba(255,255,255,.04);
          border-color: rgba(170, 28, 28, .55);
          box-shadow: 0 0 0 1px rgba(170, 28, 28, .20);
        }
        :root.dark .rp-search:focus{
          border-color: rgba(255, 90, 90, .55);
          box-shadow: 0 0 0 1px rgba(255, 90, 90, .22), 0 14px 34px rgba(0,0,0,.32);
        }
        :root.dark .rp-searchGlow{
          box-shadow: 0 0 0 2px rgba(255, 90, 90, .14);
          mix-blend-mode: screen;
        }
      `}</style>
    </header>
  );
}

