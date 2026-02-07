// /api/qr/approve.ts
const { token } = req.body;

// 🔐 THIS MUST BE A LOGGED-IN SESSION ON PHONE
const {
  data: { user },
  error: authErr,
} = await sb.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));

if (authErr || !user) {
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

await sb
  .from("qr_logins")
  .update({
    status: "APPROVED",
    user_id: user.id,
    payload: { approvedAt: new Date().toISOString() },
  })
  .eq("token", token);
