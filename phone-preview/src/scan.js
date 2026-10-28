// Desktop-connection QR payload + resolver client.
// Pure logic: no DOM, no camera, no storage. The camera screen in app.js
// calls parseConnectionPayload() on every decoded frame and
// resolveInstallation() once per accepted scan.
//
// Payload (built desktop-side by phone-service.js buildConnectionPayload):
//   https://school-manager-website.ywkuoamb.workers.dev/#sm-phone-v1=<base64url>
// where the JSON is { protocol:"sm-phone", version:1, machineHashBundle:[h,h,h] }.
// The QR identifies the installation only; it authorizes nothing. The
// resolver returns dataset metadata only — never bytes or download URLs.

export const SITE_ORIGIN = "https://school-manager-website.ywkuoamb.workers.dev";
export const CONNECTION_PROTOCOL = "sm-phone";
export const CONNECTION_VERSION = 1;
export const CONNECTION_PREFIX = `${SITE_ORIGIN}/#sm-phone-v1=`;
export const PHONE_RESOLVE_PATH = "/api/v1/phone/resolve";

const HASH_RE = /^[A-Za-z0-9_-]{16,128}$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function base64UrlDecode(text) {
  const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Parse + validate scanned text. Returns { hashes:[h1,h2,h3] }. */
export function parseConnectionPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) fail("invalid-qr", "empty");
  if (!raw.startsWith(CONNECTION_PREFIX)) fail("foreign-qr", "not a desktop connection code");
  const encoded = raw.slice(CONNECTION_PREFIX.length);
  if (!encoded) fail("invalid-qr", "empty payload");
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    fail("invalid-qr", "unreadable payload");
  }
  if (!payload || payload.protocol !== CONNECTION_PROTOCOL) fail("foreign-qr", "unknown protocol");
  if (payload.version !== CONNECTION_VERSION) {
    fail("unsupported-version", `version ${String(payload.version).slice(0, 20)}`);
  }
  const bundle = payload.machineHashBundle;
  if (!Array.isArray(bundle) || bundle.length !== 3) fail("invalid-qr", "hash bundle");
  const hashes = bundle.map(String);
  if (new Set(hashes).size !== 3 || hashes.some((h) => !HASH_RE.test(h))) {
    fail("invalid-qr", "hash values");
  }
  return { hashes };
}

/**
 * Identify the installation behind a scanned bundle. Returns the server's
 * resolve response verbatim on success:
 * { ok, registered, backupAvailable, datasetId?, publishedAt?,
 *   archiveSha256?, archiveSize?, databaseSha256?, schoolName? }.
 * Throws { code } from the server (`unknown_installation`, `customer_locked`, …)
 * or `resolve-unreachable` when the Worker cannot be reached.
 */
export async function resolveInstallation({ baseUrl = SITE_ORIGIN, hashes, fetchImpl = null } = {}) {
  if (!Array.isArray(hashes) || hashes.length !== 3) fail("invalid-qr", "hash bundle");
  const endpoint = String(baseUrl || "").replace(/\/+$/, "") + PHONE_RESOLVE_PATH;
  let response;
  try {
    const runFetch = fetchImpl || fetch;
    response = await runFetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ machineHashBundle: hashes })
    });
  } catch {
    fail("resolve-unreachable", "worker unreachable");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    fail("resolve-unreachable", "unreadable response");
  }
  if (!response.ok || !data || data.ok !== true) {
    const code = data && typeof data.code === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(data.code)
      ? data.code
      : "resolve-failed";
    fail(code);
  }
  if (data.registered !== true) fail("resolve-failed", "not registered");
  return data;
}
