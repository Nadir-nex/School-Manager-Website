-- School Manager customer/device registry (D1 / SQLite).
-- One customer may eventually own many devices: devices.customer_id -> customers.id.
-- Apply with: wrangler d1 migrations apply school-manager-registry
-- (see wrangler.jsonc for the binding name REGISTRY_DB).

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  school_name TEXT,
  phone TEXT,
  address TEXT,
  email TEXT,
  notes TEXT,
  -- 'suspended' is reserved for the future remote-lock system.
  -- Desktop heartbeats may only ever write activated | trial | suspended_trial.
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('activated', 'trial', 'suspended_trial', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  -- SHA-256 hex of sorted(machineHashBundle).join("|"). UNIQUE => idempotent heartbeat.
  device_key TEXT NOT NULL UNIQUE,
  machine_h1 TEXT NOT NULL,
  machine_h2 TEXT NOT NULL,
  machine_h3 TEXT NOT NULL,
  app_version TEXT,
  -- Latest state reported by this device. 'suspended' reserved for future server control.
  license_state TEXT NOT NULL DEFAULT 'trial'
    CHECK (license_state IN ('activated', 'trial', 'suspended_trial', 'suspended')),
  -- Latest-only server-observed IP. Never used for identity. Nullable.
  server_ip TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  -- Reserved for future device-replacement chains. Unused in V1.
  replaced_by TEXT
);

-- §32: indexes needed for heartbeat lookups.
CREATE INDEX IF NOT EXISTS idx_customers_school_name ON customers(school_name);
CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices(customer_id);
CREATE INDEX IF NOT EXISTS idx_devices_h1 ON devices(machine_h1);
CREATE INDEX IF NOT EXISTS idx_devices_h2 ON devices(machine_h2);
CREATE INDEX IF NOT EXISTS idx_devices_h3 ON devices(machine_h3);
