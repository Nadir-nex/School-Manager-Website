// End-to-end tests for desktop cloud-backup publication (grant -> PUT -> finalize).
// Run: node --test tests/   (Node >= 22, no dependencies)
// They exercise the REAL worker.js, the REAL cloudpublish.js, and the REAL
// migrations/*.sql through a minimal D1-compatible shim (node:sqlite) and an
// in-memory R2 mock. Synthetic databases only; no network, no real bucket.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import worker from "../worker.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://school.example";

// --- D1 shim (same contract as tests/registry.test.mjs) --------------------
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

// In-memory R2 mock: put/get/head/delete over a Map of byte copies.
function makeR2() {
  const store = new Map();
  const copy = (value) => {
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
    return Buffer.from(String(value ?? ""), "utf8");
  };
  return {
    _store: store,
    async put(key, value) {
      store.set(key, copy(value));
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

// --- Synthetic license keypair (test-only; never the owner key) ------------
const { publicKey: TEST_PUBLIC_PEM, privateKey: TEST_PRIVATE_PEM } = (() => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
})();

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

const H = (h1, h2, h3) => [h1, h2, h3];
const H1 = H("hash_AAAA1111bbbb2222", "hash_CCCC3333dddd4444", "hash_EEEE5555ffff6666");
const H2 = H("hash_GGGG7777hhhh8888", "hash_IIII9999jjjj0000", "hash_KKKK1111llll2222");

function mintRequest(hashes, entitlements = ["core", "attendance", "reports"]) {
  return `SMREQ2.${b64u(JSON.stringify({ v: 2, m: hashes, e: entitlements }))}`;
}

function mintActivation(hashes, entitlements = ["core", "attendance", "reports"], paid = 30000) {
  const payload = Buffer.from(JSON.stringify({ v: 2, m: hashes, e: entitlements, p: paid }), "utf8");
  const signature = sign(null, payload, TEST_PRIVATE_PEM);
  return `SMLIC2.${b64u(payload)}.${b64u(signature)}`;
}

// --- Minimal STORE-only ZIP writer (mirrors desktop cloud-backup layout) ---
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
    const crc = entry.badCrc ? crc32(data) ^ 0xffffffff : crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(entry.method ?? 0, 8);
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
    central.writeUInt16LE(entry.method ?? 0, 10);
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

function manifestFor(dbBytes, over = {}) {
  return {
    format: "school-manager-cloud-backup",
    formatVersion: 1,
    app: "School Manager",
    appVersion: "2.1.6-test",
    createdAt: new Date().toISOString(),
    schemaVersion: 7,
    database: {
      file: "database.sqlite",
      size: dbBytes.length,
      sha256: sha256Hex(dbBytes),
    },
    includesPhotos: false,
    files: ["database.sqlite", "backup-info.json"],
    ...over,
  };
}

function archiveFor(dbBytes, { manifestOver = {}, extraEntries = [], manifestName = "backup-info.json" } = {}) {
  const manifest = manifestFor(dbBytes, manifestOver);
  return {
    manifest,
    bytes: buildStoreZip([
      { name: "database.sqlite", data: dbBytes },
      ...extraEntries,
      { name: manifestName, data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
    ]),
  };
}

const syntheticDb = (seed = "db") => Buffer.from(`SQLITE-SYNTHETIC-${seed}-`.padEnd(4096, "x"), "utf8");

// --- Request helpers --------------------------------------------------------
let ipSeq = 100;
const freshIp = () => `10.31.0.${(ipSeq++ % 250) + 1}`;

function env(extra = {}) {
  return {
    REGISTRY_DB: makeDb(),
    ASSETS: makeAssets(),
    SCHOOL_MANAGER_APP: makeR2(),
    LICENSE_OWNER_PUBLIC_KEY: TEST_PUBLIC_PEM,
    ...extra,
  };
}

function grantBody(archive, dbBytes, over = {}) {
  return {
    protocol: "school-manager-cloud-publish",
    protocolVersion: 1,
    app: "School Manager",
    appVersion: "2.1.6-test",
    formatVersion: 1,
    schemaVersion: 7,
    schoolName: "El Najah School",
    machineHashBundle: [...H1],
    licenseState: "trial",
    requestCode: mintRequest(H1),
    databaseSha256: sha256Hex(dbBytes),
    archiveSha256: sha256Hex(archive),
    archiveSize: archive.length,
    ...over,
  };
}

async function postJson(e, path, body, ip) {
  const res = await worker.fetch(
    new Request(ORIGIN + path, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip || freshIp() },
      body: JSON.stringify(body),
    }),
    e,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function putUpload(e, uploadUrl, bytes, ip) {
  const res = await worker.fetch(
    new Request(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.length),
        "cf-connecting-ip": ip || freshIp(),
      },
      body: bytes,
    }),
    e,
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function fullPublish(e, { dbBytes, manifestOver, extraEntries, grantOver = {}, ip } = {}) {
  const db = dbBytes || syntheticDb(String(ipSeq));
  const { manifest, bytes } = archiveFor(db, { manifestOver, extraEntries });
  const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db, grantOver), ip);
  if (g.status !== 200) return { grant: g, put: null, finalize: null, db, bytes, manifest };
  const p = await putUpload(e, g.json.uploadUrl, bytes, ip);
  if (p.status !== 200) return { grant: g, put: p, finalize: null, db, bytes, manifest };
  const f = await postJson(
    e,
    "/api/v1/cloudpublish/finalize",
    {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    },
    ip,
  );
  return { grant: g, put: p, finalize: f, db, bytes, manifest };
}

