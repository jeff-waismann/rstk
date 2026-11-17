ALTER TABLE rstk_orders ADD COLUMN customer_id TEXT;
ALTER TABLE rstk_orders ADD COLUMN customer_cnpj TEXT;
ALTER TABLE rstk_orders ADD COLUMN customer_name TEXT;
ALTER TABLE rstk_orders ADD COLUMN customer_email TEXT;
ALTER TABLE rstk_orders ADD COLUMN changes_json TEXT;
ALTER TABLE rstk_orders ADD COLUMN approved_at TIMESTAMP;
ALTER TABLE rstk_orders ADD COLUMN admin_notes TEXT;
CREATE INDEX IF NOT EXISTS idx_rstk_orders_customer ON rstk_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_rstk_orders_status ON rstk_orders(status);
