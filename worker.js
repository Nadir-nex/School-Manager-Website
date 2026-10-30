"use strict";

import {
  ADMIN_CUSTOMERS_PATH,
  ADMIN_RATE_LIMIT,
  HEARTBEAT_PATH,
  HEARTBEAT_RATE_LIMIT,
  checkRateLimit,
  deviceKeyFor,
  heartbeatResponseStatus,
  jsonResponse,
  newId,
  pickBestTwoOfThreeMatch,
  validateAdminPatch,
  validateHeartbeat,
} from "./registry.js";

import {
  FINALIZE_PATH,
  GRANT_PATH,
  GRANT_RATE_LIMIT,
  GRANT_TTL_MS,
  MAX_ARCHIVE_BYTES,
  RETAIN_VERSIONED_BACKUPS,
  UPLOAD_PATH,
  UPLOAD_RATE_LIMIT,
  hashOverlap,
  latestKeyFor,
  currentKeyFor,
  currentManifestKeyFor,
  phoneAccessKeyFor,
  publishGrantKeyFor,
  mapDesktopLicenseToRegistry,
  parseRequestCode,
  randomTokenHex,
  sha256HexBytes,
  stagingKeyFor,
  tokensEqual,
  validateBackupArchive,
  validateFinalizeRequest,
  validateGrantRequest,
  verifyActivationCode,
  versionedKeyFor,
} from "./cloudpublish.js";

import {
  PHONE_RESOLVE_PATH,
  PHONE_DOWNLOAD_PATH,
  PHONE_REGISTER_PATH,
  PHONE_REVOKE_PATH,
  PHONE_RESOLVE_RATE_LIMIT,
  PHONE_DOWNLOAD_RATE_LIMIT,
  PHONE_REGISTER_RATE_LIMIT,
} from "./phone.js";

const INSTALLER_PATH = "/School-Manager-Setup.exe";
const INSTALLER_KEY = "School-Manager-Setup.exe";
const INSTALLER_NAME = "School-Manager-Setup.exe";

// Best-effort per-isolate rate-limit state. Not shared across isolates;
// enable Cloudflare Rate Limiting Rules for edge-grade protection.
const rateLimitStore = new Map();

function installerHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-type", "application/vnd.microsoft.portable-executable");
  headers.set("content-disposition", `attachment; filename="${INSTALLER_NAME}"`);
  headers.set("cache-control", "public, max-age=3600");
  return headers;
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || null;
}