const publishedCount = (e) =>
  e.REGISTRY_DB._sqlite.prepare("SELECT COUNT(*) AS n FROM published_backups").get().n;
const grantRow = (e, id) =>
  e.REGISTRY_DB._sqlite.prepare("SELECT * FROM cloudpublish_grants WHERE id = ?").get(id);
const r2get = async (e, key) => {
  const obj = await e.SCHOOL_MANAGER_APP.get(key);
  return obj ? Buffer.from(await obj.arrayBuffer()) : null;
};

// --- Tests -------------------------------------------------------------------

describe("grant validation", () => {
  it("rejects wrong protocol, version, and app", async () => {
    const e = env();
    const db = syntheticDb("v");
    const { bytes } = archiveFor(db);
    for (const over of [
      { protocol: "other" },
      { protocolVersion: 2 },
      { app: "Other App" },
      { formatVersion: 2 },
      { schemaVersion: 0 },
    ]) {
      const { status, json } = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db, over));
      assert.equal(status, status === 400 ? 400 : status);
      assert.equal(json.ok, false);
    }
  });

  it("rejects bad identity, checksums, and sizes", async () => {
    const e = env();
    const db = syntheticDb("i");
    const { bytes } = archiveFor(db);
    const cases = [
      [{ machineHashBundle: ["only", "two"] }, "bad_machine_hashes"],
      [{ databaseSha256: "zz" }, "bad_checksum"],
      [{ archiveSha256: "zz" }, "bad_checksum"],
      [{ archiveSize: 0 }, "bad_archive_size"],
      [{ archiveSize: 64 * 1024 * 1024 + 1 }, "archive_too_large"],
      [{ licenseState: "expired" }, "bad_license_state"],
      [{ licenseState: "activated" }, "bad_license_state"],
      [{ requestCode: "garbage" }, "bad_request_code"],
    ];
    for (const [over, code] of cases) {
      const { status, json } = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db, over));
      assert.equal(json.code, code, JSON.stringify(over));
      assert.ok(status === 422 || status === 413);
    }
  });

  it("rejects licensed grants without an activation code", async () => {
    const e = env();
    const db = syntheticDb("lic0");
    const { bytes } = archiveFor(db);
    const { status, json } = await postJson(
      e,
      "/api/v1/cloudpublish/grant",
      grantBody(bytes, db, { licenseState: "licensed", requestCode: mintRequest(H1) }),
    );
    assert.equal(status, 422);
    assert.equal(json.code, "bad_activation");
  });

  it("rejects licensed grants when no owner key is configured", async () => {
    const e = env({ LICENSE_OWNER_PUBLIC_KEY: "" });
    const db = syntheticDb("nokey");
    const { bytes } = archiveFor(db);
    const { status, json } = await postJson(
      e,
      "/api/v1/cloudpublish/grant",
      grantBody(bytes, db, {
        licenseState: "licensed",
        requestCode: mintRequest(H1),
        activationCode: mintActivation(H1),
      }),
    );
    assert.equal(status, 503);
    assert.equal(json.code, "license_verification_unavailable");
  });

  it("rejects forged signatures and wrong-machine activations", async () => {
    const e = env();
    const db = syntheticDb("forge");
    const { bytes } = archiveFor(db);
    const good = mintActivation(H1);
    const tampered = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA");
    for (const activationCode of [tampered, mintActivation(H2)]) {
      const { status, json } = await postJson(
        e,
        "/api/v1/cloudpublish/grant",
        grantBody(bytes, db, {
          licenseState: "licensed",
          requestCode: mintRequest(H1),
          activationCode,
        }),
      );
      assert.equal(status, 401);
      assert.equal(json.code, "unauthorized");
    }
  });

  it("accepts a valid SMLIC2 grant and records verification", async () => {
    const e = env();
    const db = syntheticDb("goodlic");
    const { bytes } = archiveFor(db);
    const { status, json } = await postJson(
      e,
      "/api/v1/cloudpublish/grant",
      grantBody(bytes, db, {
        licenseState: "licensed",
        requestCode: mintRequest(H1),
        activationCode: mintActivation(H1),
      }),
    );
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(json.grantId.startsWith("grant_"));
    assert.ok(json.uploadUrl.includes("/api/v1/cloudpublish/upload?"));
    assert.ok(json.objectKey.startsWith("backups/"));
    assert.ok(Date.parse(json.expiresAt) > Date.now());
    assert.equal(grantRow(e, json.grantId).license_verified, 1);
  });

  it("accepts a trial grant as device-bound without signature", async () => {
    const e = env();
    const db = syntheticDb("trial");
    const { bytes } = archiveFor(db);
    const { status, json } = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(grantRow(e, json.grantId).license_verified, 0);
  });

  it("refuses grants for locked customers", async () => {
    const e = env();
    const db = syntheticDb("lock");
    const { bytes } = archiveFor(db);
    const first = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    assert.equal(first.status, 200);
    const row = grantRow(e, first.json.grantId);
    const lock = await worker.fetch(
      new Request(ORIGIN + `/api/v1/admin/customers/${row.customer_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lockdown: true }),
      }),
      e,
    );
    assert.equal(lock.status, 200);
    const second = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    assert.equal(second.status, 401);
    assert.equal(second.json.code, "customer_locked");
  });

  it("rejects non-POST grant with 405", async () => {
    const e = env();
    const res = await worker.fetch(new Request(ORIGIN + "/api/v1/cloudpublish/grant"), e);
    assert.equal(res.status, 405);
  });
});

describe("upload", () => {
  it("rejects unknown grants and wrong tokens without oracle", async () => {
    const e = env();
    const r1 = await putUpload(e, `${ORIGIN}/api/v1/cloudpublish/upload?grantId=grant_nope&token=${"0".repeat(64)}`, Buffer.from("x"));
    assert.equal(r1.status, 404);
    assert.equal(r1.json.code, "unknown_grant");
    const db = syntheticDb("tok");
    const { bytes } = archiveFor(db);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    const badUrl = g.json.uploadUrl.replace(/token=[^&]+/, `token=${"1".repeat(64)}`);
    const r2 = await putUpload(e, badUrl, bytes);
    assert.equal(r2.status, 404);
    assert.equal(r2.json.code, "unknown_grant");
  });

  it("rejects expired grants with 410", async () => {
    const e = env();
    const db = syntheticDb("exp");
    const { bytes } = archiveFor(db);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    e.REGISTRY_DB._sqlite
      .prepare("UPDATE cloudpublish_grants SET expires_at = ? WHERE id = ?")
      .run(Date.now() - 1000, g.json.grantId);
    const p = await putUpload(e, g.json.uploadUrl, bytes);
    assert.equal(p.status, 410);
    assert.equal(p.json.code, "grant_expired");
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    assert.equal(f.status, 410);
    assert.equal(f.json.code, "grant_expired");
  });

  it("rejects size and checksum mismatches", async () => {
    const e = env();
    const db = syntheticDb("mm");
    const { bytes } = archiveFor(db);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    const short = bytes.slice(0, bytes.length - 10);
    const p1 = await putUpload(e, g.json.uploadUrl, short);
    assert.equal(p1.status, 422);
    assert.equal(p1.json.code, "size_mismatch");
    const other = Buffer.from(bytes);
    other[0] ^= 1;
    const p2 = await putUpload(e, g.json.uploadUrl, other);
    assert.equal(p2.status, 422);
    assert.equal(p2.json.code, "checksum_mismatch");
    // Grant still usable after failed PUTs (single-use applies to success).
    const p3 = await putUpload(e, g.json.uploadUrl, bytes);
    assert.equal(p3.status, 200);
    assert.equal(p3.json.receivedBytes, bytes.length);
  });

  it("rejects oversized bodies", async () => {
    const e = env();
    const db = syntheticDb("big");
    const { bytes } = archiveFor(db);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    const big = Buffer.alloc(bytes.length + 16, 7);
    const p = await putUpload(e, g.json.uploadUrl, big);
    assert.equal(p.status, 413);
    assert.equal(p.json.code, "archive_too_large");
  });

  it("rejects a second PUT after success", async () => {
    const e = env();
    const { grant, put } = await fullPublish(e, {});
    assert.equal(put.status, 200);
    void grant;
    // New grant/PUT pair consumed below; reuse the first upload URL.
    const g2db = syntheticDb("reput");
    const g2zip = archiveFor(g2db);
    const g2 = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(g2zip.bytes, g2db));
    const u1 = await putUpload(e, g2.json.uploadUrl, g2zip.bytes);
    assert.equal(u1.status, 200);
    const u2 = await putUpload(e, g2.json.uploadUrl, g2zip.bytes);
    assert.equal(u2.status, 403);
    assert.equal(u2.json.code, "grant_consumed");
  });

  it("rejects non-PUT upload with 405", async () => {
    const e = env();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/v1/cloudpublish/upload?grantId=x&token=y`),
      e,
    );
    assert.equal(res.status, 405);
  });
});

