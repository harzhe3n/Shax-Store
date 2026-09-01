'use strict';
/**
 * Shax Store — Sponsor Routes (v2)
 * For accounts with role = 'sponsor'.
 *
 * GET  /api/sponsor/me            → their profile + category info
 * GET  /api/sponsor/category      → their single category (or null)
 * POST /api/sponsor/category      → create their one category
 * PUT  /api/sponsor/category      → update their category
 * POST /api/sponsor/upload        → image upload
 * GET  /api/sponsor/orders        → orders containing their products
 * PUT  /api/sponsor/orders/:id/status → update status for their orders
 * GET  /api/sponsor/stats         → full dashboard stats
 * PUT  /api/sponsor/telegram      → save their Telegram chat ID
 * POST /api/sponsor/telegram/test → test Telegram connectivity
 */
const router = require('express').Router();
const db     = require('../config/db');
const { requireAuth, requireSponsorOrAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { sendSponsorStatusNotification, sendTestMessageToChat } = require('../services/telegram');
const orderAlerts = require('../services/orderAlerts');

function isSponsor(u) { return u && u.role === 'sponsor'; }

/* ── GET /api/sponsor/me ──────────────────────────────── */
router.get('/me', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  try {
    const [cats] = await db.execute(
      'SELECT id, name, name_ku, name_ar, image_url FROM categories WHERE owner_id = ? LIMIT 1',
      [req.user.id]
    );
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role || (req.user.isAdmin ? 'admin' : 'customer'),
      hasCategory: cats.length > 0,
      category: cats[0] || null
    });
  } catch (err) {
    console.error('Sponsor me error:', err);
    res.status(500).json({ error: 'Failed to load sponsor profile.' });
  }
});

/* ── GET /api/sponsor/category ────────────────────────── */
router.get('/category', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, name_ku, name_ar, image_url FROM categories WHERE owner_id = ? LIMIT 1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load category.' });
  }
});

