'use strict';
/**
 * Shax Store — Public Stats Route
 * GET /api/stats   (public — real numbers shown on the homepage "About" stats)
 *
 * Returns:
 *   products        → how many products are currently in the store
 *   happyCustomers  → how many distinct users have given a full 5-star review
 *
 * "Years experience" and other fixed copy are kept in the frontend, since
 * they aren't derived from the database.
 */
const router = require('express').Router();
const db     = require('../config/db');

router.get('/', async (_req, res) => {
  try {
    const [[{ products }]] = await db.execute(
      'SELECT COUNT(*) AS products FROM products'
    );

    /* Distinct users who left at least one 5-star review */
    const [[{ happyCustomers }]] = await db.execute(
      'SELECT COUNT(DISTINCT user_id) AS happyCustomers FROM reviews WHERE rating = 5'
    );

    res.json({
      products      : Number(products),
      happyCustomers: Number(happyCustomers)
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

module.exports = router;