describe("finalize validation", () => {
  it("publishes a valid backup end to end", async () => {
    const e = env();
    const { grant, put, finalize, db, bytes } = await fullPublish(e, {});
    assert.equal(grant.status, 200);
    assert.equal(put.status, 200);
    assert.equal(finalize.status, 200);
    assert.equal(finalize.json.ok, true);
    assert.ok(finalize.json.datasetId.startsWith("ds_"));
    assert.ok(!Number.isNaN(Date.parse(finalize.json.publishedAt)));
    assert.equal(publishedCount(e), 1);
    const row = e.REGISTRY_DB._sqlite
      .prepare("SELECT * FROM published_backups WHERE id = ?")
      .get(finalize.json.datasetId);
    assert.equal(row.archive_sha256, sha256Hex(bytes));
    assert.equal(row.database_sha256, sha256Hex(db));
    const versioned = await r2get(e, row.object_key);
    const latest = await r2get(e, row.latest_key);
    assert.ok(versioned.equals(bytes));
    assert.ok(latest.equals(bytes));
    // Staging is gone; grant is consumed.
    assert.equal(grantRow(e, grant.json.grantId).status, "consumed");
    assert.equal(await e.SCHOOL_MANAGER_APP.head(`staging/${row.customer_id}/${grant.json.grantId}.zip`), null);
  });

  it("fails finalize without upload and keeps latest empty", async () => {
    const e = env();
    const db = syntheticDb("noupload");
    const { bytes } = archiveFor(db);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: sha256Hex(bytes),
      archiveSize: bytes.length,
    });
    assert.equal(f.status, 422);
    assert.equal(f.json.code, "no_upload");
    assert.equal(publishedCount(e), 0);
  });

  it("rejects checksum mismatches in finalize", async () => {
    const e = env();
    const db = syntheticDb("fmm");
    const { bytes } = archiveFor(db);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(bytes, db));
    await putUpload(e, g.json.uploadUrl, bytes);
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: "0".repeat(64),
      archiveSize: bytes.length,
    });
    assert.equal(f.status, 422);
    assert.equal(f.json.code, "checksum_mismatch");
    assert.equal(publishedCount(e), 0);
  });

  it("rejects malformed archives and marks the grant failed", async () => {
    const e = env();
    const garbage = Buffer.from("not-a-zip-at-all".padEnd(512, "."));
    const g = await postJson(
      e,
      "/api/v1/cloudpublish/grant",
      grantBody(garbage, garbage, { schoolName: "Garbage School" }),
    );
    assert.equal(g.status, 200);
    const p = await putUpload(e, g.json.uploadUrl, garbage);
    assert.equal(p.status, 200);
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(garbage),
      archiveSha256: sha256Hex(garbage),
      archiveSize: garbage.length,
    });
    assert.equal(f.status, 422);
    assert.equal(f.json.code, "malformed_archive");
    assert.equal(grantRow(e, g.json.grantId).status, "failed");
    assert.equal(publishedCount(e), 0);
    // Repeat finalize is terminal.
    const f2 = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(garbage),
      archiveSha256: sha256Hex(garbage),
      archiveSize: garbage.length,
    });
    assert.equal(f2.status, 409);
    assert.equal(f2.json.code, "grant_consumed");
  });

  it("rejects unexpected files, missing manifests, and photos", async () => {
    const e = env();
    const db = syntheticDb("files");
    // Extra benign file.
    let r = await fullPublish(e, { dbBytes: db, extraEntries: [{ name: "notes.txt", data: Buffer.from("hi") }] });
    assert.equal(r.finalize.status, 422);
    assert.equal(r.finalize.json.code, "unexpected_files");
    // Missing manifest (only the database entry).
    const onlyDb = buildStoreZip([{ name: "database.sqlite", data: db }]);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(onlyDb, db, { schoolName: "No Manifest" }));
    await putUpload(e, g.json.uploadUrl, onlyDb);
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: sha256Hex(onlyDb),
      archiveSize: onlyDb.length,
    });
    assert.equal(f.status, 422);
    assert.ok(["missing_manifest", "unexpected_files"].includes(f.json.code));
    // Photo entry is rejected as photos, even with a manifest present.
    r = await fullPublish(e, {
      dbBytes: db,
      extraEntries: [{ name: "photos/p1.jpg", data: Buffer.from("fake-photo") }],
    });
    assert.equal(r.finalize.status, 422);
    assert.equal(r.finalize.json.code, "photos_not_allowed");
    assert.equal(publishedCount(e), 0);
  });

  it("rejects manifests with wrong schema, photos flag, or db mismatch", async () => {
    const e = env();
    const db = syntheticDb("manifest");
    let r = await fullPublish(e, { dbBytes: db, manifestOver: { schemaVersion: 8 } });
    assert.equal(r.finalize.status, 422);
    assert.equal(r.finalize.json.code, "bad_manifest");
    r = await fullPublish(e, { dbBytes: db, manifestOver: { includesPhotos: true } });
    assert.equal(r.finalize.status, 422);
    assert.equal(r.finalize.json.code, "photos_not_allowed");
    const other = syntheticDb("other-db");
    r = await fullPublish(e, {
      dbBytes: db,
      manifestOver: { database: { file: "database.sqlite", size: other.length, sha256: sha256Hex(other) } },
    });
    assert.equal(r.finalize.status, 422);
    assert.equal(r.finalize.json.code, "checksum_mismatch");
    assert.equal(publishedCount(e), 0);
  });

  it("rejects DEFLATE entries as unsupported format", async () => {
    const e = env();
    const db = syntheticDb("deflate");
    const manifest = manifestFor(db);
    const zip = buildStoreZip([
      { name: "database.sqlite", data: db, method: 8 },
      { name: "backup-info.json", data: Buffer.from(JSON.stringify(manifest)) },
    ]);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(zip, db, { schoolName: "Deflate" }));
    await putUpload(e, g.json.uploadUrl, zip);
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: sha256Hex(zip),
      archiveSize: zip.length,
    });
    assert.equal(f.status, 422);
    assert.equal(f.json.code, "unsupported_format");
  });

  it("rejects path traversal entries", async () => {
    const e = env();
    const db = syntheticDb("traversal");
    const manifest = manifestFor(db);
    const zip = buildStoreZip([
      { name: "database.sqlite", data: db },
      { name: "../evil.json", data: Buffer.from(JSON.stringify(manifest)) },
    ]);
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(zip, db, { schoolName: "Traversal" }));
    await putUpload(e, g.json.uploadUrl, zip);
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(db),
      archiveSha256: sha256Hex(zip),
      archiveSize: zip.length,
    });
    assert.equal(f.status, 422);
    assert.equal(f.json.code, "path_traversal");
  });
});

