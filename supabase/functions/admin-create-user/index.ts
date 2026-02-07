import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Missing auth" }), { status: 401 });
    }

    const body = await req.json();

    const {
      email,
      password,
      full_name,
      role,
      is_active,
      permissions,
    } = body;

    if (!email || !role) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* =========================
       Create auth user
    ========================= */
    const tempPassword =
      password || crypto.randomUUID().slice(0, 10) + "A!";

    const { data: userRes, error: userErr } =
      await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (userErr || !userRes?.user) {
      throw userErr || new Error("User creation failed");
    }

    const userId = userRes.user.id;

    /* =========================
       Insert into rp_users
    ========================= */
    const { error: rpErr } = await supabase.from("rp_users").insert({
      user_id: userId,
      username: email,
      name: full_name,
      role,
      is_active,
      permissions,
    });

    if (rpErr) throw rpErr;

    /* =========================
       Update profiles table
    ========================= */
    await supabase.from("profiles").update({
      role,
      full_name,
    }).eq("id", userId);

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        temp_password: password ? null : tempPassword,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
