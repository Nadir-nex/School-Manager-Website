// Data-provider boundary. The UI only talks to a provider; it never
// touches fetch URLs, credentials, or token logic directly.
//
// - DemoZipProvider(url): implemented now. Loads a local synthetic ZIP
//   (demo mode). Takes bytes, nothing else.
// - CloudBackupProvider: INTEGRATION POINT, not implemented. A future
//   provider must implement `load()` returning validated
//   { dbBytes, manifest } for the authenticated school: request a
//   short-lived download grant from the Worker, fetch the ZIP, then run
//   the SAME loadBackupZip() validation. No endpoints are invented here;
//   no activation codes, machine hashes, keys, tokens, or signed URLs
//   belong in this application.
import { loadBackupZip } from "./zip-loader.js";

export async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw Object.assign(new Error(`download failed: HTTP ${response.status}`), { code: "download-failed" });
  return new Uint8Array(await response.arrayBuffer());
}

export function createDemoZipProvider(demoUrl) {
  return {
    kind: "demo",
    async load() {
      const bytes = await fetchBytes(demoUrl);
      return loadBackupZip(bytes);
    }
  };
}

export function createCloudBackupProvider() {
  return {
    kind: "cloud",
    async load() {
      // Future integration point: authenticated download goes here.
      // Required before use: latest-backup lookup, school-scoped
      // short-lived download grant, revocation check, publishedAt
      // reporting (see PHASE-0-REPORT.md §5). Until then, fail loudly
      // instead of guessing endpoints or credentials.
      throw Object.assign(new Error("cloud provider not configured"), { code: "cloud-not-configured" });
    }
  };
}
