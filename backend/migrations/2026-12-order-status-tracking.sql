-- ============================================================
--  Shax Store — Order Status Tracking Migration
--  SAFE TO RUN ANYTIME (idempotent). Creates the order-status
--  history table used by the customer tracking timeline and
--  back-fills the current status of any existing orders so their
--  tracking view isn't empty. Does not modify or drop any
--  existing tables/data.
--
--  order_status_log : one row per status change, oldest first.
--
--  Design:
--   - Rows are written whenever an order's status actually changes
--     (admin updates, plus the 'pending' row recorded at placement).
--   - A row is deleted automatically with its order (cascade), so
--     hard-deleted orders leave no orphaned history.
--   - changed_by_id is nullable and set by the server from the
--     authenticated JWT (never from client input).
-- ============================================================

CREATE TABLE IF NOT EXISTS order_status_log (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_id        VARCHAR(30)   NOT NULL,
  status          ENUM('pending','processing','shipped','delivered','cancelled') NOT NULL,
  changed_by_id   INT           NULL,
  changed_by_name VARCHAR(150)  NULL,
  note            VARCHAR(255)  NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  KEY idx_osl_order_time (order_id, created_at),
  CONSTRAINT fk_osl_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_osl_user  FOREIGN KEY (changed_by_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Back-fill the current status of existing orders (idempotent —
-- only rows that have no history entry yet are inserted).
INSERT INTO order_status_log (order_id, status, changed_by_name, note)
SELECT o.id, o.status, 'system', 'Initial status'
FROM orders o
LEFT JOIN order_status_log l ON l.order_id = o.id
WHERE l.id IS NULL;