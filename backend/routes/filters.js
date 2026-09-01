'use strict';
/**
 * Shax Store — Filter Routes
 * Filters are admin-made tags (Summer, Sale, New…). A product can have MANY
 * filters. Customers tap filters on the storefront to narrow products.
 */
const router = require('express').Router();
const db     = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/* ── GET /api/filters (public) ─────────────────────────── */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, name_ku, name_ar, image_url, sort_order FROM filters ORDER BY sort_order ASC, created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Get filters error:', err);
    res.status(500).json({ error: 'Failed to fetch filters.' });
  }
});

/* ── POST /api/filters (admin) ─────────────────────────── */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, name_ku, name_ar, image_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Filter name is required.' });

  const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!base) return res.status(400).json({ error: 'Name must contain at least one letter or number.' });

  try {
    let id = base, n = 1;
    while (true) {
      const [ex] = await db.execute('SELECT id FROM filters WHERE id = ?', [id]);
      if (!ex.length) break;
      id = `${base}-${++n}`;
    }
    await db.execute(
      'INSERT INTO filters (id, name, name_ku, name_ar, image_url) VALUES (?,?,?,?,?)',
      [id, name, name_ku || null, name_ar || null, image_url || null]
    );
    res.status(201).json({ id, message: 'Filter created.' });
  } catch (err) {
    console.error('Create filter error:', err);
    res.status(500).json({ error: 'Failed to create filter.' });
  }
});

/* ── PUT /api/filters/:id (admin) ──────────────────────── */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, name_ku, name_ar, image_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Filter name is required.' });
  try {
    const [r] = await db.execute(
      'UPDATE filters SET name=?, name_ku=?, name_ar=?, image_url=? WHERE id=?',
      [name, name_ku || null, name_ar || null, image_url || null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Filter not found.' });
    res.json({ message: 'Filter updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update filter.' });
  }
});

/* ── DELETE /api/filters/:id (admin) ───────────────────── */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.execute('DELETE FROM product_filters WHERE filter_id = ?', [req.params.id]);
    const [r] = await db.execute('DELETE FROM filters WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Filter not found.' });
    res.json({ message: 'Filter deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete filter.' });
  }
});

module.exports = router;
