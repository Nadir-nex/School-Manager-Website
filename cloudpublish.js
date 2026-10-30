"use strict";

// Shared Cloud Publish logic for the School Manager website.
// Imported by worker.js (Cloudflare Workers) and by tests/*.mjs (Node).
// Web-standard APIs only (crypto.subtle / getRandomValues / TextDecoder /
// atob): no Node imports, no npm dependencies, so the exact same code runs
// in both environments.
//
// Contract implemented (see school_app/cloud-publish.js + cloud-backup.js,
// inspected read-only; field names below match the desktop exactly):
//   POST /api/v1/cloudpublish/grant
//     <- { protocol, protocolVersion, app, appVersion, formatVersion,
//          schemaVersion, schoolName|null, machineHashBundle,
//          licenseState, requestCode, activationCode?,
//          databaseSha256, archiveSha256, archiveSize }
//     -> { ok:true, grantId, uploadUrl, objectKey, expiresAt }
//   PUT /api/v1/cloudpublish/upload?grantId=..&token=..  (exact ZIP bytes)
//     -> { ok:true, grantId, receivedBytes, archiveSha256 }
//   POST /api/v1/cloudpublish/finalize
//     <- { grantId, databaseSha256, archiveSha256, archiveSize }
//     -> { ok:true, datasetId, publishedAt }
//
// Server duties enforced here: SMLIC2 Ed25519 verification + 2-of-3 machine
// match for "licensed" grants, device-bound authorization for "trial"
// grants, single-use short-lived grants (<=15 min), server-generated
// customer-scoped R2 keys, checksum + manifest re-verification before any
// promotion, and retention of previous valid backups.
//
// License vocabulary note: the desktop license service reports
// "licensed" | "trial" | "expired" | "invalid" (school_app/
// license/license-service.js). The registry heartbeat uses a different
// vocabulary ("activated" | "trial" | "suspended_trial") via
// school_app/registry-client.js mapping. The grant endpoint accepts the
// DESKTOP vocabulary; rows written to customers/devices are mapped to the
// registry vocabulary (licensed -> activated).

export const GRANT_PATH = "/api/v1/cloudpublish/grant";
export const UPLOAD_PATH = "/api/v1/cloudpublish/upload";
export const FINALIZE_PATH = "/api/v1/cloudpublish/finalize";

export const PUBLISH_PROTOCOL = "school-manager-cloud-publish";
export const PUBLISH_PROTOCOL_VERSION = 1;
export const PUBLISH_APP = "School Manager";

// Must equal the desktop cloud-backup.js CLOUD_BACKUP_FORMAT(_VERSION).
export const CLOUD_BACKUP_FORMAT = "school-manager-cloud-backup";
export const CLOUD_BACKUP_FORMAT_VERSION = 1;
export const DATABASE_ENTRY_NAME = "database.sqlite";
export const MANIFEST_ENTRY_NAME = "backup-info.json";

// Must equal the desktop cloud-publish.js MAX_UPLOAD_BYTES.
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
// Mirror the desktop reader guards (cloud-backup.js).
export const MAX_ARCHIVE_ENTRIES = 8;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

// Grants live at most 15 minutes (desktop contract: single-use, <=15 min).
export const GRANT_TTL_MS = 15 * 60 * 1000;
// Minimal retention policy: keep the latest pointer + this many versioned
// objects per customer. Older versioned objects are deleted on promotion.
export const RETAIN_VERSIONED_BACKUPS = 5;

// Rate limits: [maxRequests, windowMs]. Best-effort per-isolate sliding
// window (see worker.js). Production should ALSO enable Cloudflare Rate
// Limiting Rules.
export const GRANT_RATE_LIMIT = [10, 10 * 60 * 1000];
export const UPLOAD_RATE_LIMIT = [60, 60 * 1000];

const HEX64_RE = /^[a-f0-9]{64}$/i;
const APP_VERSION_RE = /^[A-Za-z0-9._+\-]{1,32}$/;
const HASH_RE = /^[A-Za-z0-9_-]{16,128}$/;
const GRANT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// Desktop license states (license-service.js calculateStatus).
const GRANT_LICENSE_STATES = ["licensed", "trial"];

export function mapDesktopLicenseToRegistry(licenseState) {
  return licenseState === "licensed" ? "activated" : "trial";
}

// --- Small helpers -------------------------------------------------------

