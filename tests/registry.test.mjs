// End-to-end tests for the customer/device registry.
// Run: node --test tests/   (Node >= 22, no dependencies)
// They exercise the REAL worker.js and the REAL migrations/*.sql through a
// minimal D1-compatible shim backed by node:sqlite (D1 is SQLite).

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import worker from "../worker.js";
import { deviceKeyFor } from "../registry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://school.example";

// --- Minimal D1 shim over node:sqlite ---------------------------------------
function makeDb({ migrate = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  if (migrate) {
    const migration = readFileSync(join(ROOT, "migrations", "0001_registry.sql"), "utf8");
    sqlite.exec(migration);
  }
  const wrap = (sql, params) => ({
    _sql: sql,
    _params: params,
    async first() {
      const row = sqlite.prepare(sql).get(...params);
      return row === undefined ? null : row;
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...params) };
    },
    async run() {
      const info = sqlite.prepare(sql).run(...params);
      return { success: true, meta: info };
    },
  });
  return {
    _sqlite: sqlite,
    prepare(sql) {
      const bound = (...params) => wrap(sql, params);
      return { bind: bound, first: () => bound().first(), all: () => bound().all(), run: () => bound().run() };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(sqlite.prepare(s._sql).run(...s._params));
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function makeAssets() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const map = { "/update.json": "update.json", "/admin.html": "admin.html" };
      const file = map[url.pathname];
      if (!file || !existsSync(join(ROOT, file))) {
        return new Response("Not Found", { status: 404 });
      }
      const body = readFileSync(join(ROOT, file));
      const type = file.endsWith(".html") ? "text/html" : "application/json";
      return new Response(body, { headers: { "content-type": type } });
    },
  };
}

const emptyR2 = {
  async head() {
    return null;
  },
  async get() {
    return null;
  },
};

let ipSeq = 0;
const freshIp = () => `10.9.0.${(ipSeq++ % 250) + 1}`;

function env(extra = {}) {
  return { REGISTRY_DB: makeDb(), ASSETS: makeAssets(), SCHOOL_MANAGER_APP: emptyR2, ...extra };
}

function hb(body, ip) {
  return new Request(ORIGIN + "/api/v1/devices/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip || freshIp() },
    body: JSON.stringify(body),
  });
}

const H = (h1, h2, h3) => [h1, h2, h3];
const H1 = H("hash_AAAA1111bbbb2222", "hash_CCCC3333dddd4444", "hash_EEEE5555ffff6666");

async function post(envObj, body, ip) {
  const res = await worker.fetch(hb(body, ip), envObj);
  return { status: res.status, json: await res.json() };
}

const base = (over = {}) => ({
  schoolName: "El Najah School",
  machineHashBundle: [...H1],
  status: "trial",
  appVersion: "2.1.3",
  ...over,
});

function count(db, table) {
  return db._sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

// --- Tests -------------------------------------------------------------------
describe("heartbeat: registration", () => {
  it("first heartbeat creates customer + device with minimal response", async () => {
    const e = env();
    const { status, json } = await post(e, base());
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(json).sort(), ["customerId", "deviceId", "ok", "status"]);
    assert.equal(json.ok, true);
    assert.match(json.customerId, /^cus_[0-9a-f]{18}$/);
    assert.match(json.deviceId, /^dev_[0-9a-f]{18}$/);
    assert.equal(json.status, "trial");
    assert.equal(count(e.REGISTRY_DB, "customers"), 1);
    assert.equal(count(e.REGISTRY_DB, "devices"), 1);
    // No contact data leaked in the response.
    assert.ok(!("phone" in json) && !("email" in json) && !("address" in json));
  });

  it("repeat heartbeat is idempotent and bumps last_seen", async () => {
    const e = env();
    const ip = freshIp();
    const first = await post(e, base(), ip);
    // Age the row so the last_seen bump is observable even within one ms.
    e.REGISTRY_DB._sqlite
      .prepare("UPDATE devices SET first_seen_at = 1, last_seen_at = 1 WHERE id = ?")
      .run(first.json.deviceId);
    const second = await post(e, base(), ip);
    assert.equal(second.json.customerId, first.json.customerId);
    assert.equal(second.json.deviceId, first.json.deviceId);
    assert.equal(count(e.REGISTRY_DB, "customers"), 1);
    assert.equal(count(e.REGISTRY_DB, "devices"), 1);
    const dev = e.REGISTRY_DB._sqlite.prepare("SELECT * FROM devices WHERE id = ?").get(first.json.deviceId);
    assert.ok(dev.last_seen_at > 1, "last_seen_at must advance");
    assert.equal(dev.first_seen_at, 1, "first_seen_at must be preserved");
  });

  it("shuffled bundle order maps to the same device (deterministic key)", async () => {
    const e = env();
    const ip = freshIp();
    const a = await post(e, base(), ip);
    const b = await post(e, base({ machineHashBundle: [H1[2], H1[0], H1[1]] }), ip);
    assert.equal(b.json.deviceId, a.json.deviceId);
    assert.equal(count(e.REGISTRY_DB, "devices"), 1);
  });

  it("device key is sha256(sorted|joined)", async () => {
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update([...H1].sort().join("|")).digest("hex");
    assert.equal(await deviceKeyFor(H1), expected);
    assert.equal(await deviceKeyFor([H1[2], H1[0], H1[1]]), expected);
  });

  it("non-POST is rejected", async () => {
    const e = env();
    const res = await worker.fetch(new Request(ORIGIN + "/api/v1/devices/heartbeat"), e);
    assert.equal(res.status, 405);
  });

  it("malformed JSON is 400", async () => {
    const e = env();
    const res = await worker.fetch(
      new Request(ORIGIN + "/api/v1/devices/heartbeat", { method: "POST", body: "{nope" }),
      e,
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "bad_json");
  });
});

