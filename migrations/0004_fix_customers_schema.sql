-- Fix rstk_customers and rstk_customer_sessions schema
DROP TABLE IF EXISTS rstk_customer_sessions;
DROP TABLE IF EXISTS rstk_customers;

CREATE TABLE rstk_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj TEXT UNIQUE NOT NULL,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  ie TEXT,
  inscricao_estadual TEXT,
  ie_isento INTEGER DEFAULT 0,
  responsavel_nome TEXT NOT NULL,
  responsible_name TEXT,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  addresses_json TEXT,
  status TEXT DEFAULT 'active',
  email_verified INTEGER DEFAULT 0,
  email_verified_at TIMESTAMP,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires INTEGER,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rstk_customers_cnpj ON rstk_customers(cnpj);
CREATE INDEX idx_rstk_customers_email ON rstk_customers(email);

CREATE TABLE rstk_customer_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rstk_customer_sessions_token ON rstk_customer_sessions(token);
CREATE INDEX idx_rstk_customer_sessions_cust ON rstk_customer_sessions(customer_id);
