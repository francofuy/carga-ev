export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS vehicle (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  battery_kwh REAL NOT NULL,
  consumption_wh_km REAL NOT NULL,
  real_consumption_wh_km REAL,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location TEXT NOT NULL CHECK (location IN ('home','public')),
  start_at TEXT,
  end_at TEXT,
  kwh REAL NOT NULL,
  odometer_km REAL,
  price_per_kwh REAL,
  fixed_fee REAL,
  network TEXT,
  cost REAL NOT NULL,
  breakdown_valle_kwh REAL NOT NULL DEFAULT 0,
  breakdown_llano_kwh REAL NOT NULL DEFAULT 0,
  breakdown_punta_kwh REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_charges_created_at ON charges(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_charge (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('scheduled','live')),
  start_at TEXT NOT NULL,
  target_stop_at TEXT NOT NULL,
  start_pct REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const SETTINGS_KEYS = {
  tariffValle: 'tariff_valle',
  tariffLlano: 'tariff_llano',
  tariffPunta: 'tariff_punta',
  puntaStartHour: 'punta_start_hour',
  notifBackupEnabled: 'notif_backup_enabled',
  theme: 'theme',
  accentColor: 'accent_color',
  personalizacion: 'personalizacion',
  homeChargerAmps: 'home_charger_amps',
  homeChargerVolts: 'home_charger_volts',
  homeLat: 'home_lat',
  homeLng: 'home_lng',
} as const;
