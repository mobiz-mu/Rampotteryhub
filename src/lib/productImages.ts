const BUCKET = "product-images";

export async function uploadProductImage(productId: number, file: File) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `products/${productId}/${crypto.randomUUID?.() || Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (upErr) throw new Error(upErr.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const url = data?.publicUrl;
  if (!url) throw new Error("Could not generate public URL");

  return url; // ✅ return STRING ONLY
}