export function sha256HexBytes(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return crypto.subtle.digest("SHA-256", input).then((digest) =>
    [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
}

export function randomTokenHex(numBytes = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(numBytes));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Length-checked, accumulation-based comparison (no early exit).
export function tokensEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlToBytes(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function pemToDer(pem) {
  const lines = String(pem || "").split(/\r?\n/).filter(
    (line) => line.trim() && !line.includes("BEGIN") && !line.includes("END"),
  );
  const binary = atob(lines.join("").replace(/\s+/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function utf8Decode(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// --- License proof (SMLIC2 / SMLIC1 + SMREQ2) ------------------------------
// Ports school_app/license/license-service.js parse/verify semantics:
//   SMLIC2.<base64url({v:2,m:[hashes],e:[entitlements],p:paid})>.<sig>
//   SMLIC1.<base64url({v:1,m:[hashes],...})>.<sig>                      (legacy)
//   SMREQ2.<base64url({v:2,m:[hashes],e?,l?})>
// Signatures are Ed25519 over the raw payload bytes, verified against the
// owner public key supplied via env (never bundled here).

const ENTITLEMENT_ORDER = ["core", "attendance", "reports", "qr", "analysis", "receipt_printer"];

function validateHashTriple(hashes) {
  if (!Array.isArray(hashes) || hashes.length !== 3) return null;
  const list = hashes.map(String);
  if (new Set(list).size !== 3) return null;
  if (list.some((h) => !HASH_RE.test(h))) return null;
  return list;
}

export function parseRequestCode(code) {
  const compact = String(code || "").replace(/\s+/g, "");
  const parts = compact.split(".");
  if (parts.length !== 2 || parts[0] !== "SMREQ2") throw new Error("invalid_format");
  let payload;
  try {
    payload = JSON.parse(utf8Decode(base64UrlToBytes(parts[1])));
  } catch (_e) {
    throw new Error("invalid_format");
  }
  if (payload?.v !== 2) throw new Error("invalid_format");
  const hashes = validateHashTriple(payload?.m);
  if (!hashes) throw new Error("invalid_format");
  return { compact, payload, hashes };
}

export function parseActivationCode(code) {
  const compact = String(code || "").replace(/\s+/g, "");
  const parts = compact.split(".");
  if (parts.length !== 3 || (parts[0] !== "SMLIC2" && parts[0] !== "SMLIC1")) {
    throw new Error("invalid_format");
  }
  let payload;
  try {
    payload = JSON.parse(utf8Decode(base64UrlToBytes(parts[1])));
  } catch (_e) {
    throw new Error("invalid_format");
  }
  const hashes = validateHashTriple(payload?.m);
  if (!hashes) throw new Error("invalid_format");
  const payloadBytes = base64UrlToBytes(parts[1]);
  const signature = base64UrlToBytes(parts[2]);
  if (parts[0] === "SMLIC1") {
    if (payload?.v !== 1) throw new Error("invalid_format");
    return { compact, payload, hashes, payloadBytes, signature, legacy: true };
  }
  if (payload?.v !== 2 || !Number.isInteger(payload?.p)) throw new Error("invalid_format");
  if (!Array.isArray(payload?.e) || !payload.e.length) throw new Error("invalid_format");
  const entitlements = payload.e.map(String);
  if (entitlements.some((e) => !ENTITLEMENT_ORDER.includes(e))) throw new Error("invalid_format");
  if (new Set(entitlements).size !== entitlements.length) throw new Error("invalid_format");
  return { compact, payload, hashes, payloadBytes, signature, legacy: false };
}

export function hashOverlap(incoming, stored) {
  const set = new Set(stored);
  let n = 0;
  for (const h of incoming) if (set.has(h)) n += 1;
  return n;
}

export async function verifyActivationCode(code, machineBundle, publicKeyPem) {
  const parsed = parseActivationCode(code);
  const pem = String(publicKeyPem || "").trim();
  if (!pem.includes("BEGIN PUBLIC KEY")) throw new Error("owner_key_missing");
  let key;
  try {
    key = await crypto.subtle.importKey("spki", pemToDer(pem), { name: "Ed25519" }, false, ["verify"]);
  } catch (_e) {
    throw new Error("owner_key_invalid");
  }
  let ok = false;
  try {
    ok = await crypto.subtle.verify("Ed25519", key, parsed.signature, parsed.payloadBytes);
  } catch (_e) {
    ok = false;
  }
  if (!ok) throw new Error("invalid_signature");
  if (hashOverlap(machineBundle, parsed.hashes) < 2) throw new Error("wrong_machine");
  return parsed;
}

// --- R2 key layout (server-generated, customer-scoped) --------------------
// Staging keys are per-grant (unique, never promoted directly). Published
// data lives under backups/<customerId>/: one immutable versioned object
// per dataset plus a `latest.zip` pointer rewritten only on success.

export function stagingKeyFor(customerId, grantId) {
  return `staging/${customerId}/${grantId}.zip`;
}

export function versionedKeyFor(customerId, datasetId) {
  return `backups/${customerId}/${datasetId}.zip`;
}

export function latestKeyFor(customerId) {
  return `backups/${customerId}/latest.zip`;
}

export function currentKeyFor(customerId) {
  return `backups/${customerId}/current.zip`;
}

export function currentManifestKeyFor(customerId) {
  return `backups/${customerId}/current.json`;
}

export function phoneAccessKeyFor(tokenDigest) {
  return `phone-access/${tokenDigest}.json`;
}

export function publishGrantKeyFor(grantId) {
  return `publish-grants/${grantId}.json`;
}

// --- Request validation ----------------------------------------------------

function err(error, status = 422) {
  return { error, status };
}

export function validateGrantRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("bad_json", 400);
  }
  if (body.protocol !== PUBLISH_PROTOCOL) return err("bad_protocol", 400);
  if (body.protocolVersion !== PUBLISH_PROTOCOL_VERSION) return err("bad_protocol_version", 400);
  if (body.app !== PUBLISH_APP) return err("bad_protocol", 400);
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim() : "";
  if (!APP_VERSION_RE.test(appVersion)) return err("bad_app_version");
  if (body.formatVersion !== CLOUD_BACKUP_FORMAT_VERSION) return err("unsupported_format");
  if (!Number.isInteger(body.schemaVersion) || body.schemaVersion < 1 || body.schemaVersion > 9999) {
    return err("bad_schema_version");
  }
  let schoolName = null;
  if (body.schoolName !== null && body.schoolName !== undefined) {
    if (typeof body.schoolName !== "string") return err("bad_school_name");
    const trimmed = body.schoolName.trim().replace(/\s+/g, " ");
    if (trimmed === "") schoolName = null;
    else if (trimmed.length > 120) return err("bad_school_name");
    else schoolName = trimmed;
  }
  const bundle = body.machineHashBundle;
  if (!Array.isArray(bundle) || bundle.length !== 3) return err("bad_machine_hashes");
  for (const h of bundle) {
    if (typeof h !== "string" || !HASH_RE.test(h)) return err("bad_machine_hashes");
  }
  if (new Set(bundle).size !== 3) return err("bad_machine_hashes");
  if (!GRANT_LICENSE_STATES.includes(body.licenseState)) return err("bad_license_state");
  const requestCode = body.requestCode === undefined ? "" : body.requestCode;
  if (typeof requestCode !== "string" || !requestCode.trim().startsWith("SMREQ2.")) {
    return err("bad_request_code");
  }
  let activationCode = "";
  if (body.activationCode !== undefined && body.activationCode !== null && body.activationCode !== "") {
    if (typeof body.activationCode !== "string") return err("bad_activation");
    activationCode = body.activationCode.trim();
    if (!activationCode.startsWith("SMLIC2.") && !activationCode.startsWith("SMLIC1.")) {
      return err("bad_activation");
    }
  }
  if (body.licenseState === "licensed" && !activationCode) return err("bad_activation");
  if (typeof body.databaseSha256 !== "string" || !HEX64_RE.test(body.databaseSha256.trim())) {
    return err("bad_checksum");
  }
  if (typeof body.archiveSha256 !== "string" || !HEX64_RE.test(body.archiveSha256.trim())) {
    return err("bad_checksum");
  }
  if (!Number.isInteger(body.archiveSize) || body.archiveSize < 1) return err("bad_archive_size");
  if (body.archiveSize > MAX_ARCHIVE_BYTES) return err("archive_too_large", 413);
  return {
    protocolVersion: body.protocolVersion,
    appVersion,
    formatVersion: body.formatVersion,
    schemaVersion: body.schemaVersion,
    schoolName,
    hashes: [bundle[0], bundle[1], bundle[2]],
    licenseState: body.licenseState,
    requestCode: requestCode.trim(),
    activationCode,
    databaseSha256: body.databaseSha256.trim().toLowerCase(),
    archiveSha256: body.archiveSha256.trim().toLowerCase(),
    archiveSize: body.archiveSize,
  };
}

export function validateFinalizeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return err("bad_json", 400);
  }
  const grantId = typeof body.grantId === "string" ? body.grantId.trim() : "";
  if (!grantId || !GRANT_ID_RE.test(grantId)) return err("unknown_grant", 404);
  if (typeof body.databaseSha256 !== "string" || !HEX64_RE.test(body.databaseSha256.trim())) {
    return err("bad_checksum");
  }
  if (typeof body.archiveSha256 !== "string" || !HEX64_RE.test(body.archiveSha256.trim())) {
    return err("bad_checksum");
  }
  if (!Number.isInteger(body.archiveSize) || body.archiveSize < 1) return err("bad_archive_size");
  if (body.archiveSize > MAX_ARCHIVE_BYTES) return err("archive_too_large", 413);
  return {
    grantId,
    databaseSha256: body.databaseSha256.trim().toLowerCase(),
    archiveSha256: body.archiveSha256.trim().toLowerCase(),
    archiveSize: body.archiveSize,
  };
}

// --- Strict ZIP reader (STORE-only) -----------------------------------------
// Ports the desktop cloud-backup.js reader semantics to dependency-free
// Web-standard JS (Uint8Array/DataView): STORE method only, bounded entry
// count, safe names, CRC32 verification. The desktop writer emits exactly
// [database.sqlite, backup-info.json]; the server requires exactly that set.

let crcTable = null;
function crc32Bytes(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEocd(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

function unsafeName(name) {
  return !name || name.includes("..") || name.startsWith("/") || name.includes("\\") || /[\0-\x1f\x7f]/.test(name);
}

export function readZipEntries(zipInput) {
  const bytes = zipInput instanceof Uint8Array ? zipInput : new Uint8Array(zipInput);
  if (bytes.length > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new Error("archive_too_large");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error("malformed_archive");
  const totalEntries = view.getUint16(eocd + 10, true);
  if (totalEntries > MAX_ARCHIVE_ENTRIES) throw new Error("too_many_entries");
  const centralOffset = view.getUint32(eocd + 16, true);
  const entries = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("malformed_archive");
    }
    const method = view.getUint16(cursor + 10, true);
    if (method !== 0) throw new Error("unsupported_compression");
    const flags = view.getUint16(cursor + 8, true);
    if (flags & 0x1) throw new Error("encrypted_archive");
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + fileNameLength);
    const name = utf8Decode(nameBytes).replace(/\\/g, "/");
    if (unsafeName(name)) throw new Error("path_traversal");
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error("malformed_archive");
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + size > bytes.length) throw new Error("malformed_archive");
    const data = bytes.slice(dataStart, dataStart + size);
    if (crc32Bytes(data) !== crc) throw new Error("entry_crc_mismatch");
    entries.push({ name, data });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

const PHOTO_RE = /\.(png|jpe?g|gif|bmp|webp|avif|tiff?|heic|ico)$/i;

// Full archive validation against the grant expectations. Throws an Error
// whose message is the stable server error code. Returns the parsed
// manifest plus database entry bytes on success.
export function validateBackupArchive(zipInput, expectations) {
  let entries;
  try {
    entries = readZipEntries(zipInput);
  } catch (error) {
    const message = String((error && error.message) || "malformed_archive");
    if (message === "archive_too_large") throw new Error("archive_too_large");
    if (message === "too_many_entries") throw new Error("unexpected_files");
    if (message === "unsupported_compression") throw new Error("unsupported_format");
    if (message === "encrypted_archive") throw new Error("unsupported_format");
    if (message === "path_traversal") throw new Error("path_traversal");
    throw new Error("malformed_archive");
  }
  const names = entries.map((e) => e.name);
  if (names.some((n) => n.startsWith("photos/")) || names.some((n) => PHOTO_RE.test(n))) {
    throw new Error("photos_not_allowed");
  }
  const expected = [DATABASE_ENTRY_NAME, MANIFEST_ENTRY_NAME];
  if (entries.length !== 2 || !expected.every((n) => names.includes(n))) {
    const hasManifest = names.includes(MANIFEST_ENTRY_NAME);
    if (!hasManifest && entries.length >= 1) throw new Error("missing_manifest");
    throw new Error("unexpected_files");
  }
  const manifestEntry = entries.find((e) => e.name === MANIFEST_ENTRY_NAME);
  const dbEntry = entries.find((e) => e.name === DATABASE_ENTRY_NAME);
  let manifest;
  try {
    manifest = JSON.parse(utf8Decode(manifestEntry.data));
  } catch (_e) {
    throw new Error("bad_manifest");
  }
  if (!manifest || manifest.format !== CLOUD_BACKUP_FORMAT) throw new Error("bad_manifest");
  if (manifest.formatVersion !== CLOUD_BACKUP_FORMAT_VERSION) throw new Error("unsupported_format");
  if (manifest.schemaVersion !== expectations.schemaVersion) throw new Error("bad_manifest");
  if (manifest.includesPhotos !== false) throw new Error("photos_not_allowed");
  if (!manifest.database || manifest.database.file !== DATABASE_ENTRY_NAME) throw new Error("bad_manifest");
  if (manifest.database.size !== dbEntry.data.length) throw new Error("checksum_mismatch");
  if (typeof manifest.database.sha256 !== "string") throw new Error("bad_manifest");
  const manifestDbSha = manifest.database.sha256.trim().toLowerCase();
  if (!HEX64_RE.test(manifestDbSha)) throw new Error("bad_manifest");
  if (manifestDbSha !== expectations.databaseSha256) throw new Error("checksum_mismatch");
  if (!manifest.createdAt || Number.isNaN(Date.parse(manifest.createdAt))) throw new Error("bad_manifest");
  return { manifest, databaseBytes: dbEntry.data };
}