describe("heartbeat: school rename behavior", () => {
  it("rename updates the SAME customer, creates nothing", async () => {
    const e = env();
    const ip = freshIp();
    const a = await post(e, base(), ip);
    const b = await post(e, base({ schoolName: "El Najah Academy" }), ip);
    assert.equal(b.json.customerId, a.json.customerId);
    assert.equal(b.json.deviceId, a.json.deviceId);
    assert.equal(count(e.REGISTRY_DB, "customers"), 1);
    const name = e.REGISTRY_DB._sqlite.prepare("SELECT school_name FROM customers WHERE id = ?").get(a.json.customerId).school_name;
    assert.equal(name, "El Najah Academy");
  });

  it("null / empty name preserves the known name", async () => {
    const e = env();
    const ip = freshIp();
    const a = await post(e, base(), ip);
    for (const schoolName of [null, "", "   "]) {
      const b = await post(e, base({ schoolName }), ip);
      assert.equal(b.json.customerId, a.json.customerId);
    }
    const name = e.REGISTRY_DB._sqlite.prepare("SELECT school_name FROM customers WHERE id = ?").get(a.json.customerId).school_name;
    assert.equal(name, "El Najah School");
  });

  it("same name case-insensitive attaches a new device to the known customer", async () => {
    const e = env();
    await post(e, base());
    const b = await post(
      e,
      base({ schoolName: "el najah school", machineHashBundle: H("z1_xxxxxxxxxxxxxxxx", "z2_xxxxxxxxxxxxxxxx", "z3_xxxxxxxxxxxxxxxx") }),
    );
    assert.equal(count(e.REGISTRY_DB, "customers"), 1);
    assert.equal(count(e.REGISTRY_DB, "devices"), 2);
    assert.ok(b.json.customerId);
  });
});

describe("heartbeat: statuses", () => {
  for (const status of ["trial", "activated", "suspended_trial"]) {
    it(`stores status=${status} on device and customer`, async () => {
      const e = env();
      const { json } = await post(e, base({ status }));
      assert.equal(json.status, status);
      const dev = e.REGISTRY_DB._sqlite.prepare("SELECT license_state FROM devices WHERE id = ?").get(json.deviceId);
      const cus = e.REGISTRY_DB._sqlite.prepare("SELECT status FROM customers WHERE id = ?").get(json.customerId);
      assert.equal(dev.license_state, status);
      assert.equal(cus.status, status);
    });
  }

  it("desktop cannot create server-reserved status=suspended", async () => {
    const e = env();
    const { status, json } = await post(e, base({ status: "suspended" }));
    assert.equal(status, 422);
    assert.equal(json.code, "bad_status");
    assert.equal(count(e.REGISTRY_DB, "customers"), 0);
  });
});

