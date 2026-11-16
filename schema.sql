-- ============================================================================
-- CLOUDFLARE D1 DATABASE SCHEMA - RSTK CATÁLOGO (AGILE ADMIN + ASTRO)
-- Prefixo rstk_ para coexistência segura no banco smartweb-db
-- ============================================================================

-- 1. Configurações e Textos Estruturados do Site (Key-Value JSON)
CREATE TABLE IF NOT EXISTS rstk_site_content (
  section_key TEXT PRIMARY KEY,
  content_json TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Catálogo de Vinis (Preços armazenados em centavos inteiros)
CREATE TABLE IF NOT EXISTS rstk_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  source_title TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  media TEXT NOT NULL DEFAULT 'LP',
  release_date TEXT NOT NULL DEFAULT '2026-01-01',
  genre TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  external_source TEXT DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 18999,
  stock INTEGER NOT NULL DEFAULT 30,
  active INTEGER NOT NULL DEFAULT 1,
  featured_hero INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Biblioteca de Mídias (Sincronizada com Cloudflare R2)
CREATE TABLE IF NOT EXISTS rstk_media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Usuários Administrativos
CREATE TABLE IF NOT EXISTS rstk_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Sessões Ativas do Painel Admin (HttpOnly Cookie Auth)
CREATE TABLE IF NOT EXISTS rstk_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Controle de Rate-Limit no Login
CREATE TABLE IF NOT EXISTS rstk_login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- 7. Registro de Pedidos (Disparados via WhatsApp & Checkout)
CREATE TABLE IF NOT EXISTS rstk_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  items_json TEXT NOT NULL,
  total_cents INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'whatsapp_aberto', -- 'whatsapp_aberto', 'confirmado', 'concluido', 'cancelado'
  origin TEXT DEFAULT 'whatsapp_catalog',
  user_agent TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices de Otimização
CREATE INDEX IF NOT EXISTS idx_rstk_products_active ON rstk_products(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_rstk_products_genre ON rstk_products(genre);
CREATE INDEX IF NOT EXISTS idx_rstk_media_created ON rstk_media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rstk_sessions_expires ON rstk_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_rstk_orders_created ON rstk_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rstk_orders_status ON rstk_orders(status);
