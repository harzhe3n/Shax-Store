-- ============================================================
--  Shax Store — Database Schema v3
--  Run: mysql -u root -p < database.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS shaxstore
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE shaxstore;

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  password   VARCHAR(255)  NOT NULL,
  role       ENUM('customer','sponsor','admin','super_admin') NOT NULL DEFAULT 'customer',
  is_admin   TINYINT(1)    NOT NULL DEFAULT 0,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Categories ────────────────────────────────────────────
-- Fully admin-editable. A default "Other Stores" category is
-- created by `npm run seed` — see seed.js. No categories are
-- hardcoded anywhere in the frontend or backend code.
CREATE TABLE IF NOT EXISTS categories (
  id         VARCHAR(50)  PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  name_ku    VARCHAR(100),
  name_ar    VARCHAR(100),
  image_url  VARCHAR(500),
  icon       VARCHAR(10),
  owner_id   INT,
  sort_order INT          DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Filters ───────────────────────────────────────────────
-- Admin-made tags (Summer, Sale, New…). A product can have MANY filters
-- via the product_filters join table. Customers tap filters to narrow.
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
  PRIMARY KEY (product_id, filter_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (filter_id)  REFERENCES filters(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Products ──────────────────────────────────────────────
-- Fully admin-editable. No products are hardcoded anywhere in
-- the frontend or backend code — the storefront starts empty
-- until the admin adds products through the Admin Panel.
CREATE TABLE IF NOT EXISTS products (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(200)    NOT NULL,
  name_ku        VARCHAR(200),
  name_ar        VARCHAR(200),
  category       VARCHAR(50)     NOT NULL,
  type_id        VARCHAR(50),
  price          DECIMAL(10, 2)  NOT NULL,
  cost_price     DECIMAL(10, 2)  NOT NULL DEFAULT 0,
  profit         DECIMAL(10, 2)  NOT NULL DEFAULT 0,
  shipping       DECIMAL(10, 2)  NOT NULL DEFAULT 0,
  old_price      DECIMAL(10, 2),
  badge          VARCHAR(50),
  description    TEXT,
  description_ku TEXT,
  description_ar TEXT,
  sizes          JSON,
  in_stock       TINYINT(1)      NOT NULL DEFAULT 1,
  stock_mode     ENUM('hidden','count','out') NOT NULL DEFAULT 'hidden',
  stock_qty      INT             NOT NULL DEFAULT 0,
  size_stock     JSON,
  colors         JSON,
  image_url      VARCHAR(500),
  owner_id       INT,
  created_at     TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            VARCHAR(30)     PRIMARY KEY,
  user_id       INT,
  customer_name VARCHAR(150)    NOT NULL,
  email         VARCHAR(150)    NOT NULL,
  phone         VARCHAR(30)     NOT NULL,
  city          VARCHAR(100),
  address       TEXT            NOT NULL,
  note          TEXT,
  total         DECIMAL(10, 2)  NOT NULL,
  shipping_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status        ENUM('pending','processing','shipped','delivered','cancelled')
                                NOT NULL DEFAULT 'pending',
  taken_by      INT,
  taken_by_name VARCHAR(150),
  latitude      DECIMAL(10, 7),
  longitude     DECIMAL(10, 7),
  created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (taken_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Order Items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     VARCHAR(30)    NOT NULL,
  product_id   INT,
  product_name VARCHAR(200)   NOT NULL,
  size         VARCHAR(20),
  color        VARCHAR(50),
  quantity     INT            NOT NULL,
  unit_price   DECIMAL(10,2)  NOT NULL,
  unit_cost    DECIMAL(10,2)  NOT NULL DEFAULT 0,
  unit_profit  DECIMAL(10,2)  NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Reviews ───────────────────────────────────────────────
-- One review per user per product (re-submitting updates it).
-- Ratings are 0–5 stars, with an optional text comment.
CREATE TABLE IF NOT EXISTS reviews (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT          NOT NULL,
  user_id    INT          NOT NULL,
  user_name  VARCHAR(100) NOT NULL,
  rating     TINYINT      NOT NULL,
  comment    TEXT,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  UNIQUE KEY uniq_user_product (product_id, user_id),
  CONSTRAINT chk_rating CHECK (rating BETWEEN 0 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Settings (Telegram config, etc.) ─────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key_name   VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_in_stock  ON products(in_stock);
CREATE INDEX idx_orders_email       ON orders(email);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_user        ON orders(user_id);
CREATE INDEX idx_orders_created     ON orders(created_at);
CREATE INDEX idx_reviews_product    ON reviews(product_id);
CREATE INDEX idx_reviews_user       ON reviews(user_id);
