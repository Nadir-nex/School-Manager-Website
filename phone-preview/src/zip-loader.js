// ZIP + manifest validation. Mirrors the desktop cloud-backup.js contract:
// entries exactly ["database.sqlite", "backup-info.json"], STORE or
// deflated, manifest format "school-manager-cloud-backup" v1,
// schemaVersion <= 7, sha256/size match, no photos, no traversal.
// Works in browsers (fflate ESM) and in node (same package).
import { unzipSync } from "fflate";

export const EXPECTED_FILES = ["database.sqlite", "backup-info.json"];
export const BACKUP_FORMAT = "school-manager-cloud-backup";
export const SUPPORTED_FORMAT_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSION = 7; // mirrors DB.CORE_SCHEMA_VERSION
export const MAX_ENTRIES = 8; // mirrors desktop MAX_CLOUD_BACKUP_ENTRIES
export const MAX_BYTES = 256 * 1024 * 1024; // mirrors desktop MAX_CLOUD_BACKUP_BYTES

const HEX64 = /^[0-9a-f]{64}$/;

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function checkEntryName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 256) fail("bad-entry", "empty name");
  if (name.includes("..") || name.startsWith("/") || name.startsWith("\\") || /[\\]/.test(name)) {
    fail("bad-entry", `unsafe name: ${name.slice(0, 60)}`);
  }
  if (/[\x00-\x1f\x7f]/.test(name)) fail("bad-entry", "control characters");
}

/**
 * Validate a backup ZIP and return { dbBytes, manifest }.
 * Throws with error.code on any problem. Never extracts photos:
 * any photos/ entry is rejected before use.
 */
export async function loadBackupZip(zipBytes) {
  const bytes = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes || []);
  if (bytes.length === 0) fail("empty-archive", "no data");
  if (bytes.length > MAX_BYTES) fail("too-large", `${bytes.length} bytes`);

  // A ZIP must end with an end-of-central-directory record (PK\x05\x06).
  // Checking first turns garbage/truncated input into malformed-archive
  // instead of a misleading missing-file error.
  let hasEocd = false;
  const scanFrom = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= scanFrom; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      hasEocd = true;
      break;
    }
  }
  if (!hasEocd) fail("malformed-archive", "no end-of-central-directory record");

  let entries;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        checkEntryName(file.name);
        return true;
      }
    });
  } catch (error) {
    if (error && error.code) throw error;
    fail("malformed-archive", String((error && error.message) || error).slice(0, 120));
  }

  const names = Object.keys(entries).sort();
  if (names.length > MAX_ENTRIES) fail("too-many-entries", String(names.length));
  for (const name of names) {
    if (name.startsWith("photos/")) fail("photos-not-allowed", "photo entries are never loaded");
    if (!EXPECTED_FILES.includes(name)) fail("unexpected-file", name.slice(0, 80));
  }
  for (const name of EXPECTED_FILES) {
    if (!entries[name]) fail("missing-file", name);
  }

  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(entries["backup-info.json"]));
  } catch {
    fail("bad-manifest", "backup-info.json is not valid JSON");
  }
  if (!manifest || typeof manifest !== "object") fail("bad-manifest", "not an object");
  if (manifest.format !== BACKUP_FORMAT) fail("unsupported-format", String(manifest.format).slice(0, 60));
  if (manifest.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    fail("unsupported-version", `formatVersion ${String(manifest.formatVersion).slice(0, 20)}`);
  }
  const schemaVersion = manifest.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    fail("unsupported-schema", `schemaVersion ${String(schemaVersion).slice(0, 20)}`);
  }
  if (manifest.includesPhotos !== false) fail("photos-not-allowed", "manifest allows photos");
  if (JSON.stringify([...(manifest.files || [])].sort()) !== JSON.stringify([...EXPECTED_FILES].sort())) {
    fail("bad-manifest", "files list mismatch");
  }

  const dbBytes = entries["database.sqlite"];
  const info = manifest.database || {};
  if (info.file !== "database.sqlite") fail("bad-manifest", "database.file mismatch");
  if (info.size !== dbBytes.length) fail("checksum-mismatch", `size ${dbBytes.length} != ${info.size}`);
  if (!HEX64.test(String(info.sha256 || ""))) fail("bad-manifest", "sha256 shape");
  if ((await sha256Hex(dbBytes)) !== info.sha256) fail("checksum-mismatch", "sha256 differs");

  // SQLite magic, checked before handing bytes to the SQL engine.
  const magic = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
  if (dbBytes.length < 100 || !magic.every((b, i) => dbBytes[i] === b)) {
    fail("not-a-database", "missing SQLite header");
  }

  return { dbBytes, manifest };
}
