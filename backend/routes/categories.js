'use strict';
/**
 * Shax Store — Public Category Routes
 * GET /api/categories     (public — used by the storefront)
 *
 * Category CREATE / UPDATE / DELETE live under /api/admin/categories
 * (admin-only) — see routes/admin.js.
 */
const router = require('express').Router();
const db     = require('../config/db');

router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, name_ku, name_ar, image_url, sort_order FROM categories ORDER BY sort_order ASC, created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

module.exports = router;
