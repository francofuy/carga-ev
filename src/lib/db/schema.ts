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
} as const;
