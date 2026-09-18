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

// --- Heartbeat store path (D1) -------------------------------------------
// The ONLY writer the desktop can reach. It may touch customers.school_name,
// customers.status, and device rows. It can NEVER write phone/email/address/notes.

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
    // 1. Exact device_key match => same device, idempotent update.
    let device = await findDeviceByKey(db, deviceKey);

    // 2. Otherwise 2-of-3 hash overlap => same physical machine (one hash rotated).
    if (!device) {
      const candidates = await findHashCandidates(db, parsed.hashes);
      device = pickBestTwoOfThreeMatch(parsed.hashes, candidates);
    }

    if (device) {
      const customer = await db
        .prepare("SELECT * FROM customers WHERE id = ? LIMIT 1")
        .bind(device.customer_id)
        .first();
      if (!customer) {
        return jsonResponse({ ok: false, code: "registry_corrupt" }, 500);
      }
      const keepName =
        parsed.schoolName === null ? customer.school_name : parsed.schoolName;
      const statements = [
        db
          .prepare(
            `UPDATE devices SET device_key = ?, machine_h1 = ?, machine_h2 = ?,
              machine_h3 = ?, app_version = ?, license_state = ?,
              server_ip = ?, last_seen_at = ? WHERE id = ?`,
          )
          .bind(
            deviceKey,
            parsed.hashes[0],
            parsed.hashes[1],
            parsed.hashes[2],
            parsed.appVersion,
            parsed.status,
            ip,
            now,
            device.id,
          ),
        db
          .prepare(
            "UPDATE customers SET school_name = ?, status = ?, updated_at = ? WHERE id = ?",
          )
          .bind(keepName, parsed.status, now, customer.id),
      ];
      await db.batch(statements);
      return jsonResponse({
        ok: true,
        customerId: customer.id,
        deviceId: device.id,
        status: heartbeatResponseStatus(customer.lockdown, parsed.status),
      });
    }

    // 3. New device: attach to same-name customer (case-insensitive) or create one.
    let customer = null;
    if (parsed.schoolName !== null) {
      customer = await db
        .prepare(
          `SELECT * FROM customers WHERE school_name IS NOT NULL
             AND lower(school_name) = lower(?) LIMIT 1`,
        )
        .bind(parsed.schoolName)
        .first();
    }
    if (!customer) {
      customer = {
        id: newId("cus_"),
        school_name: parsed.schoolName,
        phone: null,
        address: null,
        email: null,
        notes: null,
        status: parsed.status,
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
      app_version: parsed.appVersion,
      license_state: parsed.status,
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
          parsed.hashes[0],
          parsed.hashes[1],
          parsed.hashes[2],
          parsed.appVersion,
          parsed.status,
          ip,
          now,
          now,
        ),
      db
        .prepare("UPDATE customers SET status = ?, updated_at = ? WHERE id = ?")
        .bind(parsed.status, now, customer.id),
    ]);
    return jsonResponse({
      ok: true,
      customerId: customer.id,
      deviceId: deviceRow.id,
      status: heartbeatResponseStatus(customer.lockdown, parsed.status),
    });
  } catch (e) {
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

    return env.ASSETS.fetch(request);
  },
};
