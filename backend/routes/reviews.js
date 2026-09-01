'use strict';
/**
 * Shax Store — Review Routes
 * GET    /api/reviews                 (admin only — all reviews, for moderation)
 * GET    /api/reviews/:productId      (public — reviews + aggregate for one product)
 * POST   /api/reviews/:productId      (auth required — create/update your own review)
 * DELETE /api/reviews/:id             (auth required — review owner or admin)
 */
const router = require('express').Router();
const db     = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/* ── GET /api/reviews (admin — moderation list) ───────── */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT r.id, r.product_id, p.name AS product_name, r.user_id, r.user_name,
              r.rating, r.comment, r.created_at
       FROM reviews r
       LEFT JOIN products p ON p.id = r.product_id
       ORDER BY r.created_at DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    console.error('Get all reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

/* ── GET /api/reviews/:productId (public) ──────────────── */
router.get('/:productId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, user_id, user_name, rating, comment, created_at
       FROM reviews WHERE product_id = ? ORDER BY created_at DESC`,
      [req.params.productId]
    );
    const count   = rows.length;
    const average = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;

    res.json({
      reviews: rows.map(r => ({
        id       : r.id,
        userId   : r.user_id,
        userName : r.user_name,
        rating   : r.rating,
        comment  : r.comment,
        date     : r.created_at
      })),
      average: Math.round(average * 10) / 10,
      count
    });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

/* ── POST /api/reviews/:productId (auth — upsert own review) */
router.post('/:productId', requireAuth, async (req, res) => {
  const { rating, comment } = req.body || {};
  const productId = req.params.productId;

  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 0 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be a whole number between 0 and 5.' });
  }
  if (comment && comment.length > 1000) {
    return res.status(400).json({ error: 'Comment must be 1000 characters or fewer.' });
  }

  try {
    const [products] = await db.execute('SELECT id FROM products WHERE id = ?', [productId]);
    if (!products.length) return res.status(404).json({ error: 'Product not found.' });

    await db.execute(
      `INSERT INTO reviews (product_id, user_id, user_name, rating, comment)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE rating = ?, comment = ?, user_name = ?, updated_at = NOW()`,
      [
        productId, req.user.id, req.user.name, numRating, comment || null,
        numRating, comment || null, req.user.name
      ]
    );

    res.status(201).json({ message: 'Review saved.' });
  } catch (err) {
    console.error('Save review error:', err);
    res.status(500).json({ error: 'Failed to save review.' });
  }
});

/* ── DELETE /api/reviews/:id (owner or admin) ──────────── */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT user_id FROM reviews WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Review not found.' });

    const isOwner = rows[0].user_id === req.user.id;
    if (!isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own review.' });
    }

    await db.execute('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    res.json({ message: 'Review deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete review.' });
  }
});

module.exports = router;
