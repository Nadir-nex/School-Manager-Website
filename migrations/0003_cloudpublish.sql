-- Cloud Publish upload grants + published backup metadata (D1 / SQLite).
-- Reuses the existing REGISTRY_DB (customers/devices); no new database.
-- Grants are short-lived (<= 15 min), single-use, and bound to the
-- authorized customer/device plus the expected archive metadata.
-- Published backups are customer-scoped; promotion happens only after
-- full ZIP + manifest validation in the finalize path.
-- Apply with: wrangler d1 migrations apply school-manager-registry
-- (see wrangler.jsonc for the binding name REGISTRY_DB).

CREATE TABLE IF NOT EXISTS cloudpublish_grants (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  -- SHA-256 hex of the random upload token. The token itself travels only
  -- inside the grant uploadUrl and is never stored or logged.
  upload_token_sha256 TEXT NOT NULL,
  -- Server-generated R2 keys. Staging is per-grant; published_key is the
  -- stable customer-scoped pointer rewritten only on successful finalize.
  staging_key TEXT NOT NULL,
  published_key TEXT NOT NULL,
  protocol_version INTEGER NOT NULL,
  format_version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  app_version TEXT,
  -- Desktop license vocabulary ("licensed" | "trial"); see cloudpublish.js.
  license_state TEXT NOT NULL,
  -- 1 when an SMLIC2/SMLIC1 Ed25519 signature was verified server-side,
  -- 0 for trial (device-bound) grants. Never trust client license claims.
  license_verified INTEGER NOT NULL DEFAULT 0 CHECK (license_verified IN (0, 1)),
  database_sha256 TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL,
  archive_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'granted'
    CHECK (status IN ('granted', 'uploaded', 'consumed', 'failed', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  uploaded_at INTEGER,
  finalized_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_grants_customer ON cloudpublish_grants(customer_id);
CREATE INDEX IF NOT EXISTS idx_grants_expires ON cloudpublish_grants(expires_at);
CREATE INDEX IF NOT EXISTS idx_grants_status ON cloudpublish_grants(status);

CREATE TABLE IF NOT EXISTS published_backups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  grant_id TEXT NOT NULL REFERENCES cloudpublish_grants(id),
  -- Immutable versioned object key holding the validated bytes.
  object_key TEXT NOT NULL,
  -- Stable pointer key rewritten only after successful validation.
  latest_key TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL,
  archive_size INTEGER NOT NULL,
  database_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  published_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_published_customer ON published_backups(customer_id, published_at DESC);
