'use strict';
/**
 * Shax Store — Push Token Routes
 *
 * Account-scoped device-token registration for native push.
 *   POST /api/push/register      → store/refresh a device token
 *   POST /api/push/unregister    → deactivate a device token (logout)
 *
 * Both require authentication (requireAuth). The USER is ALWAYS
 * resolved from the JWT (req.user.id) — the client never sends a
 * user id, and the token table only ever links a device to the
 * authenticated account. No provider credentials live here.
 */
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const svc = require('../services/push');

/* ── POST /api/push/register ───────────────────────────── */
router.post('/register', requireAuth, async (req, res) => {
  const { token, platform, deviceId } = req.body || {};

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'token is required.' });
  }
  const cleanToken = token.trim();
  if (cleanToken.length > svc.MAX_TOKEN_LEN) {
    return res.status(400).json({ error: `token is too long (max ${svc.MAX_TOKEN_LEN} characters).` });
  }
  const cleanPlatform = (platform === 'ios' || platform === 'android') ? platform : null;
  if (!cleanPlatform) {
    return res.status(400).json({ error: 'platform must be "android" or "ios".' });
  }
  const cleanDeviceId = (deviceId && typeof deviceId === 'string') ? deviceId.slice(0, 128) : null;

  try {
    await svc.registerDevice({
      userId: req.user.id,
      token: cleanToken,
      platform: cleanPlatform,
      deviceId: cleanDeviceId
    });
    res.json({ registered: true });
  } catch (err) {
    console.error('Push register error:', err);
    res.status(500).json({ error: 'Failed to register device.' });
  }
});

/* ── POST /api/push/unregister ─────────────────────────── */
router.post('/unregister', requireAuth, async (req, res) => {
  const { token } = req.body || {};

  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'token is required.' });
  }

  try {
    const wasActive = await svc.unregisterDevice({
      userId: req.user.id,
      token: token.trim()
    });
    res.json({ unregistered: true, wasActive });
  } catch (err) {
    console.error('Push unregister error:', err);
    res.status(500).json({ error: 'Failed to unregister device.' });
  }
});

module.exports = router;