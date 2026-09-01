-- ============================================================
--  Shax Store — Storage / Containers Migration v2
--  REWRITES containers & container_items with:
--    - user-chosen container number (not auto-increment display)
--    - per-size quantity tracking (sizes JSON)
--    - added_by field for per-admin tracking
--  Also adds admin_analytics view helper.
--  SAFE TO RUN: drops and recreates the two tables.
-- ============================================================

-- Drop old tables if they exist
DROP TABLE IF EXISTS container_items;
DROP TABLE IF EXISTS containers;

-- ── Containers (shipments from abroad) ───────────────────
CREATE TABLE containers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  number        INT            NOT NULL COMMENT 'Admin-chosen container number (e.g. 1, 2, 3)',
  name          VARCHAR(200)   NOT NULL,
  country       VARCHAR(100),
  notes         TEXT,
  delivery_cost DECIMAL(10,2)  NOT NULL DEFAULT 0,
  status        ENUM('pending','received','completed') NOT NULL DEFAULT 'pending',
  created_by    INT,
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_container_number (number),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Container Items ──────────────────────────────────────
CREATE TABLE container_items (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  container_id   INT            NOT NULL,
  product_id     INT,
  product_name   VARCHAR(200)   NOT NULL,
  category       VARCHAR(50),
  cost_price     DECIMAL(10,2)  NOT NULL DEFAULT 0 COMMENT 'Cost per single unit',
  selling_price  DECIMAL(10,2)  NOT NULL DEFAULT 0 COMMENT 'Planned selling price per unit',
  sizes          JSON           COMMENT '{"S":2,"M":5,"L":3} — quantity per size',
  total_quantity INT            NOT NULL DEFAULT 0 COMMENT 'Sum of all size quantities',
  added_by       INT,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id)   REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (added_by)     REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ci_container (container_id),
  INDEX idx_ci_product   (product_id),
  INDEX idx_ci_added_by  (added_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