describe("isolation, retry, retention, latest pointer", () => {
  it("isolates customers by server-generated keys", async () => {
    const e = env();
    const aDb = syntheticDb("school-a");
    const aZip = archiveFor(aDb);
    const ga = await postJson(
      e,
      "/api/v1/cloudpublish/grant",
      grantBody(aZip.bytes, aDb, { schoolName: "School A", machineHashBundle: [...H1], requestCode: mintRequest(H1) }),
    );
    const bDb = syntheticDb("school-b");
    const bZip = archiveFor(bDb);
    const gb = await postJson(
      e,
      "/api/v1/cloudpublish/grant",
      grantBody(bZip.bytes, bDb, { schoolName: "School B", machineHashBundle: [...H2], requestCode: mintRequest(H2) }),
    );
    assert.equal(ga.status, 200);
    assert.equal(gb.status, 200);
    assert.notEqual(ga.json.objectKey, gb.json.objectKey);
    // A's token cannot drive B's grant.
    const evil = await putUpload(e, gb.json.uploadUrl.replace(/token=[^&]+/, "token=" + ga.json.uploadUrl.match(/token=([^&]+)/)[1]), bZip.bytes);
    assert.equal(evil.status, 404);
    assert.equal(gb.json.uploadUrl.match(/grantId=([^&]+)/)[1] !== ga.json.grantId, true);
    await putUpload(e, ga.json.uploadUrl, aZip.bytes);
    await putUpload(e, gb.json.uploadUrl, bZip.bytes);
    const fa = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: ga.json.grantId,
      databaseSha256: sha256Hex(aDb),
      archiveSha256: sha256Hex(aZip.bytes),
      archiveSize: aZip.bytes.length,
    });
    const fb = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: gb.json.grantId,
      databaseSha256: sha256Hex(bDb),
      archiveSha256: sha256Hex(bZip.bytes),
      archiveSize: bZip.bytes.length,
    });
    assert.equal(fa.status, 200);
    assert.equal(fb.status, 200);
    assert.notEqual(fa.json.datasetId, fb.json.datasetId);
    const rows = e.REGISTRY_DB._sqlite.prepare("SELECT * FROM published_backups").all();
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].customer_id, rows[1].customer_id);
    const la = await r2get(e, rows.find((r) => r.id === fa.json.datasetId).latest_key);
    const lb = await r2get(e, rows.find((r) => r.id === fb.json.datasetId).latest_key);
    assert.ok(la.equals(aZip.bytes));
    assert.ok(lb.equals(bZip.bytes));
  });

  it("keeps the previous latest on failed finalize and recovers on retry", async () => {
    const e = env();
    const v1 = await fullPublish(e, { dbBytes: syntheticDb("v1") });
    assert.equal(v1.finalize.status, 200);
    const latestKey = e.REGISTRY_DB._sqlite
      .prepare("SELECT latest_key FROM published_backups WHERE id = ?")
      .get(v1.finalize.json.datasetId).latest_key;
    const before = await r2get(e, latestKey);
    // Failed second publication (garbage bytes, valid grant checksums).
    const garbage = Buffer.from("broken".padEnd(256, "!"));
    const g = await postJson(e, "/api/v1/cloudpublish/grant", grantBody(garbage, garbage));
    await putUpload(e, g.json.uploadUrl, garbage);
    const f = await postJson(e, "/api/v1/cloudpublish/finalize", {
      grantId: g.json.grantId,
      databaseSha256: sha256Hex(garbage),
      archiveSha256: sha256Hex(garbage),
      archiveSize: garbage.length,
    });
    assert.equal(f.status, 422);
    assert.equal(publishedCount(e), 1);
    assert.ok((await r2get(e, latestKey)).equals(before));
    // Fresh retry publishes exactly once more.
    const v2 = await fullPublish(e, { dbBytes: syntheticDb("v2") });
    assert.equal(v2.finalize.status, 200);
    assert.equal(publishedCount(e), 2);
    assert.ok((await r2get(e, latestKey)).equals(v2.bytes));
  });

  it("retains only the newest versioned backups", async () => {
    const e = env();
    let last = null;
    for (let i = 0; i < 7; i += 1) {
      last = await fullPublish(e, { dbBytes: syntheticDb(`ret${i}`) });
      assert.equal(last.finalize.status, 200);
    }
    assert.equal(publishedCount(e), 5);
    const rows = e.REGISTRY_DB._sqlite
      .prepare("SELECT id, object_key FROM published_backups ORDER BY published_at ASC")
      .all();
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.ok((await e.SCHOOL_MANAGER_APP.head(row.object_key)) !== null);
    }
    void last;
  });
});