describe("heartbeat: validation", () => {
  const bad = [
    ["missing bundle", { machineHashBundle: undefined }],
    ["only 2 hashes", { machineHashBundle: ["a123456789012345", "b123456789012345"] }],
    ["4 hashes", { machineHashBundle: ["a123456789012345", "b123456789012345", "c123456789012345", "d123456789012345"] }],
    ["duplicate hashes", { machineHashBundle: ["dup_1234567890123", "dup_1234567890123", "zzz_1234567890123"] }],
    ["too short", { machineHashBundle: ["short", "b123456789012345", "c123456789012345"] }],
    ["bad chars", { machineHashBundle: ["bad hash with spaces!", "b123456789012345", "c123456789012345"] }],
    ["non-string", { machineHashBundle: [123, "b123456789012345", "c123456789012345"] }],
    ["bad version", { appVersion: "" }],
    ["version too long", { appVersion: "1".repeat(33) }],
    ["name too long", { schoolName: "x".repeat(121) }],
  ];
  for (const [name, over] of bad) {
    it(`422 on ${name}`, async () => {
      const e = env();
      const { status, json } = await post(e, { ...base(), ...over });
      assert.equal(status, 422, name);
      assert.equal(json.ok, false);
      assert.equal(count(e.REGISTRY_DB, "devices"), 0, name);
    });
  }
});

describe("heartbeat: 2-of-3 matching", () => {
  it("one rotated hash keeps the SAME device and adopts new hashes", async () => {
    const e = env();
    const ip = freshIp();
    const a = await post(e, base(), ip);
    const rotated = [H1[0], H1[1], "hash_NEW1rotated2222"];
    const b = await post(e, base({ machineHashBundle: rotated }), ip);
    assert.equal(b.json.deviceId, a.json.deviceId);
    assert.equal(b.json.customerId, a.json.customerId);
    assert.equal(count(e.REGISTRY_DB, "devices"), 1);
    const dev = e.REGISTRY_DB._sqlite.prepare("SELECT * FROM devices WHERE id = ?").get(a.json.deviceId);
    assert.deepEqual([dev.machine_h1, dev.machine_h2, dev.machine_h3], rotated);
    assert.equal(dev.device_key, await deviceKeyFor(rotated));
  });

  it("only 1-of-3 overlap creates a NEW device", async () => {
    const e = env();
    await post(e, base());
    const b = await post(
      e,
      base({ machineHashBundle: [H1[0], "only_one_matches_1111", "only_one_matches_2222"] }),
    );
    assert.equal(count(e.REGISTRY_DB, "devices"), 2);
    assert.ok(b.json.deviceId);
  });

  it("three different hashes create a new device (+ new customer for new name)", async () => {
    const e = env();
    await post(e, base());
    const b = await post(
      e,
      base({ schoolName: "Other School", machineHashBundle: H("n1_xxxxxxxxxxxxxxxx", "n2_xxxxxxxxxxxxxxxx", "n3_xxxxxxxxxxxxxxxx") }),
    );
    assert.equal(count(e.REGISTRY_DB, "devices"), 2);
    assert.equal(count(e.REGISTRY_DB, "customers"), 2);
    assert.ok(b.json.deviceId);
  });
});

