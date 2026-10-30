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
  PHONE_RESOLVE_RATE_LIMIT,
  validateResolveRequest,
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
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
      allow: "POST",
    });
  }
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`cpg:${ip || "unknown"}`, GRANT_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "bad_json" }, 400);
  }
  const parsed = validateGrantRequest(body);
  if (parsed.error) {
    return jsonResponse({ ok: false, code: parsed.error }, parsed.status || 422);
  }

  const db = env.REGISTRY_DB;
  const now = Date.now();
  const registryStatus = mapDesktopLicenseToRegistry(parsed.licenseState);
  let deviceKey;
  try {
    deviceKey = await deviceKeyFor(parsed.hashes);
  } catch (e) {
    return dbErrorResponse(e, "grant failed");
  }

  try {
    const resolved = await findOrCreateDevice(db, {
      schoolName: parsed.schoolName,
      hashes: parsed.hashes,
      deviceKey,
      appVersion: parsed.appVersion,
      registryStatus,
      ip,
      now,
    });
    if (Number(resolved.customerLockdown) === 1) {
      return jsonResponse({ ok: false, code: "customer_locked" }, 401);
    }

    // Independent license authorization. The client-supplied licenseState is
    // never trusted for privilege: "licensed" grants additionally require a
    // structurally valid SMREQ2 request code plus an SMLIC2/SMLIC1 activation
    // code whose Ed25519 signature verifies against the owner public key and
    // whose machine triple overlaps this device 2-of-3. "trial" grants are
    // device-bound only (same trust as the heartbeat) and recorded as such.
    let licenseVerified = 0;
    try {
      const req = parseRequestCode(parsed.requestCode);
      if (hashOverlap(parsed.hashes, req.hashes) < 2) {
        return jsonResponse({ ok: false, code: "bad_request_code" }, 422);
      }
    } catch (e) {
      if (e && e.message === "invalid_format") {
        return jsonResponse({ ok: false, code: "bad_request_code" }, 422);
      }
      return dbErrorResponse(e, "grant failed");
    }
    if (parsed.licenseState === "licensed") {
      const publicKey = (env.LICENSE_OWNER_PUBLIC_KEY || "").trim();
      if (!publicKey) {
        return jsonResponse({ ok: false, code: "license_verification_unavailable" }, 503);
      }
      try {
        await verifyActivationCode(parsed.activationCode, parsed.hashes, publicKey);
        licenseVerified = 1;
      } catch (e) {
        const reason = String((e && e.message) || "invalid_signature");
        if (reason === "invalid_format") {
          return jsonResponse({ ok: false, code: "bad_activation" }, 422);
        }
        if (reason === "owner_key_missing" || reason === "owner_key_invalid") {
          return jsonResponse({ ok: false, code: "license_verification_unavailable" }, 503);
        }
        // invalid_signature | wrong_machine: authentication failure.
        return jsonResponse({ ok: false, code: "unauthorized" }, 401);
      }
    }

    const grantId = newId("grant_");
    const token = randomTokenHex(32);
    const tokenSha = await sha256HexBytes(new TextEncoder().encode(token));
    const stagingKey = stagingKeyFor(resolved.customerId, grantId);
    const publishedKey = latestKeyFor(resolved.customerId);
    const expiresAt = now + GRANT_TTL_MS;
    await db
      .prepare(
        `INSERT INTO cloudpublish_grants
          (id, customer_id, device_id, upload_token_sha256, staging_key, published_key,
           protocol_version, format_version, schema_version, app_version, license_state,
           license_verified, database_sha256, archive_sha256, archive_size,
           status, created_at, expires_at, uploaded_at, finalized_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'granted', ?, ?, NULL, NULL)`,
      )
      .bind(
        grantId,
        resolved.customerId,
        resolved.deviceId,
        tokenSha,
        stagingKey,
        publishedKey,
        parsed.protocolVersion,
        parsed.formatVersion,
        parsed.schemaVersion,
        parsed.appVersion,
        parsed.licenseState,
        licenseVerified,
        parsed.databaseSha256,
        parsed.archiveSha256,
        parsed.archiveSize,
        now,
        expiresAt,
      )
      .run();
    return jsonResponse({
      ok: true,
      grantId,
      uploadUrl: grantUploadUrl(request, grantId, token),
      objectKey: publishedKey,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (e) {
    if (e && e.code === "registry_corrupt") {
      return jsonResponse({ ok: false, code: "registry_corrupt" }, 500);
    }
    const message = String(e && e.message ? e.message : e);
    if (message.includes("UNIQUE constraint failed")) {
      return jsonResponse({ ok: false, code: "retry" }, 409);
    }
    return dbErrorResponse(e, "grant failed");
  }
}

async function handleUpload(request, env, url) {
  if (request.method !== "PUT") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
      allow: "PUT",
    });
  }
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`cpu:${ip || "unknown"}`, UPLOAD_RATE_LIMIT, Date.now());
  if (denied) return denied;

  const grantId = (url.searchParams.get("grantId") || "").trim();
  const token = (url.searchParams.get("token") || "").trim();
  if (!grantId || !token) {
    return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
  }
  const db = env.REGISTRY_DB;
  const now = Date.now();
  try {
    let grant = await loadGrant(db, grantId);
    if (!grant) return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
    const presentedSha = await sha256HexBytes(new TextEncoder().encode(token));
    if (!tokensEqual(presentedSha, grant.upload_token_sha256)) {
      return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
    }
    grant = await expireGrantIfLapsed(db, grant, now);
    if (grant.status === "expired") {
      return jsonResponse({ ok: false, code: "grant_expired" }, 410);
    }
    if (grant.status !== "granted") {
      return jsonResponse({ ok: false, code: "grant_consumed" }, 403);
    }

    let bytes;
    try {
      bytes = new Uint8Array(await request.arrayBuffer());
    } catch (e) {
      return dbErrorResponse(e, "upload failed");
    }
    if (bytes.length > MAX_ARCHIVE_BYTES || bytes.length > grant.archive_size) {
      return jsonResponse({ ok: false, code: "archive_too_large" }, 413);
    }
    if (bytes.length !== grant.archive_size) {
      return jsonResponse({ ok: false, code: "size_mismatch" }, 422);
    }
    const actualSha = await sha256HexBytes(bytes);
    if (actualSha !== grant.archive_sha256) {
      return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);
    }

    await env.SCHOOL_MANAGER_APP.put(grant.staging_key, bytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: {
        customer_id: grant.customer_id,
        grant_id: grant.id,
        archive_sha256: grant.archive_sha256,
      },
    });
    await db
      .prepare("UPDATE cloudpublish_grants SET status = ?, uploaded_at = ? WHERE id = ?")
      .bind("uploaded", now, grant.id)
      .run();
    return jsonResponse({
      ok: true,
      grantId: grant.id,
      receivedBytes: bytes.length,
      archiveSha256: actualSha,
    });
  } catch (e) {
    return dbErrorResponse(e, "upload failed");
  }
}

