ALTER TABLE vehicle_pricing ADD COLUMN holiday REAL NOT NULL DEFAULT 50.00 CHECK (holiday >= 0);
ALTER TABLE vehicle_pricing ADD COLUMN additional_stop REAL NOT NULL DEFAULT 0.00 CHECK (additional_stop >= 0);
ALTER TABLE vehicle_pricing ADD COLUMN wait_minute REAL NOT NULL DEFAULT 0.00 CHECK (wait_minute >= 0);
ALTER TABLE vehicle_pricing ADD COLUMN pallet_jack REAL NOT NULL DEFAULT 20.00 CHECK (pallet_jack >= 0);
ALTER TABLE vehicle_pricing ADD COLUMN second_man_mile REAL NOT NULL DEFAULT 1.00 CHECK (second_man_mile >= 0);
ALTER TABLE vehicle_pricing ADD COLUMN pick_hold REAL NOT NULL DEFAULT 0.00 CHECK (pick_hold >= 0);
ALTER TABLE vehicle_pricing ADD COLUMN hazmat REAL NOT NULL DEFAULT 35.00 CHECK (hazmat >= 0);

CREATE TABLE IF NOT EXISTS pricing_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value REAL NOT NULL CHECK (setting_value >= 0),
  updated_at TEXT NOT NULL
);

INSERT INTO pricing_settings (setting_key, setting_value, updated_at)
VALUES ('fuel_surcharge_percent', 34.00, datetime('now'))
ON CONFLICT(setting_key) DO UPDATE SET
  setting_value = excluded.setting_value,
  updated_at = excluded.updated_at;

UPDATE vehicle_pricing
SET base = 50.00,
    mileage = 1.60,
    international = 25.00,
    am_pm = 25.00,
    weekend = 25.00,
    holiday = 50.00,
    additional_stop = 25.00,
    wait_minute = 0.75,
    pallet_jack = 20.00,
    second_man_mile = 1.00,
    pick_hold = 50.00,
    hazmat = 35.00,
    updated_at = datetime('now')
WHERE vehicle_key = 'car';

UPDATE vehicle_pricing
SET base = 100.00,
    mileage = 2.00,
    international = 25.00,
    am_pm = 30.00,
    weekend = 30.00,
    holiday = 50.00,
    additional_stop = 35.00,
    wait_minute = 0.75,
    pallet_jack = 20.00,
    second_man_mile = 1.00,
    pick_hold = 100.00,
    hazmat = 35.00,
    updated_at = datetime('now')
WHERE vehicle_key = 'cargoVan';

UPDATE vehicle_pricing
SET base = 260.00,
    mileage = 3.00,
    international = 25.00,
    am_pm = 50.00,
    weekend = 55.00,
    holiday = 50.00,
    additional_stop = 50.00,
    wait_minute = 0.90,
    pallet_jack = 20.00,
    second_man_mile = 1.00,
    pick_hold = 260.00,
    hazmat = 35.00,
    updated_at = datetime('now')
WHERE vehicle_key IN ('tempConVan', 'truck');
