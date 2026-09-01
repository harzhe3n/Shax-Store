-- ============================================================
--  Shax Store — Sponsor Features Migration
--  - Adds telegram_chat_id to users (for sponsor-specific Telegram)
--  - Adds sponsor_commission_pct to settings (configurable, default 20)
-- ============================================================

-- Sponsor Telegram chat ID (same bot, different chat per sponsor)
ALTER TABLE users
  ADD COLUMN telegram_chat_id VARCHAR(50) NULL DEFAULT NULL;

-- Configurable commission percentage (super admin can edit)
INSERT IGNORE INTO settings (key_name, value)
VALUES ('sponsor_commission_pct', '20');
