"use strict";

// Shared customer/device registry logic.
// Imported by worker.js (Cloudflare Workers) and by tests/*.mjs (Node).
// No runtime imports here: only Web-standard APIs (crypto.subtle / getRandomValues)
// so the exact same code runs in both environments.

export const HEARTBEAT_STATUSES = ["activated", "trial", "suspended_trial"];
export const ALL_STATUSES = ["activated", "trial", "suspended_trial", "suspended"];

export const HEARTBEAT_PATH = "/api/v1/devices/heartbeat";
export const ADMIN_CUSTOMERS_PATH = "/api/v1/admin/customers";

const HASH_RE = /^[A-Za-z0-9_-]{16,128}$/;
const APP_VERSION_RE = /^[A-Za-z0-9._+\-]{1,32}$/;
export const SCHOOL_NAME_MAX = 120;

export const ADMIN_EDIT_LIMITS = {
  school_name: 120,
  phone: 40,
  email: 160,
  address: 500,
  notes: 2000,
};

// Rate limits: [maxRequests, windowMs]. Best-effort per-isolate sliding window
// (see worker.js). Production should ALSO enable Cloudflare Rate Limiting Rules.
export const HEARTBEAT_RATE_LIMIT = [30, 10 * 60 * 1000];
export const ADMIN_RATE_LIMIT = [120, 60 * 1000];

export function normalizeSchoolName(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return { error: "bad_school_name" };
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "") return null;
  if (trimmed.length > SCHOOL_NAME_MAX) return { error: "bad_school_name" };
  return trimmed;
}

export function validateMachineHashes(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    return { error: "bad_machine_hashes" };
  }
  for (const h of value) {
    if (typeof h !== "string" || !HASH_RE.test(h)) {
      return { error: "bad_machine_hashes" };
    }
  }
  if (new Set(value).size !== 3) return { error: "bad_machine_hashes" };
  return { hashes: [value[0], value[1], value[2]] };
}

// Validates the exact desktop contract. Unknown/extra fields (phone, email, …)
// are ignored here AND never written by the heartbeat store path.
export function validateHeartbeat(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "bad_json", status: 400 };
  }
  const name = normalizeSchoolName(body.schoolName ?? null);
  if (name && name.error) return { error: name.error, status: 422 };

  const hashes = validateMachineHashes(body.machineHashBundle);
  if (hashes.error) return { error: hashes.error, status: 422 };

  if (!HEARTBEAT_STATUSES.includes(body.status)) {
    return { error: "bad_status", status: 422 };
  }
  const appVersion =
    typeof body.appVersion === "string" ? body.appVersion.trim() : "";
  if (!APP_VERSION_RE.test(appVersion)) {
    return { error: "bad_app_version", status: 422 };
  }
  return {
    schoolName: name,
    hashes: hashes.hashes,
    status: body.status,
    appVersion,
  };
}

// Deterministic device key: SHA-256 hex of sorted(bundle).join("|").
export async function deviceKeyFor(hashes) {
  const canonical = [...hashes].sort().join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return (
    prefix + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

// How many of the incoming hashes appear in the stored triple (0..3).
export function hashOverlap(incoming, stored) {
  const set = new Set(stored);
  let n = 0;
  for (const h of incoming) if (set.has(h)) n++;
  return n;
}

export function pickBestTwoOfThreeMatch(incoming, candidates) {
  // candidates: rows with machine_h1/h2/h3. Returns the row with the highest
  // overlap >= 2, or null. Ties (should be rare) resolve to most recently seen.
  let best = null;
  let bestOverlap = 1;
  for (const row of candidates) {
    const overlap = hashOverlap(incoming, [
      row.machine_h1,
      row.machine_h2,
      row.machine_h3,
    ]);
    if (
      overlap > bestOverlap ||
      (overlap === 2 &&
        bestOverlap === 2 &&
        (row.last_seen_at ?? 0) > (best?.last_seen_at ?? 0))
    ) {
      best = row;
      bestOverlap = overlap;
    }
  }
  return bestOverlap >= 2 ? best : null;
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

// Minimal sliding-window limiter backed by a caller-owned Map.
// Returns null when allowed, or retryAfterMs when limited.
export function checkRateLimit(store, key, limit, windowMs, now) {
  let hits = store.get(key);
  if (!hits) {
    hits = [];
    store.set(key, hits);
  }
  while (hits.length > 0 && hits[0] <= now - windowMs) hits.shift();
  if (hits.length >= limit) return hits[0] + windowMs - now;
  hits.push(now);
  if (store.size > 5000) {
    const oldest = [...store.keys()].slice(0, 1000);
    for (const k of oldest) store.delete(k);
  }
  return null;
}

export function validateAdminPatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "bad_json" };
  }
  const allowed = Object.keys(ADMIN_EDIT_LIMITS);
  const patch = {};
  let hasField = false;
  for (const field of allowed) {
    if (!(field in body)) continue;
    hasField = true;
    const value = body[field];
    if (value === null) {
      patch[field] = null;
      continue;
    }
    if (typeof value !== "string") return { error: "bad_customer_field" };
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (trimmed === "") {
      patch[field] = null;
      continue;
    }
    if (trimmed.length > ADMIN_EDIT_LIMITS[field]) {
      return { error: "bad_customer_field" };
    }
    patch[field] = trimmed;
  }
  if (!hasField) return { error: "bad_customer_field" };
  if (patch.email !== undefined && patch.email !== null && !patch.email.includes("@")) {
    return { error: "bad_customer_field" };
  }
  return { patch };
}