function limited(key, [limit, windowMs], now) {
  const retryAfterMs = checkRateLimit(rateLimitStore, key, limit, windowMs, now);
  if (retryAfterMs === null) return null;
  return jsonResponse(
    { ok: false, code: "rate_limited" },
    429,
    { "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
  );
}

function requireDb(env) {
  if (!env.REGISTRY_DB) {
    return jsonResponse(
      { ok: false, code: "registry_not_configured" },
      500,
    );
  }
  return null;
}

function requireR2(env) {
  if (!env.SCHOOL_MANAGER_APP) {
    return jsonResponse(
      { ok: false, code: "storage_not_configured" },
      500,
    );
  }
  return null;
}

// D1 can exist while `migrations/` were never applied to it; then every query
// throws "no such table". Surface that as its own code so it is distinguishable
// from any other backend failure.
// Fix: wrangler d1 migrations apply school-manager-registry --remote
function dbErrorResponse(e, label) {
  const message = String(e && e.message ? e.message : e);
  if (message.includes("no such table")) {
    console.error(label + ": migrations not applied", e);
    return jsonResponse({ ok: false, code: "registry_not_migrated" }, 500);
  }
  console.error(label, e);
  return jsonResponse({ ok: false, code: "internal" }, 500);
}

// --- Device identity store path (D1) ----------------------------------------
// The heartbeat and the cloud-publish grant are the writers the desktop can
// reach. They may touch customers.school_name, customers.status, and device
// rows. They can NEVER write phone/email/address/notes.

async function findDeviceByKey(db, deviceKey) {
  return db
    .prepare("SELECT * FROM devices WHERE device_key = ? LIMIT 1")
    .bind(deviceKey)
    .first();
}

async function findHashCandidates(db, hashes) {
  return db
    .prepare(
      `SELECT * FROM devices
        WHERE machine_h1 IN (?, ?, ?)
           OR machine_h2 IN (?, ?, ?)
           OR machine_h3 IN (?, ?, ?)`,
    )
    .bind(
      hashes[0],
      hashes[1],
      hashes[2],
      hashes[0],
      hashes[1],
      hashes[2],
      hashes[0],
      hashes[1],
      hashes[2],
    )
    .all()
    .then((r) => r.results || []);
}

// Shared device resolution with heartbeat-identical semantics:
// 1. Exact device_key match => same device, idempotent update.
// 2. Otherwise 2-of-3 hash overlap => same physical machine (one hash rotated).
// 3. Otherwise attach to a same-name customer (case-insensitive) or create one.
// Returns { deviceId, customerId, customerLockdown }. Throws an Error with
// code "registry_corrupt" when a device references a missing customer.
async function findOrCreateDevice(db, {
  schoolName,
  hashes,
  deviceKey,
  appVersion,
  registryStatus,
  ip,
  now,
}) {
  let device = await findDeviceByKey(db, deviceKey);

  if (!device) {
    const candidates = await findHashCandidates(db, hashes);
    device = pickBestTwoOfThreeMatch(hashes, candidates);
  }

  if (device) {
    const customer = await db
      .prepare("SELECT * FROM customers WHERE id = ? LIMIT 1")
      .bind(device.customer_id)
      .first();
    if (!customer) {
      const corrupt = new Error("registry_corrupt");
      corrupt.code = "registry_corrupt";
      throw corrupt;
    }
    const keepName =
      schoolName === null ? customer.school_name : schoolName;
    const statements = [
      db
        .prepare(
          `UPDATE devices SET device_key = ?, machine_h1 = ?, machine_h2 = ?,
            machine_h3 = ?, app_version = ?, license_state = ?,
            server_ip = ?, last_seen_at = ? WHERE id = ?`,
        )
        .bind(
          deviceKey,
          hashes[0],
          hashes[1],
          hashes[2],
          appVersion,
          registryStatus,
          ip,
          now,
          device.id,
        ),
      db
        .prepare(
          "UPDATE customers SET school_name = ?, status = ?, updated_at = ? WHERE id = ?",
        )
        .bind(keepName, registryStatus, now, customer.id),
    ];
    await db.batch(statements);
    return {
      deviceId: device.id,
      customerId: customer.id,
      customerLockdown: customer.lockdown,
    };
  }

  let customer = null;
  if (schoolName !== null) {
    customer = await db
      .prepare(
        `SELECT * FROM customers WHERE school_name IS NOT NULL
           AND lower(school_name) = lower(?) LIMIT 1`,
      )
      .bind(schoolName)
      .first();
  }
  if (!customer) {
    customer = {
      id: newId("cus_"),
      school_name: schoolName,
      phone: null,
      address: null,
      email: null,
      notes: null,
      status: registryStatus,
      created_at: now,
      updated_at: now,
    };
    await db
      .prepare(
        `INSERT INTO customers
          (id, school_name, phone, address, email, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customer.id,
        customer.school_name,
        null,
        null,
        null,
        null,
        customer.status,
        now,
        now,
      )
      .run();
  }
  const deviceRow = {
    id: newId("dev_"),
    customer_id: customer.id,
    device_key: deviceKey,
    app_version: appVersion,
    license_state: registryStatus,
  };
  await db.batch([
    db
      .prepare(
        `INSERT INTO devices
          (id, customer_id, device_key, machine_h1, machine_h2, machine_h3,
           app_version, license_state, server_ip, first_seen_at, last_seen_at, replaced_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        deviceRow.id,
        customer.id,
        deviceKey,
        hashes[0],
        hashes[1],
        hashes[2],
        appVersion,
        registryStatus,
        ip,
        now,
        now,
      ),
    db
      .prepare("UPDATE customers SET status = ?, updated_at = ? WHERE id = ?")
      .bind(registryStatus, now, customer.id),
  ]);
  return {
    deviceId: deviceRow.id,
    customerId: customer.id,
    customerLockdown: customer.lockdown,
  };
}

async function handleHeartbeat(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
      allow: "POST",
    });
  }
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;

  const ip = clientIp(request);
  const denied = limited(
    `hb:${ip || "unknown"}`,
    HEARTBEAT_RATE_LIMIT,
    Date.now(),
  );
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "bad_json" }, 400);
  }
  const parsed = validateHeartbeat(body);
  if (parsed.error) {
    return jsonResponse({ ok: false, code: parsed.error }, parsed.status || 422);
  }

  const db = env.REGISTRY_DB;
  const now = Date.now();
  const deviceKey = await deviceKeyFor(parsed.hashes);

  try {
    const resolved = await findOrCreateDevice(db, {
      schoolName: parsed.schoolName,
      hashes: parsed.hashes,
      deviceKey,
      appVersion: parsed.appVersion,
      registryStatus: parsed.status,
      ip,
      now,
    });
    return jsonResponse({
      ok: true,
      customerId: resolved.customerId,
      deviceId: resolved.deviceId,
      status: heartbeatResponseStatus(resolved.customerLockdown, parsed.status),
    });
  } catch (e) {
    if (e && e.code === "registry_corrupt") {
      return jsonResponse({ ok: false, code: "registry_corrupt" }, 500);
    }
    const message = String(e && e.message ? e.message : e);
    // Unique collision on device_key under concurrency => treat as idempotent retry hint.
    if (message.includes("UNIQUE constraint failed: devices.device_key")) {
      return jsonResponse({ ok: false, code: "retry" }, 409);
    }
    return dbErrorResponse(e, "heartbeat failed");
  }
}

