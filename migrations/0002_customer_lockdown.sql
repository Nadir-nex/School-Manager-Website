-- Customer-level lockdown (administrative state, separate from license state).
-- lockdown = 1  => all of the customer's devices receive status "locked" on heartbeat.
-- lockdown = 0  => normal license-derived heartbeat status.
-- The NOT NULL DEFAULT 0 keeps every pre-existing customer unlocked automatically.
-- License columns (customers.status, devices.license_state) are intentionally untouched:
-- they keep mirroring the last device-reported license state.
-- Apply with: wrangler d1 migrations apply school-manager-registry

ALTER TABLE customers ADD COLUMN lockdown INTEGER NOT NULL DEFAULT 0
  CHECK (lockdown IN (0, 1));
