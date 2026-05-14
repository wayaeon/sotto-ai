/**
 * Cloudflare Worker — Wispr Local license validation
 *
 * KV namespaces bound:
 *   LICENSE_KEYS   { [key: string]: "active" | "revoked" }
 *   ACTIVATIONS    { [key: string]: JSON.stringify({ activations: string[], maxActivations: number }) }
 *
 * Deploy:
 *   wrangler deploy
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handleValidate(request, env) {
  const body = await request.json();
  const key = (body.key || "").trim().toUpperCase();
  const machineId = (body.machine_id || "").trim();

  if (!key) return json({ valid: false, error: "Key is required" }, 400);

  const keyStatus = await env.LICENSE_KEYS.get(key);
  if (!keyStatus) return json({ valid: false, error: "Key not found" });
  if (keyStatus === "revoked") return json({ valid: false, error: "Key has been revoked" });

  // Check activation slots
  const activationRaw = await env.ACTIVATIONS.get(key);
  const activation = activationRaw
    ? JSON.parse(activationRaw)
    : { activations: [], maxActivations: 3 };

  if (machineId && !activation.activations.includes(machineId)) {
    if (activation.activations.length >= activation.maxActivations) {
      return json({ valid: false, error: `Maximum activations (${activation.maxActivations}) reached` });
    }
    activation.activations.push(machineId);
    await env.ACTIVATIONS.put(key, JSON.stringify(activation));
  }

  return json({ valid: true, activations: activation.activations.length });
}

async function handleActivate(request, env) {
  // Same as validate — idempotent
  return handleValidate(request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/validate") return handleValidate(request, env);
    if (url.pathname === "/activate") return handleActivate(request, env);

    return json({ error: "Not found" }, 404);
  },
};
