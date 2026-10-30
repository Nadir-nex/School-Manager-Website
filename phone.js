"use strict";

// Phone installation resolver (identify-only).
// Imported by worker.js (Cloudflare Workers) and by tests/*.mjs (Node).
// Web-standard APIs only: no Node imports, no npm dependencies.
//
// A phone that scanned the desktop's permanent connection QR proves
// possession of that machine's three hashed components and asks: which
// registered installation is this, and does it have a published backup?
//
// This endpoint IDENTIFIES. It never authorizes downloads: the response
// carries dataset metadata only — no R2 object key, no download URL, no
// token, no school data. A later phase adds authenticated downloads on
// top of this same identity mapping without changing the QR format.
//
// Security properties (deliberate):
// - Machine hashes are stable installation identifiers, not passwords.
//   The QR may be photographed or shared; possession proves nothing
//   beyond "this installer was registered".
// - Unknown installations resolve to unknown_installation and create
//   NOTHING (unlike heartbeat/grant, which register devices).
// - School names are never used as identity (see findOrCreateDevice's
//   same-name fallback in worker.js, which this path must not repeat).
// - Locked customers fail closed (customer_locked), same as grants.

export const PHONE_RESOLVE_PATH = "/api/v1/phone/resolve";

// Same budget as heartbeats: identification traffic, not uploads.
export const PHONE_RESOLVE_RATE_LIMIT = [30, 10 * 60 * 1000];

const HASH_RE = /^[A-Za-z0-9_-]{16,128}$/;

function err(error, status = 422) {
  return { error, status };
}

export function validateResolveRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("bad_json", 400);
  }
  const bundle = body.machineHashBundle;
  if (!Array.isArray(bundle) || bundle.length !== 3) {
    return err("bad_machine_hashes");
  }
  for (const h of bundle) {
    if (typeof h !== "string" || !HASH_RE.test(h)) {
      return err("bad_machine_hashes");
    }
  }
  if (new Set(bundle).size !== 3) return err("bad_machine_hashes");
  return { hashes: [bundle[0], bundle[1], bundle[2]] };
}