// --- Admin API (public customer-list tool, no authentication) --------------

async function handleAdminList(request, env) {
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;
  const db = env.REGISTRY_DB;
  const rows = await db
    .prepare(
      `SELECT c.*,
              COUNT(d.id) AS device_count,
              MAX(d.last_seen_at) AS last_seen_at,
              GROUP_CONCAT(DISTINCT d.license_state) AS license_states
         FROM customers c LEFT JOIN devices d ON d.customer_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC`,
    )
    .all()
    .then((r) => r.results || []);
  const latest = await db
    .prepare(
      `SELECT d.customer_id, d.app_version, d.last_seen_at
         FROM devices d
         JOIN (SELECT customer_id, MAX(last_seen_at) AS m
                 FROM devices GROUP BY customer_id) t
           ON t.customer_id = d.customer_id AND t.m = d.last_seen_at
        GROUP BY d.customer_id`,
    )
    .all()
    .then((r) => r.results || []);
  const latestByCustomer = new Map(latest.map((d) => [d.customer_id, d]));
  // TEST ONLY: per-device detail for the provisional admin columns.
  const deviceRows = await db
    .prepare(
      `SELECT id, customer_id, app_version, license_state, first_seen_at, last_seen_at
         FROM devices ORDER BY last_seen_at DESC`,
    )
    .all()
    .then((r) => r.results || []);
  const devicesByCustomer = new Map();
  for (const d of deviceRows) {
    if (!devicesByCustomer.has(d.customer_id)) devicesByCustomer.set(d.customer_id, []);
    devicesByCustomer.get(d.customer_id).push({
      id: d.id,
      app_version: d.app_version,
      license_state: d.license_state,
      first_seen_at: d.first_seen_at,
      last_seen_at: d.last_seen_at,
    });
  }
  return jsonResponse({
    ok: true,
    customers: rows.map((c) => ({
      id: c.id,
      school_name: c.school_name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      status: c.status,
      device_count: c.device_count || 0,
      app_version: latestByCustomer.get(c.id)?.app_version || null,
      last_seen_at: c.last_seen_at || null,
      license_states: c.license_states ? c.license_states.split(",") : [],
      created_at: c.created_at,
      updated_at: c.updated_at,
      lockdown: Number(c.lockdown) === 1,
      devices: devicesByCustomer.get(c.id) || [],
    })),
  });
}

