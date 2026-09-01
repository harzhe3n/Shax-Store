'use strict';
/**
 * Shax Store — Notifications Service
 *
 * Core notification foundation used by the API routes. Handles
 * creation (admin broadcast) and per-user retrieval/read-state.
 *
 * Model (see migrations/2026-10-notifications.sql):
 *  - notifications:           the notification content + its audience.
 *  - notification_recipients: per-user read state ONLY.
 *
 * Scalable broadcast design: a notification is addressed to "all",
 * "role" or a single "user" via columns on the notifications row.
 * We never pre-insert a recipient row per user for a broadcast.
 * Instead, notification_recipients only stores a row once a user
 * marks a notification read, so read state is tracked without
 * duplicating notification data across every user.
 */

const db = require('../config/db');

const VALID_TYPES   = ['general', 'product', 'category', 'order', 'account', 'promotion', 'system'];
const VALID_AUDIENCES = ['all', 'role', 'user'];
const VALID_ROLES   = ['customer', 'sponsor', 'admin', 'super_admin'];

/**
 * Validate and normalise a notification payload.
 * Returns { ok: true, data } or { ok: false, error, status }.
 */
function validateNotificationInput(input) {
  const {
    title, message, type = 'general', audience = 'all',
    targetRole = null, targetUserId = null, link = null,
    metadata = null, expiresAt = null
  } = input || {};

  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, status: 400, error: 'title is required.' };
  }
  if (!title.trim() || title.trim().length > 200) {
    return { ok: false, status: 400, error: 'title must be 1–200 characters.' };
  }
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, status: 400, error: 'message is required.' };
  }
  if (message.length > 5000) {
    return { ok: false, status: 400, error: 'message is too long (5000 character limit).' };
  }
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, status: 400, error: `Invalid notification type. Must be one of: ${VALID_TYPES.join(', ')}` };
  }
  if (!VALID_AUDIENCES.includes(audience)) {
    return { ok: false, status: 400, error: `Invalid audience. Must be one of: ${VALID_AUDIENCES.join(', ')}` };
  }
  if (audience === 'role' && !VALID_ROLES.includes(targetRole)) {
    return { ok: false, status: 400, error: 'A valid targetRole is required when audience is "role".' };
  }
  if (audience === 'user' && !targetUserId) {
    return { ok: false, status: 400, error: 'A targetUserId is required when audience is "user".' };
  }
  // Normalise: only the audience-appropriate targeting field is kept.
  const finalTargetRole   = (audience === 'role') ? targetRole : null;
  const finalTargetUserId = (audience === 'user') ? targetUserId : null;

  let meta = null;
  if (metadata !== null && metadata !== undefined) {
    if (metadata && (typeof metadata !== 'object' || Array.isArray(metadata))) {
      return { ok: false, status: 400, error: 'metadata must be a JSON object or null.' };
    }
    try { meta = JSON.stringify(metadata); } catch {
      return { ok: false, status: 400, error: 'metadata is not valid JSON.' };
    }
  }

  if (link && (typeof link !== 'string' || link.length > 500)) {
    return { ok: false, status: 400, error: 'link must be a string up to 500 characters.' };
  }

  let expires = null;
  if (expiresAt) {
    const t = Date.parse(expiresAt);
    if (isNaN(t)) return { ok: false, status: 400, error: 'expiresAt is not a valid date.' };
    expires = new Date(t);
  }

  return {
    ok: true,
    data: {
      title: title.trim(),
      message: message.trim(),
      type,
      audience,
      targetRole: finalTargetRole,
      targetUserId: finalTargetUserId,
      link: link || null,
      metadata: meta,
      expiresAt: expires
    }
  };
}

/**
 * Create a notification. Returns the inserted notification.
 */
