-- ============================================================
--  Shax Store — Migration: Sponsor role + Profit tracking
--  Run this ONCE against an existing database that was created
--  before these features:
--      mysql -u root -p shaxstore < migrations/2026-06-sponsor-profit.sql
--
--  Safe to run on a populated database — it only ADDS columns and
--  backfills sensible defaults. Existing rows keep all their data.
-- ============================================================

USE shaxstore;

-- ── users.role ────────────────────────────────────────────
-- Adds a role column; existing admins (is_admin = 1) become 'admin',
-- everyone else stays 'customer'. is_admin is kept in sync for
-- backward compatibility with existing code/queries.
ALTER TABLE users
  ADD COLUMN role ENUM('customer','sponsor','admin')
      NOT NULL DEFAULT 'customer' AFTER password;

UPDATE users SET role = 'admin' WHERE is_admin = 1;

-- ── categories.owner_id ───────────────────────────────────
ALTER TABLE categories
  ADD COLUMN owner_id INT NULL AFTER icon,
  ADD CONSTRAINT fk_categories_owner
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── products: cost_price, profit, owner_id ────────────────
-- Existing products are treated as cost = current price, profit = 0
-- (the store wasn't tracking a margin before), so revenue still adds
-- up and historical profit shows as 0 until prices are edited.
ALTER TABLE products
  ADD COLUMN cost_price DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER price,
  ADD COLUMN profit     DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER cost_price,
  ADD COLUMN owner_id   INT NULL AFTER image_url,
  ADD CONSTRAINT fk_products_owner
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE products SET cost_price = price WHERE cost_price = 0;

-- ── order_items: unit_cost, unit_profit ───────────────────
-- Past order lines get cost = unit_price, profit = 0 so historical
-- revenue is unchanged and historical profit reads as 0.
ALTER TABLE order_items
  ADD COLUMN unit_cost   DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER unit_price,
  ADD COLUMN unit_profit DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER unit_cost;

UPDATE order_items SET unit_cost = unit_price WHERE unit_cost = 0;

-- ── Upgrade role enum to include super_admin (run if you already ran an
--    earlier version of this migration) ──────────────────────────────
ALTER TABLE users
  MODIFY COLUMN role ENUM('customer','sponsor','admin','super_admin')
  NOT NULL DEFAULT 'customer';

-- ── Order claiming (admin "takes" an order) ──────────────────────────
ALTER TABLE orders
  ADD COLUMN taken_by INT NULL,
  ADD COLUMN taken_by_name VARCHAR(150) NULL,
  ADD CONSTRAINT fk_orders_taken_by FOREIGN KEY (taken_by) REFERENCES users(id) ON DELETE SET NULL;