async function handleAdminUpdate(request, env, customerId) {
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "bad_json" }, 400);
  }
  const parsed = validateAdminPatch(body);
  if (parsed.error) return jsonResponse({ ok: false, code: parsed.error }, 422);
  const db = env.REGISTRY_DB;
  const existing = await db
    .prepare("SELECT * FROM customers WHERE id = ? LIMIT 1")
    .bind(customerId)
    .first();
  if (!existing) return jsonResponse({ ok: false, code: "not_found" }, 404);
  const now = Date.now();
  const next = { ...existing, ...parsed.patch, updated_at: now };
  await db
    .prepare(
      `UPDATE customers SET school_name = ?, phone = ?, email = ?,
        address = ?, notes = ?, lockdown = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      next.school_name,
      next.phone,
      next.email,
      next.address,
      next.notes,
      Number(next.lockdown) === 1 ? 1 : 0,
      now,
      customerId,
    )
    .run();
  return jsonResponse({ ok: true, customer: next });
}

// --- Cloud Publish (desktop backup upload to R2) ---------------------------
// Grant -> PUT -> finalize. The Worker mints short-lived, single-use grants
// bound to the authorized customer/device and the expected archive metadata.
// R2 keys are server-generated and customer-scoped; the client-supplied key
// is never trusted (the desktop sends no key at all). Promotion to the
// customer's latest backup happens only after the staged bytes pass size,
// SHA-256, ZIP-structure, and manifest validation.

function grantUploadUrl(request, grantId, token) {
  const upload = new URL(UPLOAD_PATH, request.url);
  upload.searchParams.set("grantId", grantId);
  upload.searchParams.set("token", token);
  return upload.toString();
}

async function loadGrant(db, grantId) {
  return db
    .prepare("SELECT * FROM cloudpublish_grants WHERE id = ? LIMIT 1")
    .bind(grantId)
    .first();
}

// Marks grants past their expiry as expired (best-effort lazy sweep for the
// single row being touched; no background jobs on Workers).
async function expireGrantIfLapsed(db, grant, now) {
  if (grant.status !== "granted" && grant.status !== "uploaded") return grant;
  if (now <= grant.expires_at) return grant;
  await db
    .prepare("UPDATE cloudpublish_grants SET status = ? WHERE id = ?")
    .bind("expired", grant.id)
    .run();
  return { ...grant, status: "expired" };
}

async function handleGrant(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "POST" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`cpg:${ip || "unknown"}`, GRANT_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, code: "bad_json" }, 400); }
  const parsed = validateGrantRequest(body);
  if (parsed.error) return jsonResponse({ ok: false, code: parsed.error }, parsed.status || 422);

  const now = Date.now();
  const registryStatus = mapDesktopLicenseToRegistry(parsed.licenseState);
  let customerId;
  try {
    const deviceKey = await deviceKeyFor(parsed.hashes);
    customerId = deviceKey;
  } catch (e) { return dbErrorResponse(e, "grant failed"); }

  // Desktop authorization (same as before): license proof for licensed.
  if (parsed.licenseState === "licensed") {
    try {
      const req = parseRequestCode(parsed.requestCode);
      if (hashOverlap(parsed.hashes, req.hashes) < 2) return jsonResponse({ ok: false, code: "bad_request_code" }, 422);
    } catch (e) {
      if (e && e.message === "invalid_format") return jsonResponse({ ok: false, code: "bad_request_code" }, 422);
      return dbErrorResponse(e, "grant failed");
    }
    const publicKey = (env.LICENSE_OWNER_PUBLIC_KEY || "").trim();
    if (!publicKey) return jsonResponse({ ok: false, code: "license_verification_unavailable" }, 503);
    try { await verifyActivationCode(parsed.activationCode, parsed.hashes, publicKey); }
    catch (e) {
      const reason = String((e && e.message) || "invalid_signature");
      if (reason === "invalid_format") return jsonResponse({ ok: false, code: "bad_activation" }, 422);
      if (reason === "owner_key_missing" || reason === "owner_key_invalid") return jsonResponse({ ok: false, code: "license_verification_unavailable" }, 503);
      return jsonResponse({ ok: false, code: "unauthorized" }, 401);
    }
  }

  const grantId = newId("grant_");
  const token = randomTokenHex(32);
  const tokenSha = await sha256HexBytes(new TextEncoder().encode(token));
  const stagingKey = stagingKeyFor(customerId, grantId);
  const currentKey = currentKeyFor(customerId);
  const expiresAt = now + GRANT_TTL_MS;
  const grant = {
    grantId,
    customerId,
    uploadTokenSha256: tokenSha,
    stagingKey,
    currentKey,
    protocolVersion: parsed.protocolVersion,
    formatVersion: parsed.formatVersion,
    schemaVersion: parsed.schemaVersion,
    appVersion: parsed.appVersion,
    licenseState: parsed.licenseState,
    databaseSha256: parsed.databaseSha256,
    archiveSha256: parsed.archiveSha256,
    archiveSize: parsed.archiveSize,
    status: "granted",
    createdAt: now,
    expiresAt,
  };
  await env.SCHOOL_MANAGER_APP.put(publishGrantKeyFor(grantId), JSON.stringify(grant), {
    httpMetadata: { contentType: "application/json" },
  });
  return jsonResponse({
    ok: true,
    grantId,
    uploadUrl: grantUploadUrl(request, grantId, token),
    objectKey: currentKey,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

async function handleUpload(request, env, url) {
  if (request.method !== "PUT") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "PUT" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`cpu:${ip || "unknown"}`, UPLOAD_RATE_LIMIT, Date.now());
  if (denied) return denied;

  const grantId = (url.searchParams.get("grantId") || "").trim();
  const token = (url.searchParams.get("token") || "").trim();
  if (!grantId || !token) return jsonResponse({ ok: false, code: "unknown_grant" }, 404);

  const now = Date.now();
  const grantKey = publishGrantKeyFor(grantId);
  const grantObj = await env.SCHOOL_MANAGER_APP.get(grantKey);
  if (!grantObj) return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
  let grant;
  try { grant = JSON.parse(await grantObj.text()); } catch { return jsonResponse({ ok: false, code: "unknown_grant" }, 404); }

  const presentedSha = await sha256HexBytes(new TextEncoder().encode(token));
  if (!tokensEqual(presentedSha, grant.uploadTokenSha256)) return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
  if (now > grant.expiresAt) {
    await env.SCHOOL_MANAGER_APP.delete(publishGrantKeyFor(grantId));
    return jsonResponse({ ok: false, code: "grant_expired" }, 410);
  }
  if (grant.status !== "granted") return jsonResponse({ ok: false, code: "grant_consumed" }, 403);

  let bytes;
  try { bytes = new Uint8Array(await request.arrayBuffer()); } catch (e) { return dbErrorResponse(e, "upload failed"); }
  if (bytes.length > MAX_ARCHIVE_BYTES || bytes.length > grant.archiveSize) return jsonResponse({ ok: false, code: "archive_too_large" }, 413);
  if (bytes.length !== grant.archiveSize) return jsonResponse({ ok: false, code: "size_mismatch" }, 422);
  const actualSha = await sha256HexBytes(bytes);
  if (actualSha !== grant.archiveSha256) return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);

  await env.SCHOOL_MANAGER_APP.put(grant.stagingKey, bytes, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { installation_id: grant.customerId, grant_id: grant.grantId, archive_sha256: grant.archiveSha256 },
  });
  grant.status = "uploaded";
  grant.uploadedAt = now;
  await env.SCHOOL_MANAGER_APP.put(publishGrantKeyFor(grantId), JSON.stringify(grant), { httpMetadata: { contentType: "application/json" } });
  return jsonResponse({ ok: true, grantId: grant.grantId, receivedBytes: bytes.length, archiveSha256: actualSha });
}

async function handleFinalize(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "POST" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`cpf:${ip || "unknown"}`, UPLOAD_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, code: "bad_json" }, 400); }
  const parsed = validateFinalizeRequest(body);
  if (parsed.error) return jsonResponse({ ok: false, code: parsed.error }, parsed.status || 422);

  const now = Date.now();
  const grantObj = await env.SCHOOL_MANAGER_APP.get(publishGrantKeyFor(parsed.grantId));
  if (!grantObj) return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
  let grant;
  try { grant = JSON.parse(await grantObj.text()); } catch { return jsonResponse({ ok: false, code: "unknown_grant" }, 404); }
  if (now > grant.expiresAt) {
    await env.SCHOOL_MANAGER_APP.delete(publishGrantKeyFor(parsed.grantId));
    return jsonResponse({ ok: false, code: "grant_expired" }, 410);
  }
  if (grant.status === "consumed" || grant.status === "failed") return jsonResponse({ ok: false, code: "grant_consumed" }, 409);
  if (grant.status !== "uploaded") return jsonResponse({ ok: false, code: "no_upload" }, 422);
  if (parsed.databaseSha256 !== grant.databaseSha256 || parsed.archiveSha256 !== grant.archiveSha256 || parsed.archiveSize !== grant.archiveSize) {
    return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);
  }

  const object = await env.SCHOOL_MANAGER_APP.get(grant.stagingKey);
  if (!object) return jsonResponse({ ok: false, code: "no_upload" }, 422);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length !== grant.archiveSize) return jsonResponse({ ok: false, code: "size_mismatch" }, 422);
  if ((await sha256HexBytes(bytes)) !== grant.archiveSha256) return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);

  let validated;
  try {
    validated = validateBackupArchive(bytes, { schemaVersion: grant.schemaVersion, databaseSha256: grant.databaseSha256 });
  } catch (e) {
    const code = String((e && e.message) || "malformed_archive");
    grant.status = "failed";
    await env.SCHOOL_MANAGER_APP.put(publishGrantKeyFor(grant.grantId), JSON.stringify(grant), { httpMetadata: { contentType: "application/json" } });
    try { await env.SCHOOL_MANAGER_APP.delete(grant.stagingKey); } catch {}
    return jsonResponse({ ok: false, code }, 422);
  }

  const customerId = grant.customerId;
  const currentKey = currentKeyFor(customerId);
  const manifestKey = currentManifestKeyFor(customerId);
  const datasetId = newId("ds_");
  const manifest = {
    format: "school-manager-current-backup",
    formatVersion: 1,
    customerId,
    archiveKey: currentKey,
    publishedAt: new Date(now).toISOString(),
    archiveSize: grant.archiveSize,
    archiveSha256: grant.archiveSha256,
    databaseSha256: grant.databaseSha256,
    schemaVersion: grant.schemaVersion,
    backupFormatVersion: grant.formatVersion,
  };
  await env.SCHOOL_MANAGER_APP.put(currentKey, bytes, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { installation_id: customerId, archive_sha256: grant.archiveSha256 },
  });
  await env.SCHOOL_MANAGER_APP.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json" },
  });
  // verify
  const verifyObj = await env.SCHOOL_MANAGER_APP.get(currentKey);
  if (!verifyObj) return jsonResponse({ ok: false, code: "internal" }, 500);
  const verifyBytes = new Uint8Array(await verifyObj.arrayBuffer());
  if (verifyBytes.length !== grant.archiveSize || (await sha256HexBytes(verifyBytes)) !== grant.archiveSha256) {
    return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);
  }

  try { await env.SCHOOL_MANAGER_APP.delete(grant.stagingKey); } catch {}
  try { await env.SCHOOL_MANAGER_APP.delete(publishGrantKeyFor(grant.grantId)); } catch {}
  // best-effort legacy cleanup
  try { await env.SCHOOL_MANAGER_APP.delete(`backups/${customerId}/latest.zip`); } catch {}

  return jsonResponse({ ok: true, datasetId, publishedAt: manifest.publishedAt });
}

// --- Phone resolver (identify-only; see phone.js) --------------------------
// Resolves a scanned machine-hash bundle to its registered device/customer
// and that customer's latest published backup metadata. Read-only: never
// creates customers/devices/grants, never serves bytes, never returns R2
// keys or download URLs. Unknown installations fail closed; the QR is an
// identifier, not a credential, so this response alone authorizes nothing.

async function handlePhoneResolve(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "POST" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`phr:${ip || "unknown"}`, PHONE_RESOLVE_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, code: "bad_json" }, 400); }
  const token = (body && typeof body.phoneToken === "string") ? body.phoneToken.trim() : "";
  if (!token || token.length < 32) {
    if (Array.isArray(body && body.machineHashBundle)) {
      const hashes = body.machineHashBundle;
      if (hashes.length !== 3) return jsonResponse({ ok: false, code: "bad_machine_hashes" }, 422);
      const customerId = await deviceKeyFor(hashes);
      const manifestObj = await env.SCHOOL_MANAGER_APP.get(currentManifestKeyFor(customerId));
      if (!manifestObj) return jsonResponse({ ok: true, registered: true, backupAvailable: false });
      let manifest; try { manifest = JSON.parse(await manifestObj.text()); } catch { return jsonResponse({ ok: false, code: "corrupt_manifest" }, 422); }
      const currentObj = await env.SCHOOL_MANAGER_APP.get(currentKeyFor(customerId));
      if (!currentObj) return jsonResponse({ ok: true, registered: true, backupAvailable: false });
      return jsonResponse({ ok:true, registered:true, backupAvailable:true, customerId, publishedAt:manifest.publishedAt, archiveSha256:manifest.archiveSha256, archiveSize:manifest.archiveSize, databaseSha256:manifest.databaseSha256, schemaVersion:manifest.schemaVersion });
    }
    return jsonResponse({ ok: false, code: "invalid_token" }, 401);
  }

  const digest = await sha256HexBytes(new TextEncoder().encode(token));
  const mappingObj = await env.SCHOOL_MANAGER_APP.get(phoneAccessKeyFor(digest));
  if (!mappingObj) return jsonResponse({ ok: false, code: "unknown_installation" }, 404);
  let mapping;
  try { mapping = JSON.parse(await mappingObj.text()); } catch { return jsonResponse({ ok: false, code: "unknown_installation" }, 404); }
  if (!mapping || mapping.revoked) return jsonResponse({ ok: false, code: "revoked_token" }, 401);

  const customerId = mapping.customerId;
  const manifestObj = await env.SCHOOL_MANAGER_APP.get(currentManifestKeyFor(customerId));
  if (!manifestObj) return jsonResponse({ ok: true, registered: true, backupAvailable: false });
  let manifest;
  try { manifest = JSON.parse(await manifestObj.text()); } catch { return jsonResponse({ ok: false, code: "corrupt_manifest" }, 422); }
  const currentObj = await env.SCHOOL_MANAGER_APP.get(currentKeyFor(customerId));
  if (!currentObj) return jsonResponse({ ok: true, registered: true, backupAvailable: false });
  return jsonResponse({
    ok: true,
    registered: true,
    backupAvailable: true,
    customerId,
    datasetId: manifest.publishedAt || manifest.archiveKey,
    publishedAt: manifest.publishedAt,
    archiveSha256: manifest.archiveSha256,
    archiveSize: manifest.archiveSize,
    databaseSha256: manifest.databaseSha256,
    schemaVersion: manifest.schemaVersion,
  });
}

async function handlePhoneDownload(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "POST" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`phd:${ip || "unknown"}`, PHONE_DOWNLOAD_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, code: "bad_json" }, 400); }
  const token = (body && typeof body.phoneToken === "string") ? body.phoneToken.trim() : "";
  if (!token || token.length < 32) return jsonResponse({ ok: false, code: "invalid_token" }, 401);

  const digest = await sha256HexBytes(new TextEncoder().encode(token));
  const mappingObj = await env.SCHOOL_MANAGER_APP.get(phoneAccessKeyFor(digest));
  if (!mappingObj) return jsonResponse({ ok: false, code: "unknown_installation" }, 404);
  let mapping;
  try { mapping = JSON.parse(await mappingObj.text()); } catch { return jsonResponse({ ok: false, code: "unknown_installation" }, 404); }
  if (!mapping || mapping.revoked) return jsonResponse({ ok: false, code: "revoked_token" }, 401);

  const customerId = mapping.customerId;
  const currentObj = await env.SCHOOL_MANAGER_APP.get(currentKeyFor(customerId));
  if (!currentObj) return jsonResponse({ ok: false, code: "no-current-backup" }, 404);

  const manifestObj = await env.SCHOOL_MANAGER_APP.get(currentManifestKeyFor(customerId));
  let manifest = null;
  try { if (manifestObj) manifest = JSON.parse(await manifestObj.text()); } catch { manifest = null; }

  const bytes = new Uint8Array(await currentObj.arrayBuffer());
  if (manifest && manifest.archiveSha256) {
    const actual = await sha256HexBytes(bytes);
    if (actual !== String(manifest.archiveSha256).toLowerCase()) {
      return jsonResponse({ ok: false, code: "backup-mismatch" }, 503);
    }
  }

  const headers = new Headers();
  headers.set("content-type", "application/zip");
  headers.set("content-length", String(bytes.length));
  headers.set("cache-control", "private, no-store");
  if (manifest) {
    headers.set("x-archive-sha256", manifest.archiveSha256 || "");
    headers.set("x-published-at", manifest.publishedAt || "");
    headers.set("x-database-sha256", manifest.databaseSha256 || "");
  }
  return new Response(bytes, { status: 200, headers });
}

async function handlePhoneRegister(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "POST" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`phreg:${ip || "unknown"}`, PHONE_REGISTER_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, code: "bad_json" }, 400); }

  // Desktop authorization: reuse license proof like grant but no archive.
  const hashes = Array.isArray(body.machineHashBundle) ? body.machineHashBundle : null;
  if (!hashes || hashes.length !== 3) return jsonResponse({ ok: false, code: "bad_machine_hashes" }, 422);
  for (const h of hashes) if (typeof h !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(h)) return jsonResponse({ ok: false, code: "bad_machine_hashes" }, 422);
  if (new Set(hashes).size !== 3) return jsonResponse({ ok: false, code: "bad_machine_hashes" }, 422);

  const licenseState = body.licenseState;
  if (licenseState !== "licensed" && licenseState !== "trial") return jsonResponse({ ok: false, code: "bad_license_state" }, 422);

  const requestCode = typeof body.requestCode === "string" ? body.requestCode.trim() : "";
  if (!requestCode.startsWith("SMREQ2.")) return jsonResponse({ ok: false, code: "bad_request_code" }, 422);

  try {
    const req = parseRequestCode(requestCode);
    if (hashOverlap(hashes, req.hashes) < 2) return jsonResponse({ ok: false, code: "bad_request_code" }, 422);
  } catch (e) {
    if (e && e.message === "invalid_format") return jsonResponse({ ok: false, code: "bad_request_code" }, 422);
    return dbErrorResponse(e, "phone register failed");
  }

  if (licenseState === "licensed") {
    const publicKey = (env.LICENSE_OWNER_PUBLIC_KEY || "").trim();
    if (!publicKey) return jsonResponse({ ok: false, code: "license_verification_unavailable" }, 503);
    const activationCode = typeof body.activationCode === "string" ? body.activationCode.trim() : "";
    if (!activationCode) return jsonResponse({ ok: false, code: "bad_activation" }, 422);
    try { await verifyActivationCode(activationCode, hashes, publicKey); }
    catch (e) {
      const reason = String((e && e.message) || "invalid_signature");
      if (reason === "invalid_format") return jsonResponse({ ok: false, code: "bad_activation" }, 422);
      if (reason === "owner_key_missing" || reason === "owner_key_invalid") return jsonResponse({ ok: false, code: "license_verification_unavailable" }, 503);
      return jsonResponse({ ok: false, code: "unauthorized" }, 401);
    }
  }

  const digest = typeof body.phoneTokenDigest === "string" ? body.phoneTokenDigest.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(digest)) return jsonResponse({ ok: false, code: "bad_token_digest" }, 422);

  const deviceKey = await deviceKeyFor(hashes);
  const mapping = { customerId: deviceKey, createdAt: Date.now(), revoked: false };
  await env.SCHOOL_MANAGER_APP.put(phoneAccessKeyFor(digest), JSON.stringify(mapping), {
    httpMetadata: { contentType: "application/json" },
  });
  return jsonResponse({ ok: true });
}

async function handlePhoneRevoke(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, { allow: "POST" });
  }
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ ok: false, code: "bad_json" }, 400); }

  const hashes = Array.isArray(body.machineHashBundle) ? body.machineHashBundle : null;
  if (!hashes || hashes.length !== 3) return jsonResponse({ ok: false, code: "bad_machine_hashes" }, 422);
  const digest = typeof body.phoneTokenDigest === "string" ? body.phoneTokenDigest.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(digest)) return jsonResponse({ ok: false, code: "bad_token_digest" }, 422);

  // Desktop authorization (best-effort): require machine hash validity; license proof optional but if provided verify.
  const licenseState = body.licenseState;
  if (licenseState === "licensed") {
    const publicKey = (env.LICENSE_OWNER_PUBLIC_KEY || "").trim();
    const activationCode = typeof body.activationCode === "string" ? body.activationCode.trim() : "";
    if (publicKey && activationCode) {
      try { await verifyActivationCode(activationCode, hashes, publicKey); } catch { return jsonResponse({ ok: false, code: "unauthorized" }, 401); }
    }
  }

  await env.SCHOOL_MANAGER_APP.delete(phoneAccessKeyFor(digest));
  return jsonResponse({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === INSTALLER_PATH) {
      if (request.method === "HEAD") {
        const object = await env.SCHOOL_MANAGER_APP.head(INSTALLER_KEY);
        if (!object) return new Response("Installer not found", { status: 404 });

        const headers = installerHeaders(object);
        headers.set("content-length", String(object.size));
        return new Response(null, { status: 200, headers });
      }

      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }

      const object = await env.SCHOOL_MANAGER_APP.get(INSTALLER_KEY, {
        onlyIf: request.headers,
      });

      if (!object) return new Response("Installer not found", { status: 404 });

      const headers = installerHeaders(object);

      // A conditional request can return metadata without a body.
      if (!("body" in object)) {
        return new Response(null, { status: 304, headers });
      }

      headers.set("content-length", String(object.size));
      return new Response(object.body, { status: 200, headers });
    }

    if (url.pathname === HEARTBEAT_PATH) {
      return handleHeartbeat(request, env);
    }

    if (url.pathname === ADMIN_CUSTOMERS_PATH) {
      if (request.method !== "GET") {
        return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
          allow: "GET",
        });
      }
      const denied = limited(
        `admin:${clientIp(request) || "unknown"}`,
        ADMIN_RATE_LIMIT,
        Date.now(),
      );
      if (denied) return denied;
      try {
        return await handleAdminList(request, env);
      } catch (e) {
        return dbErrorResponse(e, "admin list failed");
      }
    }

    if (
      url.pathname.startsWith(ADMIN_CUSTOMERS_PATH + "/") &&
      !url.pathname.slice(ADMIN_CUSTOMERS_PATH.length + 1).includes("/")
    ) {
      if (request.method !== "PATCH") {
        return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
          allow: "PATCH",
        });
      }
      const denied = limited(
        `admin:${clientIp(request) || "unknown"}`,
        ADMIN_RATE_LIMIT,
        Date.now(),
      );
      if (denied) return denied;
      const customerId = decodeURIComponent(
        url.pathname.slice(ADMIN_CUSTOMERS_PATH.length + 1),
      );
      if (!customerId) {
        return jsonResponse({ ok: false, code: "not_found" }, 404);
      }
      try {
        return await handleAdminUpdate(request, env, customerId);
      } catch (e) {
        return dbErrorResponse(e, "admin update failed");
      }
    }

    if (url.pathname === GRANT_PATH) {
      return handleGrant(request, env);
    }

    if (url.pathname === UPLOAD_PATH) {
      return handleUpload(request, env, url);
    }

    if (url.pathname === FINALIZE_PATH) {
      return handleFinalize(request, env);
    }

    if (request.method === "OPTIONS" && (url.pathname === PHONE_RESOLVE_PATH || url.pathname === PHONE_DOWNLOAD_PATH || url.pathname === PHONE_REGISTER_PATH || url.pathname === PHONE_REVOKE_PATH)) {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-max-age": "86400",
      }});
    }
    if (url.pathname === PHONE_RESOLVE_PATH) {
      const r = await handlePhoneResolve(request, env);
      r.headers.set("access-control-allow-origin", "*");
      return r;
    }
    if (url.pathname === PHONE_DOWNLOAD_PATH) {
      const r = await handlePhoneDownload(request, env);
      r.headers.set("access-control-allow-origin", "*");
      return r;
    }
    if (url.pathname === PHONE_REGISTER_PATH) {
      const r = await handlePhoneRegister(request, env);
      r.headers.set("access-control-allow-origin", "*");
      return r;
    }
    if (url.pathname === PHONE_REVOKE_PATH) {
      const r = await handlePhoneRevoke(request, env);
      r.headers.set("access-control-allow-origin", "*");
      return r;
    }

    return env.ASSETS.fetch(request);
  },
};
