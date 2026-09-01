'use strict';
/**
 * Shax Store — Notifications Routes
 *
 * User endpoints (requireAuth — server resolves the current user from
 * the JWT; it never trusts a client-supplied user id for private data):
 *   GET  /api/notifications                      → visible notifications
 *   GET  /api/notifications/unread-count         → total/unread split
 *   POST /api/notifications/:id/read             → mark one read (scoped)
 *   POST /api/notifications/read-all             → mark all visible read
 *
 * Admin broadcast endpoint (requireAuth + requireAdmin):
 *   POST /api/notifications/send                 → create a notification
 */
const router = require('express').Router();
const db = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const svc = require('../services/notifications');
const pushSvc = require('../services/push');

/* ── GET /api/notifications ────────────────────────────── */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit, offset, unread } = req.query;
    const opts = {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      unreadOnly: unread === '1' || unread === 'true'
    };
    const items = await svc.getUserNotifications(req.user, opts);
    res.json({ notifications: items });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

/* ── GET /api/notifications/unread-count ──────────────── */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const counts = await svc.getUserNotificationCounts(req.user);
    res.json(counts);
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Failed to fetch unread count.' });
  }
});

/* ── POST /api/notifications/:id/read ─────────────────── */
router.post('/:id/read', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id < 1) {
    return res.status(400).json({ error: 'Invalid notification id.' });
  }
  try {
    const ok = await svc.markNotificationRead(id, req.user);
    if (!ok) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

/* ── POST /api/notifications/read-all ─────────────────── */
/* (defined after :id/read so '/read-all' isn't captured as an id) */
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const count = await svc.markAllNotificationsRead(req.user);
    res.json({ message: `Marked ${count} notification(s) as read.`, marked: count });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

/* ── POST /api/notifications/send (admin) ─────────────── */
router.post('/send', requireAuth, requireAdmin, async (req, res) => {
  const { title, message, type, audience, targetRole, targetUserId, link, metadata, expiresAt } = req.body || {};

  try {
    const checked = svc.validateNotificationInput({
      title, message, type, audience, targetRole, targetUserId, link, metadata, expiresAt
    });
    if (!checked.ok) {
      return res.status(checked.status || 400).json({ error: checked.error });
    }

    // When targeting a specific user, ensure that user actually exists.
    if (checked.data.targetUserId) {
      const [ur] = await db.execute('SELECT id FROM users WHERE id = ?', [checked.data.targetUserId]);
      if (!ur.length) {
        return res.status(404).json({ error: 'Target user not found.' });
      }
    }

    const notification = await svc.createNotification({
      ...checked.data,
      senderId: req.user.id
    });

    /* Native push is BEST-EFFORT and decoupled from the committed
       in-app notification. Fire-and-forget so delivery problems can
       never break, delay or roll back the notification that already
       exists in the system (source of truth). */
    pushSvc.fanoutPush(notification).catch(err =>
      console.error('Push fan-out error:', err)
    );

    res.status(201).json({
      message: 'Notification created.',
      notification: {
        id: notification.id,
        title: notification.title,
        type: notification.type,
        audience: notification.audience,
        targetRole: notification.target_role,
        targetUserId: notification.target_user_id,
        createdAt: notification.created_at
      }
    });
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json({ error: 'Failed to create notification.' });
  }
});

module.exports = router;
