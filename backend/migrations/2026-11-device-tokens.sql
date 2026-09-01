-- ============================================================
--  Shax Store — Native Push Device Tokens Migration
--  SAFE TO RUN ANYTIME (idempotent). Creates the native push
--  device-token table if it doesn't exist. Does not modify or
--  drop any existing tables/data.
--
--  device_tokens         : one row per device FCM/APNs token.
--
--  Design:
--   - A row is owned by exactly ONE user (user_id comes from the
--     authenticated JWT on the server — clients never supply it).
--   - token is UNIQUE across the table, so a device moving to a
--     different account simply re-associates that single row.
--   - is_active flags invalid/dead tokens so fan-out stops wasting
--     sends (soft expiry) while the in-app notification remains the
--     source of truth.
--   - account isolation on logout: unregister scopes by user_id AND
--     token, so one account can never reach another's devices.
-- ============================================================

CREATE TABLE IF NOT EXISTS device_tokens (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT          NOT NULL,
  platform          ENUM('android','ios') NOT NULL DEFAULT 'android',
  token             VARCHAR(512) NOT NULL,
  device_identifier VARCHAR(128) NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_device_token (token),
  KEY idx_token_user_active (user_id, is_active),
  CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;