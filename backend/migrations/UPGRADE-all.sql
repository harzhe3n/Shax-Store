-- ============================================================
--  Shax Store — Complete "bring my database up to date" migration
--  SAFE TO RUN ANYTIME, even multiple times. It checks whether each
--  column/constraint already exists before adding it, so you'll never
--  get a "Duplicate column" error.
--
--  Run it with:
--    mysql -u root -p shaxstore < migrations/UPGRADE-all.sql
--  (on Windows:)
--    "C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe" -u root -p shaxstore < migrations\UPGRADE-all.sql
-- ============================================================

-- Helper: add a column only if it doesn't already exist.
DROP PROCEDURE IF EXISTS shax_add_col;
DELIMITER //
CREATE PROCEDURE shax_add_col(
  IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- ── Filters (admin-made tags; a product can have many) ────
CREATE TABLE IF NOT EXISTS filters (
  id         VARCHAR(50)  PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  name_ku    VARCHAR(100),
  name_ar    VARCHAR(100),
  image_url  VARCHAR(500),
  sort_order INT          DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_filters (
  product_id INT NOT NULL,
  filter_id  VARCHAR(50) NOT NULL,
  PRIMARY KEY (product_id, filter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── products: type_id kept for backward-compat (unused by filters) ─
CALL shax_add_col('products', 'type_id', 'type_id VARCHAR(50) NULL AFTER category');

-- ── users.role ────────────────────────────────────────────
CALL shax_add_col('users', 'role',
  "role ENUM('customer','sponsor','admin','super_admin') NOT NULL DEFAULT 'customer' AFTER password");
-- Make sure the enum includes super_admin even on older installs:
ALTER TABLE users
  MODIFY COLUMN role ENUM('customer','sponsor','admin','super_admin') NOT NULL DEFAULT 'customer';

-- ── categories.owner_id ───────────────────────────────────
CALL shax_add_col('categories', 'owner_id', 'owner_id INT NULL AFTER icon');

-- ── products: cost_price, profit, owner_id ────────────────
CALL shax_add_col('products', 'cost_price', 'cost_price DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER price');
CALL shax_add_col('products', 'profit',     'profit DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER cost_price');
CALL shax_add_col('products', 'shipping',   'shipping DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER profit');
CALL shax_add_col('products', 'owner_id',   'owner_id INT NULL AFTER image_url');

-- ── products: stock mode + quantity ───────────────────────
CALL shax_add_col('products', 'stock_mode', "stock_mode ENUM('hidden','count','out') NOT NULL DEFAULT 'hidden' AFTER in_stock");
CALL shax_add_col('products', 'stock_qty',  'stock_qty INT NOT NULL DEFAULT 0 AFTER stock_mode');
CALL shax_add_col('products', 'size_stock', 'size_stock JSON NULL AFTER stock_qty');
CALL shax_add_col('products', 'colors',     'colors JSON NULL AFTER size_stock');

-- ── order_items: unit_cost, unit_profit ───────────────────
CALL shax_add_col('order_items', 'unit_cost',   'unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER unit_price');
CALL shax_add_col('order_items', 'unit_profit', 'unit_profit DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER unit_cost');

-- ── orders: taken_by, taken_by_name (order claiming) ──────
CALL shax_add_col('orders', 'taken_by',      'taken_by INT NULL');
CALL shax_add_col('orders', 'taken_by_name', 'taken_by_name VARCHAR(150) NULL');

-- ── orders: latitude, longitude (optional shared location) ─
CALL shax_add_col('orders', 'latitude',  'latitude DECIMAL(10,7) NULL');
CALL shax_add_col('orders', 'longitude', 'longitude DECIMAL(10,7) NULL');

-- ── orders: shipping_total ────────────────────────────────
CALL shax_add_col('orders', 'shipping_total', 'shipping_total DECIMAL(10,2) NOT NULL DEFAULT 0');

-- ── Backfill sensible defaults for existing rows ──────────
UPDATE products    SET cost_price = price       WHERE cost_price = 0;
UPDATE order_items SET unit_cost  = unit_price  WHERE unit_cost  = 0;

-- Clean up the helper.
DROP PROCEDURE IF EXISTS shax_add_col;

SELECT 'Shax Store database is now up to date.' AS result;