async function createNotification({ title, message, type, audience, targetRole, targetUserId, senderId, link, metadata, expiresAt }) {
  const [result] = await db.execute(
    `INSERT INTO notifications
       (title, message, type, audience, target_role, target_user_id, sender_id, link, metadata, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      title, message, type, audience,
      targetRole   == null ? null : targetRole,
      targetUserId == null ? null : targetUserId,
      senderId     == null ? null : senderId,
      link         == null ? null : link,
      metadata     == null ? null : metadata,
      expiresAt    == null ? null : expiresAt
    ]
  );
  const [rows] = await db.execute(
    'SELECT * FROM notifications WHERE id = ?', [result.insertId]
  );
  return rows[0];
}

/**
 * Build the SQL fragment describing which notifications a user "sees".
 * A user sees a notification if:
 *   - audience = 'all',                                OR
 *   - audience = 'role' and target_role = user role,   OR
 *   - audience = 'user' and target_user_id = user id.
 * Not-yet-expired rows only.
 */
function visibilityWhere() {
  return `(
    n.audience = 'all'
    OR (n.audience = 'role' AND n.target_role = ?)
    OR (n.audience = 'user' AND n.target_user_id = ?)
  )
  AND (n.expires_at IS NULL OR n.expires_at > NOW())`;
}

/**
 * Get notifications visible to a user, newest first, with read state.
 * @param {{id:number, role:string}} user
 * @param {{limit?:number, offset?:number, unreadOnly?:boolean}} [opts]
 */
async function getUserNotifications(user, opts = {}) {
  const role = user.role || (user.isAdmin ? 'admin' : 'customer');
  const limit  = Math.min(Math.max(parseInt(opts.limit) || 50, 1), 100);
  const offset = Math.max(parseInt(opts.offset) || 0, 0);

  let extra = '';
  if (opts.unreadOnly) extra = ' AND COALESCE(r.is_read,0) = 0';

  /* limit/offset are pre-sanitised integers, so they're safe to inline
     (MySQL prepared statements don't accept placeholders for LIMIT/OFFSET). */
  const [rows] = await db.execute(
    `SELECT n.id, n.title, n.message, n.type, n.link, n.metadata, n.created_at,
            COALESCE(r.is_read,0) AS is_read, r.read_at
     FROM notifications n
     LEFT JOIN notification_recipients r
       ON r.notification_id = n.id AND r.user_id = ?
     WHERE ${visibilityWhere()}
     ${extra}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [user.id, role, user.id]
  );

  return rows.map(toPublicNotification);
}

/**
 * Count notifications visible to a user, with an unread/read split.
 */
async function getUserNotificationCounts(user) {
  const role = user.role || (user.isAdmin ? 'admin' : 'customer');
  const [rows] = await db.execute(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN COALESCE(r.is_read,0) = 0 THEN 1 ELSE 0 END),0) AS unread
     FROM notifications n
     LEFT JOIN notification_recipients r
       ON r.notification_id = n.id AND r.user_id = ?
     WHERE ${visibilityWhere()}`,
    [user.id, role, user.id]
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    unread: Number(row.unread) || 0
  };
}

/**
 * Mark a single notification read — but ONLY if it is visible to the user.
 * Returns true if a notification was found & marked (or already read).
 */
async function markNotificationRead(notificationId, user) {
  const role = user.role || (user.isAdmin ? 'admin' : 'customer');
  const [rows] = await db.execute(
    `SELECT n.id
     FROM notifications n
     WHERE n.id = ? AND ${visibilityWhere()}
     LIMIT 1`,
    [notificationId, role, user.id]
  );
  if (!rows.length) return false;

  await db.execute(
    `INSERT INTO notification_recipients (notification_id, user_id, is_read, read_at)
     VALUES (?,?,1,NOW())
     ON DUPLICATE KEY UPDATE is_read = 1, read_at = NOW()`,
    [notificationId, user.id]
  );
  return true;
}

/**
 * Mark ALL notifications visible to the user as read.
 * Returns the number of notifications marked.
 */
async function markAllNotificationsRead(user) {
  const role = user.role || (user.isAdmin ? 'admin' : 'customer');
  const [rows] = await db.execute(
    `SELECT n.id
     FROM notifications n
     LEFT JOIN notification_recipients r
       ON r.notification_id = n.id AND r.user_id = ?
     WHERE ${visibilityWhere()} AND COALESCE(r.is_read,0) = 0`,
    [user.id, role, user.id]
  );

  if (!rows.length) return 0;

  // Upsert read state for all currently-unread visible notifications.
  const values = rows.map(r => [r.id, user.id]).flat();
  const placeholders = rows.map(() => '(?,?,1,NOW())').join(',');
  await db.execute(
    `INSERT INTO notification_recipients (notification_id, user_id, is_read, read_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE is_read = 1, read_at = NOW()`,
    values
  );

  return rows.length;
}

/** Shape a notification row for the API response. */
function toPublicNotification(n) {
  let meta = n.metadata;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    link: n.link || null,
    metadata: meta,
    isRead: Boolean(Number(n.is_read)),
    readAt: n.read_at || null,
    createdAt: n.created_at
  };
}

module.exports = {
  VALID_TYPES,
  VALID_AUDIENCES,
  VALID_ROLES,
  validateNotificationInput,
  createNotification,
  getUserNotifications,
  getUserNotificationCounts,
  markNotificationRead,
  markAllNotificationsRead
};