describe("heartbeat: admin-owned fields are unreachable", () => {
  it("heartbeat ignores phone/email/address/notes and never overwrites them", async () => {
    const e = env();
    const ip = freshIp();
    const a = await post(e, base(), ip);
    // Owner sets contact info via admin API (no authentication).
    const patch = await worker.fetch(
      new Request(ORIGIN + `/api/v1/admin/customers/${a.json.customerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "0550 00 00 00", email: "a@school.dz", address: "Algiers", notes: "VIP" }),
      }),
      e,
    );
    assert.equal(patch.status, 200);
    // Malicious/accidental extra fields in heartbeat are ignored.
    await post(e, { ...base(), phone: "HACK", email: "h@x.dz", address: "HACK", notes: "HACK" }, ip);
    const cus = e.REGISTRY_DB._sqlite.prepare("SELECT * FROM customers WHERE id = ?").get(a.json.customerId);
    assert.equal(cus.phone, "0550 00 00 00");
    assert.equal(cus.email, "a@school.dz");
    assert.equal(cus.address, "Algiers");
    assert.equal(cus.notes, "VIP");
  });

  it("server-observed IP is stored as latest-only metadata, never identity", async () => {
    const e = env();
    const a = await post(e, base(), "10.1.1.1");
    await post(e, base(), "10.2.2.2");
    const dev = e.REGISTRY_DB._sqlite.prepare("SELECT server_ip FROM devices WHERE id = ?").get(a.json.deviceId);
    assert.equal(dev.server_ip, "10.2.2.2");
    assert.equal(count(e.REGISTRY_DB, "devices"), 1);
  });
});

describe("admin API", () => {
  it("list and edit work directly without any headers", async () => {
    const e = env();
    const anon = await worker.fetch(new Request(ORIGIN + "/api/v1/admin/customers"), e);
    assert.equal(anon.status, 200);
    assert.deepEqual((await anon.json()).customers, []);
  });

  it("lists customers with aggregates and patches contact fields", async () => {
    const e = env();
    const a = await post(e, base());
    const list = await worker.fetch(new Request(ORIGIN + "/api/v1/admin/customers"), e);
    assert.equal(list.status, 200);
    const data = await list.json();
    assert.equal(data.customers.length, 1);
    const row = data.customers[0];
    assert.equal(row.school_name, "El Najah School");
    assert.equal(row.status, "trial");
    assert.equal(row.device_count, 1);
    assert.equal(row.app_version, "2.1.3");
    assert.ok(row.last_seen_at > 0);

    const upd = await worker.fetch(
      new Request(ORIGIN + `/api/v1/admin/customers/${a.json.customerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "0551", email: "c@d.dz" }),
      }),
      e,
    );
    assert.equal(upd.status, 200);
    assert.equal((await upd.json()).customer.phone, "0551");

    const bad = await worker.fetch(
      new Request(ORIGIN + `/api/v1/admin/customers/${a.json.customerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
      e,
    );
    assert.equal(bad.status, 422);

    const missing = await worker.fetch(
      new Request(ORIGIN + "/api/v1/admin/customers/cus_deadbeefdeadbeef01", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "1" }),
      }),
      e,
    );
    assert.equal(missing.status, 404);
  });
});

describe("rate limiting", () => {
  it("heartbeat returns 429 with retry-after after 30 hits per 10 min", async () => {
    const e = env();
    const ip = "10.77.77.77";
    let last;
    for (let i = 0; i < 31; i++) last = await post(e, base(), ip);
    assert.equal(last.status, 429);
    assert.equal(last.json.code, "rate_limited");
  });
});

describe("existing systems untouched", () => {
  it("GET /update.json still serves the exact manifest", async () => {
    const e = env();
    const res = await worker.fetch(new Request(ORIGIN + "/update.json"), e);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.version, "2.1.3");
    assert.ok(json.downloadUrl.endsWith("/School-Manager-Setup.exe"));
    assert.ok("sha256" in json && "notes" in json);
    // File on disk unchanged by this feature.
    const raw = readFileSync(join(ROOT, "update.json"), "utf8");
    assert.deepEqual(JSON.parse(raw), json);
  });

  it("installer route still wired to R2 (404 when bucket empty)", async () => {
    const e = env();
    const res = await worker.fetch(new Request(ORIGIN + "/School-Manager-Setup.exe"), e);
    assert.equal(res.status, 404);
  });

  it("admin page loads directly with no login screen and is not linked from index", async () => {
    const e = env();
    const res = await worker.fetch(new Request(ORIGIN + "/admin.html"), e);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<h1>Customers<\/h1>/);
    assert.ok(!html.includes("ADMIN_TOKEN"), "no token references in admin page");
    assert.ok(!html.includes("localStorage"), "no token persistence in admin page");
    assert.ok(!html.includes("Authorization"), "no auth headers in admin page");
    const index = readFileSync(join(ROOT, "index.html"), "utf8");
    assert.ok(!index.includes("admin.html"), "admin must stay unlinked");
  });

  it("migration creates required tables and indexes", async () => {
    const e = env();
    const tables = e.REGISTRY_DB._sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('customers','devices')")
      .all()
      .map((r) => r.name)
      .sort();
    assert.deepEqual(tables, ["customers", "devices"]);
    const indexes = e.REGISTRY_DB._sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all()
      .map((r) => r.name)
      .sort();
    for (const want of ["idx_customers_school_name", "idx_devices_customer", "idx_devices_h1", "idx_devices_h2", "idx_devices_h3"]) {
      assert.ok(indexes.includes(want), `missing ${want}`);
    }
  });
});

describe("unmigrated database (D1 created, migrations never applied)", () => {
  const unmigratedEnv = (extra = {}) => env({ ...extra, REGISTRY_DB: makeDb({ migrate: false }) });

  it("heartbeat reports registry_not_migrated instead of internal", async () => {
    const e = unmigratedEnv();
    const { status, json } = await post(e, base());
    assert.equal(status, 500);
    assert.deepEqual(json, { ok: false, code: "registry_not_migrated" });
  });

  it("admin list reports registry_not_migrated instead of internal", async () => {
    const e = unmigratedEnv();
    const res = await worker.fetch(new Request(ORIGIN + "/api/v1/admin/customers"), e);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { ok: false, code: "registry_not_migrated" });
  });

  it("admin update reports registry_not_migrated instead of internal", async () => {
    const e = unmigratedEnv();
    const res = await worker.fetch(
      new Request(ORIGIN + "/api/v1/admin/customers/cus_abc", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "1" }),
      }),
      e,
    );
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { ok: false, code: "registry_not_migrated" });
  });
});
