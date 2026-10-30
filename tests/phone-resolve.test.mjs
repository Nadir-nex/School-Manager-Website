// Phone resolver tests (identify-only; see phone.js).
// Run: node --test tests/   (Node >= 22, no dependencies)
// They exercise the REAL worker.js + phone.js + migrations/*.sql through
// the same D1 shim / R2 mock contract as cloudpublish.test.mjs.
// Synthetic hashes and databases only; no network, no real bucket.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import worker from "../worker.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://school.example";
const RESOLVE = "/api/v1/phone/resolve";

// --- D1 shim (same contract as cloudpublish.test.mjs) ----------------------
function makeDb({ migrate = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  if (migrate) {
    const dir = join(ROOT, "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) sqlite.exec(readFileSync(join(dir, f), "utf8"));
  }
  const wrap = (sql, params) => {
    const placeholders = (sql.match(/\?/g) || []).length;
    if (placeholders !== params.length) {
      throw new Error("D1_ERROR: Wrong number of parameter bindings for SQL query.");
    }
    return {
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
    };
  };
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

function makeR2() {
  const store = new Map();
  return {
    _store: store,
    async put(key, value) {
      store.set(key, Buffer.from(value instanceof Uint8Array ? value : String(value ?? ""), ));
    },
    async get(key) {
      const bytes = store.get(key);
      if (!bytes) return null;
      return {
        size: bytes.length,
        async arrayBuffer() {
          const dup = Buffer.from(bytes);
          return dup.buffer.slice(dup.byteOffset, dup.byteOffset + dup.byteLength);
        },
      };
    },
    async head(key) {
      const bytes = store.get(key);
      return bytes ? { size: bytes.length } : null;
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

// --- Synthetic fixtures -----------------------------------------------------
let ipSeq = 200;
const freshIp = () => `10.41.0.${(ipSeq++ % 250) + 1}`;

const H = (h1, h2, h3) => [h1, h2, h3];
const SCHOOL_A = H("phone_AAAA1111bbbb2222", "phone_CCCC3333dddd4444", "phone_EEEE5555ffff6666");
const SCHOOL_B = H("phone_GGGG7777hhhh8888", "phone_IIII9999jjjj0000", "phone_KKKK1111llll2222");
const UNKNOWN = H("phone_ZZZZ0000zzzz0000", "phone_YYYY1111yyyy1111", "phone_XXXX2222xxxx2222");

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

function env(extra = {}) {
  return {
    REGISTRY_DB: makeDb(),
    ASSETS: { async fetch() { return new Response("Not Found", { status: 404 }); } },
    SCHOOL_MANAGER_APP: makeR2(),
    ...extra,
  };
}

async function postResolve(e, body, ip) {
  const res = await worker.fetch(
    new Request(ORIGIN + RESOLVE, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip || freshIp() },
      body: JSON.stringify(body),
    }),
    e,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function heartbeat(e, hashes, schoolName, ip) {
  const res = await worker.fetch(
    new Request(ORIGIN + "/api/v1/devices/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip || freshIp() },
      body: JSON.stringify({
        schoolName,
        machineHashBundle: hashes,
        status: "trial",
        appVersion: "2.1.6-test",
      }),
    }),
    e,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

// Minimal STORE-only ZIP writer (mirrors cloudpublish.test.mjs).
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoreZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, end]);
}

function fullPublish(e, hashes, schoolName) {
  // Trial grant (device-bound, no activation code) -> PUT -> finalize.
  const dbBytes = Buffer.from(`SQLITE-SYNTHETIC-${schoolName}-`.padEnd(4096, "x"), "utf8");
  const manifest = {
    format: "school-manager-cloud-backup",
    formatVersion: 1,
    app: "School Manager",
    appVersion: "2.1.6-test",
    createdAt: new Date().toISOString(),
    schemaVersion: 7,
    database: { file: "database.sqlite", size: dbBytes.length, sha256: sha256Hex(dbBytes) },
    includesPhotos: false,
    files: ["database.sqlite", "backup-info.json"],
  };
  const bytes = buildStoreZip([
    { name: "database.sqlite", data: dbBytes },
    { name: "backup-info.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
  ]);
  const grantBody = {
    protocol: "school-manager-cloud-publish",
    protocolVersion: 1,
    app: "School Manager",
    appVersion: "2.1.6-test",
    formatVersion: 1,
    schemaVersion: 7,
    schoolName,
    machineHashBundle: [...hashes],
    licenseState: "trial",
    requestCode: `SMREQ2.${b64u(JSON.stringify({ v: 2, m: hashes, e: ["core"] }))}`,
    databaseSha256: sha256Hex(dbBytes),
    archiveSha256: sha256Hex(bytes),
    archiveSize: bytes.length,
  };
  const post = (path, body, method = "POST", extraHeaders = {}) =>
    worker.fetch(
      new Request(ORIGIN + path, {
        method,
        headers: { "content-type": "application/json", "cf-connecting-ip": freshIp(), ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      e,
    );
  const put = (url, data) =>
    worker.fetch(
      new Request(url, {
        method: "PUT",
        headers: { "content-type": "application/zip", "content-length": String(data.length), "cf-connecting-ip": freshIp() },
        body: data,
      }),
      e,
    );
  return (async () => {
    const g = await post("/api/v1/cloudpublish/grant", grantBody);
    const gj = await g.json().catch(() => null);
    assert.equal(g.status, 200, `grant failed: ${JSON.stringify(gj)}`);
    const p = await put(gj.uploadUrl, bytes);
    assert.equal(p.status, 200);
    const f = await post("/api/v1/cloudpublish/finalize", {
      grantId: gj.grantId,
      databaseSha256: sha256Hex(dbBytes),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    const fj = await f.json().catch(() => null);
    assert.equal(f.status, 200, `finalize failed: ${JSON.stringify(fj)}`);
    return { datasetId: fj.datasetId, archiveSha256: sha256Hex(bytes), archiveSize: bytes.length };
  })();
}

const counts = (e) => ({
  customers: e.REGISTRY_DB._sqlite.prepare("SELECT COUNT(*) AS n FROM customers").get().n,
  devices: e.REGISTRY_DB._sqlite.prepare("SELECT COUNT(*) AS n FROM devices").get().n,
  backups: e.REGISTRY_DB._sqlite.prepare("SELECT COUNT(*) AS n FROM published_backups").get().n,
});

// --- Tests ------------------------------------------------------------------

describe("phone resolve", () => {
  it("unknown installation fails closed and creates nothing", async () => {
    const e = env();
    const r = await postResolve(e, { machineHashBundle: UNKNOWN });
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, { ok: false, code: "unknown_installation" });
    assert.deepEqual(counts(e), { customers: 0, devices: 0, backups: 0 });
  });

  it("registered installation resolves to its own latest dataset, no secrets", async () => {
    const e = env();
    const pub = await fullPublish(e, SCHOOL_A, "Alpha School");
    const r = await postResolve(e, { machineHashBundle: SCHOOL_A });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.registered, true);
    assert.equal(r.json.backupAvailable, true);
    assert.equal(r.json.datasetId, pub.datasetId);
    assert.equal(r.json.archiveSha256, pub.archiveSha256);
    assert.equal(r.json.archiveSize, pub.archiveSize);
    assert.ok(r.json.publishedAt);
    assert.equal(r.json.schoolName, "Alpha School");
    const body = JSON.stringify(r.json);
    assert.ok(!body.includes("object_key") && !body.includes("staging/"));
    assert.ok(!body.includes("grant") && !body.includes("token"));
    assert.ok(!body.includes("machine_h"));
  });

  it("two schools resolve to different datasets (no cross-talk)", async () => {
    const e = env();
    const a = await fullPublish(e, SCHOOL_A, "Alpha School");
    const b = await fullPublish(e, SCHOOL_B, "Beta School");
    assert.notEqual(a.datasetId, b.datasetId);
    const ra = await postResolve(e, { machineHashBundle: SCHOOL_A });
    const rb = await postResolve(e, { machineHashBundle: SCHOOL_B });
    assert.equal(ra.json.datasetId, a.datasetId);
    assert.equal(rb.json.datasetId, b.datasetId);
    assert.equal(ra.json.schoolName, "Alpha School");
    assert.equal(rb.json.schoolName, "Beta School");
  });

  it("2-of-3 rotation still matches (one hash changed)", async () => {
    const e = env();
    await fullPublish(e, SCHOOL_A, "Alpha School");
    const rotated = [SCHOOL_A[0], SCHOOL_A[1], "phone_RRRR9999rrrr9999"];
    const r = await postResolve(e, { machineHashBundle: rotated });
    assert.equal(r.status, 200);
    assert.equal(r.json.registered, true);
    assert.equal(r.json.backupAvailable, true);
  });

  it("school name is never identity: same name, different hashes is unknown", async () => {
    const e = env();
    await fullPublish(e, SCHOOL_A, "Same Name School");
    const r = await postResolve(e, { machineHashBundle: SCHOOL_B });
    assert.equal(r.status, 404);
    assert.equal(r.json.code, "unknown_installation");
    // …and the failed lookup must not have attached anything to that name.
    assert.deepEqual(counts(e), { customers: 1, devices: 1, backups: 1 });
  });

  it("locked customer fails closed", async () => {
    const e = env();
    await fullPublish(e, SCHOOL_A, "Alpha School");
    e.REGISTRY_DB._sqlite.prepare("UPDATE customers SET lockdown = 1").run();
    const r = await postResolve(e, { machineHashBundle: SCHOOL_A });
    assert.equal(r.status, 401);
    assert.deepEqual(r.json, { ok: false, code: "customer_locked" });
  });

  it("registered installation without backup reports backupAvailable:false", async () => {
    const e = env();
    const hb = await heartbeat(e, SCHOOL_A, "Heartbeat Only School");
    assert.equal(hb.status, 200);
    const r = await postResolve(e, { machineHashBundle: SCHOOL_A });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, registered: true, backupAvailable: false });
  });

  it("malformed payloads and methods are rejected", async () => {
    const e = env();
    const bad = [
      [{}, 422, "bad_machine_hashes"],
      [{ machineHashBundle: ["only-one"] }, 422, "bad_machine_hashes"],
      [{ machineHashBundle: [SCHOOL_A[0], SCHOOL_A[1], SCHOOL_A[1]] }, 422, "bad_machine_hashes"],
      [{ machineHashBundle: ["x".repeat(10), "y".repeat(10), "z".repeat(10)] }, 422, "bad_machine_hashes"],
      [{ machineHashBundle: "not-an-array" }, 422, "bad_machine_hashes"],
    ];
    for (const [body, status, code] of bad) {
      const r = await postResolve(e, body);
      assert.equal(r.status, status, JSON.stringify(body));
      assert.equal(r.json.code, code);
    }
    const get = await worker.fetch(new Request(ORIGIN + "/api/v1/phone/resolve", { method: "GET" }), e);
    assert.equal(get.status, 405);
    assert.deepEqual(await get.json(), { ok: false, code: "method_not_allowed" });
    const garbage = await worker.fetch(
      new Request(ORIGIN + "/api/v1/phone/resolve", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": freshIp() },
        body: "{not json",
      }),
      e,
    );
    assert.equal(garbage.status, 400);
    assert.deepEqual(await garbage.json(), { ok: false, code: "bad_json" });
  });
});
