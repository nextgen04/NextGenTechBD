PRAGMA foreign_keys = ON;

-- ================= ক্যাটাগরি =================
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_en    TEXT,
  e          TEXT,
  img        TEXT,
  sort_order INTEGER DEFAULT 0
);

-- ================= প্রোডাক্ট =================
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cat        TEXT NOT NULL,
  name       TEXT NOT NULL,
  name_en    TEXT,
  price      INTEGER NOT NULL,
  old        INTEGER,
  e          TEXT,
  img        TEXT,
  r          REAL,
  rv         INTEGER,
  sold       INTEGER,
  tag        TEXT,
  f          INTEGER DEFAULT 0,
  colors     TEXT,
  sizes      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ================= সেটিংস =================
CREATE TABLE IF NOT EXISTS settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  phone    TEXT,
  whatsapp TEXT,
  telegram TEXT,
  facebook TEXT,
  email    TEXT,
  bkash    TEXT,
  nagad    TEXT,
  rocket   TEXT,
  cod      INTEGER DEFAULT 1
);

-- ================= গ্রাহক লগইন সিস্টেম =================
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token       TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ================= অর্ডার =================
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no     TEXT UNIQUE NOT NULL,
  customer_id  INTEGER,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  address      TEXT NOT NULL,
  district     TEXT,
  payment      TEXT,
  note         TEXT,
  items        TEXT NOT NULL,
  subtotal     INTEGER NOT NULL,
  delivery_fee INTEGER DEFAULT 0,
  total        INTEGER NOT NULL,
  status       TEXT DEFAULT 'pending',
  created_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ================= ইনডেক্স =================
CREATE INDEX IF NOT EXISTS idx_products_cat     ON products(cat);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created   ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer  ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone     ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON customer_sessions(expires_at);
