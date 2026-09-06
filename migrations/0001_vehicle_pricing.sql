CREATE TABLE IF NOT EXISTS vehicle_pricing (
  vehicle_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base REAL NOT NULL CHECK (base >= 0),
  mileage REAL NOT NULL CHECK (mileage >= 0),
  international REAL NOT NULL CHECK (international >= 0),
  am_pm REAL NOT NULL CHECK (am_pm >= 0),
  weekend REAL NOT NULL CHECK (weekend >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_key TEXT NOT NULL,
  previous_values TEXT NOT NULL,
  new_values TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_attempts (
  client_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL
);

INSERT OR IGNORE INTO vehicle_pricing
  (vehicle_key, label, base, mileage, international, am_pm, weekend, updated_at)
VALUES
  ('car', 'Car', 50.00, 1.50, 45.00, 25.00, 25.00, datetime('now')),
  ('cargoVan', 'Cargo Van', 100.00, 1.90, 55.00, 35.00, 35.00, datetime('now')),
  ('tempConVan', 'Temperature Controlled Van', 160.00, 1.90, 55.00, 35.00, 35.00, datetime('now')),
  ('truck', 'Truck', 260.00, 3.00, 70.00, 50.00, 50.00, datetime('now'));

CREATE INDEX IF NOT EXISTS pricing_audit_changed_at_idx
  ON pricing_audit (changed_at);
