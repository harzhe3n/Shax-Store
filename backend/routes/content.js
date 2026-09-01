'use strict';
/**
 * Shax Store — Public Content Routes
 * GET /api/content/:key   (public — returns admin-editable page text)
 *
 * Currently used for the Shipping Info page. The matching editor lives
 * in the Admin Panel (POST /api/admin/content/:key, admin-only).
 *
 * Only a whitelist of keys is readable, so this can't be used to fish
 * for unrelated settings (e.g. the Telegram bot token).
 */
const router = require('express').Router();
const db     = require('../config/db');

const PUBLIC_KEYS = ['shipping_info'];

/* Public: the store-wide minimum order amount (0 = no minimum). Read at
   checkout so the storefront can block orders below it. */
router.get('/config/min-order', async (_req, res) => {
  try {
    const [rows] = await db.execute('SELECT value FROM settings WHERE key_name = ?', ['min_order_amount']);
    const amount = rows.length ? parseFloat(rows[0].value) || 0 : 0;
    res.json({ minOrder: amount });
  } catch (err) {
    console.error('Get min-order error:', err);
    res.json({ minOrder: 0 });   // fail open — never block checkout on error
  }
});

router.get('/:key', async (req, res) => {
  const key = req.params.key;
  if (!PUBLIC_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Not found.' });
  }
  try {
    const [rows] = await db.execute(
      'SELECT value FROM settings WHERE key_name = ?',
      [`content_${key}`]
    );
    res.json({ key, content: rows.length ? rows[0].value : '' });
  } catch (err) {
    console.error('Get content error:', err);
    res.status(500).json({ error: 'Failed to fetch content.' });
  }
});

module.exports = router;