async function handleFinalize(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
      allow: "POST",
    });
  }
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;
  const r2Missing = requireR2(env);
  if (r2Missing) return r2Missing;

  const ip = clientIp(request);
  const denied = limited(`cpf:${ip || "unknown"}`, UPLOAD_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "bad_json" }, 400);
  }
  const parsed = validateFinalizeRequest(body);
  if (parsed.error) {
    return jsonResponse({ ok: false, code: parsed.error }, parsed.status || 422);
  }

  const db = env.REGISTRY_DB;
  const now = Date.now();
  try {
    let grant = await loadGrant(db, parsed.grantId);
    if (!grant) return jsonResponse({ ok: false, code: "unknown_grant" }, 404);
    grant = await expireGrantIfLapsed(db, grant, now);
    if (grant.status === "expired") {
      return jsonResponse({ ok: false, code: "grant_expired" }, 410);
    }
    if (grant.status === "consumed" || grant.status === "failed") {
      return jsonResponse({ ok: false, code: "grant_consumed" }, 409);
    }
    if (grant.status !== "uploaded") {
      return jsonResponse({ ok: false, code: "no_upload" }, 422);
    }
    if (
      parsed.databaseSha256 !== grant.database_sha256 ||
      parsed.archiveSha256 !== grant.archive_sha256 ||
      parsed.archiveSize !== grant.archive_size
    ) {
      return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);
    }

    const object = await env.SCHOOL_MANAGER_APP.get(grant.staging_key);
    if (!object) {
      return jsonResponse({ ok: false, code: "no_upload" }, 422);
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== grant.archive_size) {
      return jsonResponse({ ok: false, code: "size_mismatch" }, 422);
    }
    if ((await sha256HexBytes(bytes)) !== grant.archive_sha256) {
      return jsonResponse({ ok: false, code: "checksum_mismatch" }, 422);
    }

    let validated;
    try {
      validated = validateBackupArchive(bytes, {
        schemaVersion: grant.schema_version,
        databaseSha256: grant.database_sha256,
      });
    } catch (e) {
      const code = String((e && e.message) || "malformed_archive");
      await db
        .prepare("UPDATE cloudpublish_grants SET status = ? WHERE id = ?")
        .bind("failed", grant.id)
        .run();
      try {
        await env.SCHOOL_MANAGER_APP.delete(grant.staging_key);
      } catch (_deleteError) {
        // Best effort: a failed staging object must never block retries,
        // which always mint a fresh grant with a fresh staging key.
      }
      return jsonResponse({ ok: false, code }, 422);
    }

    // Promotion: versioned immutable object first, then the stable latest
    // pointer. The previous latest is replaced only here, after success.
    const datasetId = newId("ds_");
    const versionedKey = versionedKeyFor(grant.customer_id, datasetId);
    await env.SCHOOL_MANAGER_APP.put(versionedKey, bytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: {
        customer_id: grant.customer_id,
        dataset_id: datasetId,
        archive_sha256: grant.archive_sha256,
      },
    });
    await env.SCHOOL_MANAGER_APP.put(grant.published_key, bytes, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: {
        customer_id: grant.customer_id,
        dataset_id: datasetId,
        archive_sha256: grant.archive_sha256,
      },
    });
    await db.batch([
      db
        .prepare(
          `INSERT INTO published_backups
            (id, customer_id, device_id, grant_id, object_key, latest_key,
             archive_sha256, archive_size, database_sha256, manifest_json, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          datasetId,
          grant.customer_id,
          grant.device_id,
          grant.id,
          versionedKey,
          grant.published_key,
          grant.archive_sha256,
          grant.archive_size,
          grant.database_sha256,
          JSON.stringify(validated.manifest),
          now,
        ),
      db
        .prepare("UPDATE cloudpublish_grants SET status = ?, finalized_at = ? WHERE id = ?")
        .bind("consumed", now, grant.id),
    ]);
    try {
      await env.SCHOOL_MANAGER_APP.delete(grant.staging_key);
    } catch (_deleteError) {
      // Best effort; staging keys are per-grant and never served.
    }

    // Minimal retention: keep the newest RETAIN_VERSIONED_BACKUPS versioned
    // objects per customer; delete older bytes and their rows.
    try {
      const rows = await db
        .prepare(
          `SELECT id, object_key FROM published_backups
            WHERE customer_id = ? ORDER BY published_at DESC, rowid DESC`,
        )
        .bind(grant.customer_id)
        .all()
        .then((r) => r.results || []);
      const overflow = rows.slice(RETAIN_VERSIONED_BACKUPS);
      for (const row of overflow) {
        try {
          await env.SCHOOL_MANAGER_APP.delete(row.object_key);
        } catch (_deleteError) {
          // Best effort; the row delete below still drops the pointer.
        }
        await db
          .prepare("DELETE FROM published_backups WHERE id = ?")
          .bind(row.id)
          .run();
      }
    } catch (_retentionError) {
      // Retention must never fail a successful publication.
      console.error("retention failed", _retentionError);
    }

    return jsonResponse({
      ok: true,
      datasetId,
      publishedAt: new Date(now).toISOString(),
    });
  } catch (e) {
    return dbErrorResponse(e, "finalize failed");
  }
}

// --- Phone resolver (identify-only; see phone.js) --------------------------
// Resolves a scanned machine-hash bundle to its registered device/customer
// and that customer's latest published backup metadata. Read-only: never
// creates customers/devices/grants, never serves bytes, never returns R2
// keys or download URLs. Unknown installations fail closed; the QR is an
// identifier, not a credential, so this response alone authorizes nothing.

async function handlePhoneResolve(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, code: "method_not_allowed" }, 405, {
      allow: "POST",
    });
  }
  const dbMissing = requireDb(env);
  if (dbMissing) return dbMissing;

  const ip = clientIp(request);
  const denied = limited(`phr:${ip || "unknown"}`, PHONE_RESOLVE_RATE_LIMIT, Date.now());
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "bad_json" }, 400);
  }
  const parsed = validateResolveRequest(body);
  if (parsed.error) {
    return jsonResponse({ ok: false, code: parsed.error }, parsed.status || 422);
  }

  const db = env.REGISTRY_DB;
  try {
    const candidates = await findHashCandidates(db, parsed.hashes);
    const device = pickBestTwoOfThreeMatch(parsed.hashes, candidates);
    if (!device) {
      return jsonResponse({ ok: false, code: "unknown_installation" }, 404);
    }
    const customer = await db
      .prepare("SELECT * FROM customers WHERE id = ? LIMIT 1")
      .bind(device.customer_id)
      .first();
    if (!customer) {
      return jsonResponse({ ok: false, code: "registry_corrupt" }, 500);
    }
    if (Number(customer.lockdown) === 1) {
      return jsonResponse({ ok: false, code: "customer_locked" }, 401);
    }
    const latest = await db
      .prepare(
        `SELECT id, archive_sha256, archive_size, database_sha256, published_at
           FROM published_backups WHERE customer_id = ?
           ORDER BY published_at DESC, rowid DESC LIMIT 1`,
      )
      .bind(customer.id)
      .first();
    if (!latest) {
      return jsonResponse({ ok: true, registered: true, backupAvailable: false });
    }
    return jsonResponse({
      ok: true,
      registered: true,
      backupAvailable: true,
      datasetId: latest.id,
      publishedAt: new Date(Number(latest.published_at)).toISOString(),
      archiveSha256: latest.archive_sha256,
      archiveSize: latest.archive_size,
      databaseSha256: latest.database_sha256,
      schoolName: customer.school_name,
    });
  } catch (e) {
    return dbErrorResponse(e, "phone resolve failed");
  }
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

    if (url.pathname === PHONE_RESOLVE_PATH) {
      return handlePhoneResolve(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
