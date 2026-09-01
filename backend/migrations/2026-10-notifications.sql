-- ============================================================
--  Shax Store — Notifications Foundation Migration v1
--  SAFE TO RUN ANYTIME (idempotent). Creates the notification
--  system tables if they don't already exist. Does not modify or
--  drop any existing tables/data.
--
--  notifications              : the notification content itself
--  notification_recipients    : per-user read state only
--
--  Scalable broadcast design:
--  A notification targets either "all", a role, or one user. We do
--  NOT pre-insert a recipient row per user for broadcasts (that
--  would blow up as the user base grows). Instead a row is only
--  written to notification_recipients when a user actually reads /
--  marks it, storing their read state. A user "sees" a notification
--  when its audience matches them; it is "unread" when no recipient
--  row exists for them yet (or that row has is_read = 0).
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(200)   NOT NULL,
  message        TEXT           NOT NULL,
  type           ENUM('general','product','category','order','account','promotion','system')
                                 NOT NULL DEFAULT 'general',
  audience       ENUM('all','role','user') NOT NULL DEFAULT 'all',
  target_role    ENUM('customer','sponsor','admin','super_admin') NULL,
  target_user_id INT            NULL,
  sender_id      INT            NULL,
  link           VARCHAR(500)   NULL,
  metadata       JSON           NULL,
  expires_at     TIMESTAMP      NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_type    (type),
  KEY idx_notif_aud     (audience, target_role),
  KEY idx_notif_user    (target_user_id),
  KEY idx_notif_created (created_at),
  CONSTRAINT fk_notif_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_notif_user   FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_recipients (
  notification_id INT          NOT NULL,
  user_id         INT          NOT NULL,
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  read_at         TIMESTAMP    NULL,
  PRIMARY KEY (notification_id, user_id),
  KEY idx_rec_user_read (user_id, is_read),
  CONSTRAINT fk_rec_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_rec_user         FOREIGN KEY (user_id)         REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