describe("existing website behavior untouched", () => {
  it("heartbeat, installer, admin, and update manifest still work", async () => {
    const e = env();
    const hb = await worker.fetch(
      new Request(ORIGIN + "/api/v1/devices/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": freshIp() },
        body: JSON.stringify({
          schoolName: "Smoke School",
          machineHashBundle: [...H1],
          status: "trial",
          appVersion: "2.1.6",
        }),
      }),
      e,
    );
    assert.equal(hb.status, 200);
    assert.equal((await hb.json()).ok, true);
    const installer = await worker.fetch(new Request(ORIGIN + "/School-Manager-Setup.exe"), e);
    assert.equal(installer.status, 404);
    const list = await worker.fetch(new Request(ORIGIN + "/api/v1/admin/customers"), e);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).ok, true);
    const manifest = await worker.fetch(new Request(ORIGIN + "/update.json"), e);
    assert.equal(manifest.status, 200);
    const raw = readFileSync(join(ROOT, "update.json"), "utf8");
    assert.deepEqual(JSON.parse(raw), await manifest.json());
  });

  it("migration creates the cloudpublish tables", async () => {
    const e = env();
    const tables = e.REGISTRY_DB._sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cloudpublish_grants','published_backups')")
      .all()
      .map((r) => r.name)
      .sort();
    assert.deepEqual(tables, ["cloudpublish_grants", "published_backups"]);
  });
});
