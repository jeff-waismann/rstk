-- Migration: B2B Reseller Customer Portal, Authentication, and Order Linking

-- 1. Reseller Customers Table
CREATE TABLE IF NOT EXISTS rstk_customers (
  id TEXT PRIMARY KEY,
  cnpj TEXT UNIQUE NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  responsible_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending_verification',
  verification_token TEXT,
  email_verified_at TIMESTAMP,
  reset_token TEXT,
  reset_token_expires INTEGER,
  addresses_json TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rstk_customers_cnpj ON rstk_customers(cnpj);
CREATE INDEX IF NOT EXISTS idx_rstk_customers_email ON rstk_customers(email);
CREATE INDEX IF NOT EXISTS idx_rstk_customers_status ON rstk_customers(status);

-- 2. Customer Sessions Table
CREATE TABLE IF NOT EXISTS rstk_customer_sessions (
  token TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES rstk_customers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rstk_customer_sessions_customer ON rstk_customer_sessions(customer_id);

-- 3. Email Logs Table (Rule 6: Deliverability & audit backup)
CREATE TABLE IF NOT EXISTS rstk_email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  email_type TEXT NOT NULL,
  status TEXT DEFAULT 'logged',
  token TEXT,
  metadata_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rstk_email_logs_to ON rstk_email_logs(to_email);
