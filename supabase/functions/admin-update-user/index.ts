import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();
    const {
      user_id,
      full_name,
      role,
      is_active,
      permissions,
      reset_password,
    } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing user_id" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (reset_password) {
      await supabase.auth.admin.updateUserById(user_id, {
        password: reset_password,
      });
    }

    await supabase.from("rp_users").update({
      role,
      is_active,
      permissions,
      name: full_name,
    }).eq("user_id", user_id);

    await supabase.from("profiles").update({
      role,
      full_name,
    }).eq("id", user_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
});