/* ── POST /api/sponsor/category ───────────────────────── */
router.post('/category', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  const { name, name_ku, name_ar, image_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Store name is required.' });

  try {
    const [existing] = await db.execute('SELECT id FROM categories WHERE owner_id = ?', [req.user.id]);
    if (existing.length) {
      return res.status(409).json({ error: 'You already have a store category. You can edit it, but not create another.' });
    }
    const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!base) return res.status(400).json({ error: 'Store name must contain at least one letter or number.' });
    const id = `${base}-${req.user.id}`;
    await db.execute(
      'INSERT INTO categories (id, name, name_ku, name_ar, image_url, owner_id) VALUES (?,?,?,?,?,?)',
      [id, name, name_ku || null, name_ar || null, image_url || null, req.user.id]
    );
    res.status(201).json({ id, message: 'Store category created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A category with that name already exists.' });
    }
    console.error('Sponsor create category error:', err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

/* ── PUT /api/sponsor/category ────────────────────────── */
router.put('/category', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  const { name, name_ku, name_ar, image_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Store name is required.' });
  try {
    const [r] = await db.execute(
      'UPDATE categories SET name=?, name_ku=?, name_ar=?, image_url=? WHERE owner_id=?',
      [name, name_ku || null, name_ar || null, image_url || null, req.user.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'You have no store category yet. Create one first.' });
    res.json({ message: 'Store updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

/* ── POST /api/sponsor/upload ─────────────────────────── */
router.post('/upload', requireAuth, requireSponsorOrAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

/* ── GET /api/sponsor/orders ──────────────────────────── */
/* Returns orders that contain at least one of the sponsor's products.
   Each order includes only the sponsor's items (not other sponsors' items). */
router.get('/orders', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  if (!isSponsor(req.user)) {
    return res.status(403).json({ error: 'Sponsors only.' });
  }
  try {
    const [orders] = await db.execute(
      `SELECT DISTINCT o.id, o.customer_name, o.email, o.phone, o.city, o.address,
              o.note, o.total, o.status, o.taken_by, o.taken_by_name, o.created_at, o.updated_at
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE p.owner_id = ?
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    const result = await Promise.all(orders.map(async o => {
      /* Fetch only the sponsor's items from this order */
      const [items] = await db.execute(
        `SELECT oi.product_id, oi.product_name, oi.size, oi.color, oi.quantity,
                oi.unit_price, oi.unit_cost, oi.unit_profit, oi.id AS item_id
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ? AND p.owner_id = ?`,
        [o.id, req.user.id]
      );
      const sponsorTotal = items.reduce((s, i) => s + (parseFloat(i.unit_price) * Number(i.quantity)), 0);
      return {
        id: o.id,
        customer: o.customer_name,
        email: o.email,
        phone: o.phone,
        city: o.city,
        address: o.address,
        note: o.note,
        orderTotal: parseFloat(o.total),
        sponsorTotal,
        status: o.status,
        takenBy: o.taken_by_name || null,
        date: o.created_at,
        updatedAt: o.updated_at,
        items: items.map(i => ({
          productId: i.product_id,
          name: i.product_name,
          size: i.size,
          color: i.color,
          qty: Number(i.quantity),
          unitPrice: parseFloat(i.unit_price),
          unitCost: parseFloat(i.unit_cost),
          unitProfit: parseFloat(i.unit_profit),
          lineTotal: parseFloat(i.unit_price) * Number(i.quantity)
        }))
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('Sponsor get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

/* ── PUT /api/sponsor/orders/:id/status ───────────────── */
/* Sponsor updates the status for an order containing their products. */
router.put('/orders/:id/status', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  if (!isSponsor(req.user)) {
    return res.status(403).json({ error: 'Sponsors only.' });
  }
  const valid = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const { status } = req.body || {};
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
  }

  try {
    /* Verify the order has at least one of the sponsor's products */
    const [check] = await db.execute(
      `SELECT 1 FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? AND p.owner_id = ? LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (!check.length) return res.status(404).json({ error: 'Order not found or no sponsor products in it.' });

    const [cur] = await db.execute('SELECT status FROM orders WHERE id = ?', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Order not found.' });

    const [r] = await db.execute(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' });

    /* Notify admin Telegram */
    const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
    const [rows] = await db.execute('SELECT customer_name, total FROM orders WHERE id = ?', [req.params.id]);
    const who = rows.length ? rows[0].customer_name : '';
    const amt = rows.length ? ` — ${fmt(rows[0].total)}` : '';
    const icons = { pending: '🕒', processing: '🔧', shipped: '🚚', delivered: '✅', cancelled: '🚫' };
    const verb = status === 'cancelled' ? 'cancelled' : `marked as <b>${status}</b>`;
    const { sendMessage } = require('../services/telegram');
    sendMessage(`${icons[status] || '🔔'} <b>Order ${req.params.id}</b> ${verb} by sponsor ${req.user.name}\n👤 ${who}${amt}`)
      .catch(e => console.error('Telegram status notice failed:', e.message));

    /* Track the change for the customer timeline + notify the order owner
       (in-app + best-effort native push). Only on an ACTUAL change — a
       no-op re-save of the same status is still accepted/announced on
       Telegram as before, but must not duplicate timeline entries or
       notifications. */
    if (status !== cur[0].status) {
      await orderAlerts.logOrderStatus({
        orderId: req.params.id, status, userId: req.user.id, userName: req.user.name
      });
      const [ord] = await db.execute('SELECT user_id FROM orders WHERE id = ?', [req.params.id]);
      if (ord.length && ord[0].user_id) {
        await orderAlerts.notifyCustomerStatus({
          orderId: req.params.id, status, customerId: ord[0].user_id
        });
      }
    }

    res.json({ message: 'Order status updated.' });
  } catch (err) {
    console.error('Sponsor update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

/* ── GET /api/sponsor/stats ───────────────────────────── */
/* Full dashboard: items sold, revenue, profit, commission, per-product breakdown */
router.get('/stats', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  if (!isSponsor(req.user)) {
    return res.status(403).json({ error: 'Sponsors only.' });
  }
  try {
    /* Total products added */
    const [[{ productCount }]] = await db.execute(
      'SELECT COUNT(*) AS productCount FROM products WHERE owner_id = ?',
      [req.user.id]
    );

    /* Total items sold (delivered orders only) + revenue + profit */
    const [[salesStats]] = await db.execute(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS totalSold,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS totalRevenue,
              COALESCE(SUM(oi.unit_profit * oi.quantity), 0) AS totalProfit
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE p.owner_id = ? AND o.status = 'delivered'`,
      [req.user.id]
    );

    /* Commission percentage */
    const [commRows] = await db.execute(
      "SELECT value FROM settings WHERE key_name = 'sponsor_commission_pct'"
    );
    const commissionPct = commRows.length ? parseFloat(commRows[0].value) || 20 : 20;
    const totalCommission = parseFloat(salesStats.totalProfit) * (commissionPct / 100);
    const sponsorEarnings = parseFloat(salesStats.totalProfit) - totalCommission;

    /* Orders containing sponsor's products */
    const [[{ orderCount }]] = await db.execute(
      `SELECT COUNT(DISTINCT o.id) AS orderCount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE p.owner_id = ? AND o.status = 'delivered'`,
      [req.user.id]
    );

    /* Per-product breakdown */
    const [products] = await db.execute(
      `SELECT p.id, p.name, p.image_url, p.price,
              COALESCE(SUM(oi.quantity), 0) AS sold,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue,
              COALESCE(SUM(oi.unit_profit * oi.quantity), 0) AS profit
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'delivered'
       WHERE p.owner_id = ?
       GROUP BY p.id
       ORDER BY revenue DESC`,
      [req.user.id]
    );

    res.json({
      productCount: Number(productCount),
      totalSold: Number(salesStats.totalSold),
      totalRevenue: parseFloat(salesStats.totalRevenue),
      totalProfit: parseFloat(salesStats.totalProfit),
      commissionPct,
      totalCommission,
      sponsorEarnings,
      orderCount: Number(orderCount),
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        image: p.image_url,
        price: parseFloat(p.price),
        sold: Number(p.sold),
        revenue: parseFloat(p.revenue),
        profit: parseFloat(p.profit),
        commission: parseFloat(p.profit) * (commissionPct / 100),
        earnings: parseFloat(p.profit) * (1 - commissionPct / 100)
      }))
    });
  } catch (err) {
    console.error('Sponsor stats error:', err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

/* ── PUT /api/sponsor/telegram ────────────────────────── */
/* Sponsor saves their Telegram chat ID for order notifications. */
router.put('/telegram', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  if (!isSponsor(req.user)) {
    return res.status(403).json({ error: 'Sponsors only.' });
  }
  const { chatId } = req.body || {};
  if (!chatId || !String(chatId).trim()) {
    return res.status(400).json({ error: 'Telegram chat ID is required.' });
  }
  try {
    await db.execute('UPDATE users SET telegram_chat_id = ? WHERE id = ?', [String(chatId).trim(), req.user.id]);
    res.json({ message: 'Telegram chat ID saved.' });
  } catch (err) {
    console.error('Sponsor save telegram error:', err);
    res.status(500).json({ error: 'Failed to save Telegram chat ID.' });
  }
});

/* ── POST /api/sponsor/telegram/test ──────────────────── */
/* Test sponsor's Telegram chat connectivity. */
router.post('/telegram/test', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  if (!isSponsor(req.user)) {
    return res.status(403).json({ error: 'Sponsors only.' });
  }
  try {
    const [rows] = await db.execute('SELECT telegram_chat_id FROM users WHERE id = ?', [req.user.id]);
    const chatId = rows.length ? rows[0].telegram_chat_id : null;
    if (!chatId) return res.status(400).json({ error: 'Save a chat ID first.' });
    const result = await sendTestMessageToChat(chatId);
    if (result.ok) res.json({ message: 'Test message sent!' });
    else res.status(400).json({ error: result.description || 'Failed to send test message.' });
  } catch (err) {
    console.error('Sponsor telegram test error:', err);
    res.status(500).json({ error: 'Failed to test Telegram.' });
  }
});

/* ── GET /api/sponsor/telegram ────────────────────────── */
/* Get sponsor's current Telegram chat ID. */
router.get('/telegram', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT telegram_chat_id FROM users WHERE id = ?', [req.user.id]);
    res.json({ chatId: rows.length ? rows[0].telegram_chat_id || '' : '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load Telegram config.' });
  }
});

module.exports = router;
