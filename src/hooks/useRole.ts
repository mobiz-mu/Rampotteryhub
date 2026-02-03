// src/hooks/useRole.ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useRole() {
  const [role, setRole] = useState<"sales" | "admin" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (alive) {
          setRole(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (alive) {
        setRole((data?.role as any) || "sales");
        setLoading(false);
      }
      if (error) console.warn("role load error:", error.message);
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  return { role, loading, isAdmin: role === "admin" };
}
