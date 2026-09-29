-- ইমেইলের মাধ্যমে পাসওয়ার্ড রিসেট + অ্যাডমিন সেশন সিস্টেম
-- চালানোর কমান্ড: npm run db:migrate:passwordreset

-- রিসেট টোকেন (শুধু SHA-256 হ্যাশ রাখা হয়, আসল টোকেন শুধু ইমেইলে যায়; একবার ব্যবহারযোগ্য, ৩০ মিনিটের মেয়াদ)
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,          -- 'customer' অথবা 'admin'
  customer_id INTEGER,                -- অ্যাডমিন টোকেনের ক্ষেত্রে NULL
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pr_customer ON password_resets(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pr_kind ON password_resets(kind, created_at);

-- রিসেটের পর অ্যাডমিনের নতুন পাসওয়ার্ড (হ্যাশ করা) এখানে থাকে; এই রো থাকলে ADMIN_KEY env আর কাজ করে না
CREATE TABLE IF NOT EXISTS admin_credentials (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  updated_at    TEXT
);

-- অ্যাডমিন লগইন সেশন (আসল কী আর ব্রাউজারে থাকে না, শুধু মেয়াদি টোকেন থাকে)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp ON admin_sessions(expires_at);

-- ইমেইল দিয়ে কাস্টমার খোঁজার জন্য
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON customers(lower(email));
