// src/lib/rpFetch.ts
export async function rpFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});

  // attach rp_user to every API call
  const raw = localStorage.getItem("rp_user");
  if (raw) headers.set("x-rp-user", raw);

  // JSON convenience
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  return fetch(input, { ...init, headers });
}

