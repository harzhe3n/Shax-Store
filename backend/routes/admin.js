'use strict';
/**
 * Shax Store — Admin Routes
 * GET    /api/admin/dashboard
 * GET    /api/admin/users
 * POST   /api/admin/credentials
 * GET    /api/admin/settings
 * POST   /api/admin/settings
 * POST   /api/admin/telegram/resend
 * POST   /api/admin/telegram/test
 * GET    /api/admin/categories
 * POST   /api/admin/categories
 * PUT    /api/admin/categories/:id
 * DELETE /api/admin/categories/:id
 * POST   /api/admin/upload            (category / product image upload)
 * GET    /api/admin/push/status       (native push diagnostics)
 * POST   /api/admin/push/test         (real or dry-run test push)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db     = require('../config/db');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { sendOrderNotification, getTelegramConfig, sendTestMessage } = require('../services/telegram');
const pushSvc = require('../services/push');
const upload = require('../middleware/upload');

/* Guard against runaway test/broadcast pushes (marketing abuse). */
const pushTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many push test requests — try again in a minute.' }
});

/* ── GET /api/admin/dashboard ─────────────────────────── */
router.get('/dashboard', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[{ totalRevenue }]] = await db.execute(
      "SELECT COALESCE(SUM(total), 0) AS totalRevenue FROM orders WHERE status = 'delivered'"
    );
    /* Profit & cost are realized only once an order is DELIVERED. Pending or
       in-progress orders don't count until they actually complete. */
    const [[{ totalProfit, totalCost }]] = await db.execute(
      `SELECT COALESCE(SUM(oi.unit_profit * oi.quantity), 0) AS totalProfit,
              COALESCE(SUM(oi.unit_cost   * oi.quantity), 0) AS totalCost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'delivered'`
    );
    const [[{ orderCount }]] = await db.execute(
      "SELECT COUNT(*) AS orderCount FROM orders"
    );
    const [[{ productCount }]] = await db.execute(
      "SELECT COUNT(*) AS productCount FROM products"
    );
    const [[{ userCount }]] = await db.execute(
      "SELECT COUNT(*) AS userCount FROM users WHERE is_admin = 0 AND role = 'customer'"
    );
    const [[{ sponsorCount }]] = await db.execute(
      "SELECT COUNT(*) AS sponsorCount FROM users WHERE role = 'sponsor'"
    );
    const [[{ pendingCount }]] = await db.execute(
      "SELECT COUNT(*) AS pendingCount FROM orders WHERE status = 'pending'"
    );
    const [recentOrders] = await db.execute(
      `SELECT id, customer_name, email, total, status, created_at
       FROM orders ORDER BY created_at DESC LIMIT 5`
    );
    const [outOfStock] = await db.execute(
      'SELECT id, name, category FROM products WHERE in_stock = 0'
    );

    res.json({
      totalRevenue : parseFloat(totalRevenue),
      totalProfit  : parseFloat(totalProfit),
      totalCost    : parseFloat(totalCost),
      orderCount   : Number(orderCount),
      productCount : Number(productCount),
      userCount    : Number(userCount),
      sponsorCount : Number(sponsorCount),
      pendingCount : Number(pendingCount),
      recentOrders : recentOrders.map(o => ({
        id      : o.id,
        customer: o.customer_name,
        email   : o.email,
        total   : parseFloat(o.total),
        status  : o.status,
        date    : o.created_at
      })),
      outOfStock
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

/* ── GET /api/admin/users ─────────────────────────────── */
router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, email, is_admin, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows.map(u => ({
      id       : u.id,
      name     : u.name,
      email    : u.email,
      isAdmin  : Boolean(u.is_admin),
      createdAt: u.created_at
    })));
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

/* ── GET /api/admin/admins ────────────────────────────── */
/* Super-admin only: list all admin + super_admin accounts. */
router.get('/admins', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, name, email, role, created_at
       FROM users WHERE role IN ('admin','super_admin')
       ORDER BY role DESC, created_at ASC`
    );
    res.json(rows.map(a => ({
      id: a.id, name: a.name, email: a.email,
      role: a.role, isSuperAdmin: a.role === 'super_admin',
      createdAt: a.created_at
    })));
  } catch (err) {
    console.error('Get admins error:', err);
    res.status(500).json({ error: 'Failed to fetch admins.' });
  }
});

/* ── POST /api/admin/admins ───────────────────────────── */
/* Super-admin only: create a new (regular) admin account. */
router.post('/admins', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const emailNorm = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [emailNorm]);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      "INSERT INTO users (name, email, password, is_admin, role) VALUES (?,?,?,1,'admin')",
      [name.trim(), emailNorm, hashed]
    );
    res.status(201).json({ id: result.insertId, message: 'Admin account created.' });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ error: 'Failed to create admin.' });
  }
});

/* ── DELETE /api/admin/admins/:id ─────────────────────── */
/* Super-admin only: remove a regular admin. Super admins can't be deleted
   here (protects the seeded owner account). */
router.delete('/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Admin not found.' });
    if (rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin accounts cannot be removed here.' });
    }
    const [r] = await db.execute(
      "DELETE FROM users WHERE id = ? AND role = 'admin'",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Admin not found.' });
    res.json({ message: 'Admin removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove admin.' });
  }
});

/* ── GET /api/admin/sponsors ──────────────────────────── */
/* List sponsor accounts, with their store name + product count. */
router.get('/sponsors', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.created_at,
              c.id AS category_id, c.name AS store_name,
              (SELECT COUNT(*) FROM products p WHERE p.owner_id = u.id) AS product_count
       FROM users u
       LEFT JOIN categories c ON c.owner_id = u.id
       WHERE u.role = 'sponsor'
       ORDER BY u.created_at DESC`
    );
    res.json(rows.map(s => ({
      id          : s.id,
      name        : s.name,
      email       : s.email,
      storeName   : s.store_name || null,
      categoryId  : s.category_id || null,
      productCount: Number(s.product_count),
      createdAt   : s.created_at
    })));
  } catch (err) {
    console.error('Get sponsors error:', err);
    res.status(500).json({ error: 'Failed to fetch sponsors.' });
  }
});

/* ── POST /api/admin/sponsors ─────────────────────────── */
/* Create a new sponsor account. The sponsor sets up their own store
   category later from the sponsor panel. */
router.post('/sponsors', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const emailNorm = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [emailNorm]);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      "INSERT INTO users (name, email, password, is_admin, role) VALUES (?,?,?,0,'sponsor')",
      [name.trim(), emailNorm, hashed]
    );
    res.status(201).json({ id: result.insertId, message: 'Sponsor account created.' });
  } catch (err) {
    console.error('Create sponsor error:', err);
    res.status(500).json({ error: 'Failed to create sponsor.' });
  }
});

/* ── DELETE /api/admin/sponsors/:id ───────────────────── */
/* Remove a sponsor account. Their products/category have owner_id set to
   NULL by the FK (kept, not deleted) so nothing breaks on the storefront. */
router.delete('/sponsors/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await db.execute(
      "DELETE FROM users WHERE id = ? AND role = 'sponsor'",
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Sponsor not found.' });
    res.json({ message: 'Sponsor removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove sponsor.' });
  }
});

/* ── POST /api/admin/credentials ─────────────────────── */
router.post('/credentials', requireAuth, requireAdmin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  try {
    const hashed = await bcrypt.hash(password, 12);
    await db.execute(
      'UPDATE users SET email = ?, password = ?, updated_at = NOW() WHERE id = ?',
      [email.toLowerCase().trim(), hashed, req.user.id]
    );
    res.json({ message: 'Credentials updated.' });
  } catch (err) {
    console.error('Update credentials error:', err);
    res.status(500).json({ error: 'Failed to update credentials.' });
  }
});

/* ── GET /api/admin/settings ──────────────────────────── */
router.get('/settings', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { botToken, chatId } = await getTelegramConfig();
    const [mo] = await db.execute('SELECT value FROM settings WHERE key_name = ?', ['min_order_amount']);
    const [cp] = await db.execute('SELECT value FROM settings WHERE key_name = ?', ['sponsor_commission_pct']);
    /* Never send back the actual token — just whether it's set */
    res.json({
      botTokenSet: Boolean(botToken),
      chatId     : chatId || '',
      minOrder   : mo.length ? parseFloat(mo[0].value) || 0 : 0,
      sponsorCommissionPct: cp.length ? parseFloat(cp[0].value) || 20 : 20
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

/* ── POST /api/admin/min-order (any admin) ────────────── */
router.post('/min-order', requireAuth, requireAdmin, async (req, res) => {
  let amount = parseFloat(req.body && req.body.minOrder);
  if (isNaN(amount) || amount < 0) amount = 0;
  try {
    await db.execute(
      'INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
      ['min_order_amount', String(amount), String(amount)]
    );
    res.json({ message: 'Minimum order amount saved.', minOrder: amount });
  } catch (err) {
    console.error('Save min-order error:', err);
    res.status(500).json({ error: 'Failed to save minimum order amount.' });
  }
});

/* ── POST /api/admin/sponsor-commission (any admin) ────── */
router.post('/sponsor-commission', requireAuth, requireAdmin, async (req, res) => {
  let pct = parseFloat(req.body && req.body.pct);
  if (isNaN(pct) || pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  try {
    await db.execute(
      'INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
      ['sponsor_commission_pct', String(pct), String(pct)]
    );
    res.json({ message: 'Sponsor commission saved.', pct });
  } catch (err) {
    console.error('Save sponsor-commission error:', err);
    res.status(500).json({ error: 'Failed to save sponsor commission.' });
  }
});

/* ── POST /api/admin/settings ─────────────────────────── */
router.post('/settings', requireAuth, requireSuperAdmin, async (req, res) => {
  const { botToken, chatId, sponsorCommissionPct } = req.body || {};
  if (botToken === undefined || chatId === undefined) {
    return res.status(400).json({ error: 'botToken and chatId are required.' });
  }
  try {
    await db.execute(
      'INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
      ['telegram_bot_token', botToken, botToken]
    );
    await db.execute(
      'INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
      ['telegram_chat_id', chatId, chatId]
    );
    if (sponsorCommissionPct !== undefined) {
      let pct = parseFloat(sponsorCommissionPct);
      if (isNaN(pct) || pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      await db.execute(
        'INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
        ['sponsor_commission_pct', String(pct), String(pct)]
      );
    }
    res.json({ message: 'Settings saved.' });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

/* ── GET /api/admin/content/:key ──────────────────────── */
/* Editable page text (e.g. Shipping Info). Admin reads the current value. */
const EDITABLE_CONTENT_KEYS = ['shipping_info'];

router.get('/content/:key', requireAuth, requireAdmin, async (req, res) => {
  const key = req.params.key;
  if (!EDITABLE_CONTENT_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Unknown content key.' });
  }
  try {
    const [rows] = await db.execute(
      'SELECT value FROM settings WHERE key_name = ?',
      [`content_${key}`]
    );
    res.json({ key, content: rows.length ? rows[0].value : '' });
  } catch (err) {
    console.error('Get admin content error:', err);
    res.status(500).json({ error: 'Failed to fetch content.' });
  }
});

/* ── POST /api/admin/content/:key ─────────────────────── */
router.post('/content/:key', requireAuth, requireAdmin, async (req, res) => {
  const key = req.params.key;
  if (!EDITABLE_CONTENT_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Unknown content key.' });
  }
  const { content } = req.body || {};
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required.' });
  }
  if (content.length > 20000) {
    return res.status(400).json({ error: 'Content is too long (20,000 character limit).' });
  }
  try {
    await db.execute(
      'INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
      [`content_${key}`, content, content]
    );
    res.json({ message: 'Content saved.' });
  } catch (err) {
    console.error('Save content error:', err);
    res.status(500).json({ error: 'Failed to save content.' });
  }
});

/* ── POST /api/admin/telegram/resend ─────────────────── */
router.post('/telegram/resend', requireAuth, requireAdmin, async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId is required.' });

  try {
    const [orders] = await db.execute(
      `SELECT o.*, JSON_ARRAYAGG(
         JSON_OBJECT('id',oi.product_id,'name',oi.product_name,'size',oi.size,'qty',oi.quantity,
                     'price',oi.unit_price,'image_url',p.image_url)
       ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.id = ? GROUP BY o.id`,
      [orderId]
    );
    if (!orders.length) return res.status(404).json({ error: 'Order not found.' });

    const o      = orders[0];
    const result = await sendOrderNotification({
      orderId  : o.id,
      customer : o.customer_name,
      email    : o.email,
      phone    : o.phone,
      city     : o.city,
      address  : o.address,
      note     : o.note,
      latitude : o.latitude,
      longitude: o.longitude,
      items    : typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
      total    : o.total
    });

    if (result && result.ok) {
      res.json({ message: 'Resent to Telegram.' });
    } else {
      res.status(502).json({ error: result?.reason || 'Telegram delivery failed.' });
    }
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Failed to resend.' });
  }
});

/* ── POST /api/admin/telegram/test ────────────────────── */
router.post('/telegram/test', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await sendTestMessage();
    if (result && result.ok) {
      res.json({ message: 'Test message sent!' });
    } else {
      res.status(502).json({ error: result?.reason || result?.description || 'Telegram delivery failed.' });
    }
  } catch (err) {
    console.error('Telegram test error:', err);
    res.status(500).json({ error: 'Failed to send test message.' });
  }
});

/* ── GET /api/admin/categories ────────────────────────── */
router.get('/categories', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS owner_name
       FROM categories c
       LEFT JOIN users u ON u.id = c.owner_id
       ORDER BY c.sort_order ASC, c.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

/* ── POST /api/admin/categories ───────────────────────── */
router.post('/categories', requireAuth, requireAdmin, async (req, res) => {
  const { name, name_ku, name_ar, image_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  const id = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!id) return res.status(400).json({ error: 'Category name must contain at least one letter or number.' });
  try {
    await db.execute(
      'INSERT INTO categories (id, name, name_ku, name_ar, image_url) VALUES (?,?,?,?,?)',
      [id, name, name_ku || null, name_ar || null, image_url || null]
    );
    res.status(201).json({ id, message: 'Category created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Category ID already exists. Use a different name.' });
    }
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

/* ── PUT /api/admin/categories/:id ────────────────────── */
router.put('/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, name_ku, name_ar, image_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  try {
    const [r] = await db.execute(
      'UPDATE categories SET name=?, name_ku=?, name_ar=?, image_url=? WHERE id=?',
      [name, name_ku || null, name_ar || null, image_url || null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

/* ── DELETE /api/admin/categories/:id ─────────────────── */
router.delete('/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [[{ inUse }]] = await db.execute(
      'SELECT COUNT(*) AS inUse FROM products WHERE category = ?',
      [req.params.id]
    );
    if (inUse > 0) {
      return res.status(409).json({
        error: `Cannot delete — ${inUse} product(s) still use this category. Move or delete them first.`
      });
    }
    const [r] = await db.execute('DELETE FROM categories WHERE id=?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

/* ── POST /api/admin/upload ───────────────────────────── */
/* Generic image upload used by both the product and category   */
/* forms in the Admin Panel. Works with desktop file pickers and */
/* mobile camera/gallery (browser handles that via <input type=  */
/* "file" accept="image/*">). Returns the public URL to store.   */
router.post('/upload', requireAuth, requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file received.' });
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

/* ════════════════════════════════════════════════════════════
   STORAGE / CONTAINERS  (v2 — with numbers, sizes, analytics)
   ════════════════════════════════════════════════════════════ */

/* ── GET /api/admin/storage/summary ────────────────────── */
router.get('/storage/summary', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[{ totalUnits }]] = await db.execute(
      'SELECT COALESCE(SUM(total_quantity), 0) AS totalUnits FROM container_items'
    );
    const [[{ totalCost }]] = await db.execute(
      'SELECT COALESCE(SUM(ci.cost_price * ci.total_quantity), 0) AS totalCost FROM container_items ci'
    );
    const [[{ totalPotentialProfit }]] = await db.execute(
      'SELECT COALESCE(SUM((ci.selling_price - ci.cost_price) * ci.total_quantity), 0) AS totalPotentialProfit FROM container_items ci'
    );
    const [[{ totalDeliveryCost }]] = await db.execute(
      'SELECT COALESCE(SUM(delivery_cost), 0) AS totalDeliveryCost FROM containers'
    );
    const [[{ containerCount }]] = await db.execute(
      'SELECT COUNT(*) AS containerCount FROM containers'
    );
    res.json({
      totalUnits: Number(totalUnits),
      totalCost: parseFloat(totalCost),
      totalPotentialProfit: parseFloat(totalPotentialProfit),
      totalDeliveryCost: parseFloat(totalDeliveryCost),
      totalOverall: parseFloat(totalCost) + parseFloat(totalDeliveryCost),
      containerCount: Number(containerCount)
    });
  } catch (err) {
    console.error('Storage summary error:', err);
    res.status(500).json({ error: 'Failed to load storage summary.' });
  }
});

/* ── GET /api/admin/containers ─────────────────────────── */
router.get('/containers', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS created_by_name,
              (SELECT COUNT(*) FROM container_items ci WHERE ci.container_id = c.id) AS item_count,
              (SELECT COALESCE(SUM(ci.total_quantity), 0) FROM container_items ci WHERE ci.container_id = c.id) AS total_units,
              (SELECT COALESCE(SUM(ci.cost_price * ci.total_quantity), 0) FROM container_items ci WHERE ci.container_id = c.id) AS total_cost,
              (SELECT COALESCE(SUM(ci.selling_price * ci.total_quantity), 0) FROM container_items ci WHERE ci.container_id = c.id) AS total_selling
       FROM containers c
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.number ASC`
    );
    res.json(rows.map(r => ({
      id: r.id,
      number: r.number,
      name: r.name,
      country: r.country,
      notes: r.notes,
      deliveryCost: parseFloat(r.delivery_cost),
      status: r.status,
      createdBy: r.created_by_name,
      itemCount: Number(r.item_count),
      totalUnits: Number(r.total_units),
      totalCost: parseFloat(r.total_cost),
      totalSelling: parseFloat(r.total_selling),
      totalProfit: parseFloat(r.total_selling) - parseFloat(r.total_cost),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })));
  } catch (err) {
    console.error('Get containers error:', err);
    res.status(500).json({ error: 'Failed to fetch containers.' });
  }
});

/* ── GET /api/admin/containers/:id ─────────────────────── */
router.get('/containers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, u.name AS created_by_name
       FROM containers c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Container not found.' });

    const c = rows[0];
    const [items] = await db.execute(
      `SELECT ci.*, p.image_url AS product_image, au.name AS added_by_name
       FROM container_items ci
       LEFT JOIN products p ON p.id = ci.product_id
       LEFT JOIN users au ON au.id = ci.added_by
       WHERE ci.container_id = ?
       ORDER BY ci.id ASC`,
      [req.params.id]
    );

    const totalCost = items.reduce((s, i) => s + (parseFloat(i.cost_price) * Number(i.total_quantity)), 0);
    const totalSelling = items.reduce((s, i) => s + (parseFloat(i.selling_price) * Number(i.total_quantity)), 0);
    const totalUnits = items.reduce((s, i) => s + Number(i.total_quantity), 0);

    res.json({
      id: c.id,
      number: c.number,
      name: c.name,
      country: c.country,
      notes: c.notes,
      deliveryCost: parseFloat(c.delivery_cost),
      status: c.status,
      createdBy: c.created_by_name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      totals: {
        totalUnits,
        totalCost,
        totalSelling,
        totalProfit: totalSelling - totalCost,
        grandTotal: totalCost + parseFloat(c.delivery_cost)
      },
      items: items.map(i => {
        const sizes = i.sizes ? (typeof i.sizes === 'string' ? JSON.parse(i.sizes) : i.sizes) : {};
        const qty = Number(i.total_quantity);
        const cp = parseFloat(i.cost_price);
        const sp = parseFloat(i.selling_price);
        return {
          id: i.id,
          productId: i.product_id,
          productName: i.product_name,
          category: i.category,
          costPrice: cp,
          sellingPrice: sp,
          sizes,
          totalQuantity: qty,
          totalCost: cp * qty,
          totalSelling: sp * qty,
          totalProfit: (sp - cp) * qty,
          addedBy: i.added_by_name,
          image: i.product_image
        };
      })
    });
  } catch (err) {
    console.error('Get container error:', err);
    res.status(500).json({ error: 'Failed to fetch container.' });
  }
});

/* ── POST /api/admin/containers ────────────────────────── */
router.post('/containers', requireAuth, requireAdmin, async (req, res) => {
  const { number, name, country, notes, deliveryCost } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Container name is required.' });
  }
  const num = parseInt(number);
  if (!num || num < 1) {
    return res.status(400).json({ error: 'Container number is required (must be a positive number).' });
  }
  try {
    const [result] = await db.execute(
      'INSERT INTO containers (number, name, country, notes, delivery_cost, created_by) VALUES (?,?,?,?,?,?)',
      [num, name.trim(), country || null, notes || null, parseFloat(deliveryCost) || 0, req.user.id]
    );
    res.status(201).json({ id: result.insertId, message: 'Container created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Container #${num} already exists. Choose a different number.` });
    }
    console.error('Create container error:', err);
    res.status(500).json({ error: 'Failed to create container.' });
  }
});

/* ── PUT /api/admin/containers/:id ─────────────────────── */
router.put('/containers/:id', requireAuth, requireAdmin, async (req, res) => {
  const { number, name, country, notes, deliveryCost, status } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Container name is required.' });
  }
  const num = parseInt(number);
  if (!num || num < 1) {
    return res.status(400).json({ error: 'Container number is required.' });
  }
  try {
    const [r] = await db.execute(
      'UPDATE containers SET number=?, name=?, country=?, notes=?, delivery_cost=?, status=? WHERE id=?',
      [num, name.trim(), country || null, notes || null, parseFloat(deliveryCost) || 0, status || 'pending', req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Container not found.' });
    res.json({ message: 'Container updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `Container #${num} already exists. Choose a different number.` });
    }
    console.error('Update container error:', err);
    res.status(500).json({ error: 'Failed to update container.' });
  }
});

/* ── DELETE /api/admin/containers/:id ──────────────────── */
router.delete('/containers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await db.execute('DELETE FROM containers WHERE id=?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Container not found.' });
    res.json({ message: 'Container deleted.' });
  } catch (err) {
    console.error('Delete container error:', err);
    res.status(500).json({ error: 'Failed to delete container.' });
  }
});

/* ── POST /api/admin/containers/:id/items ──────────────── */
router.post('/containers/:id/items', requireAuth, requireAdmin, async (req, res) => {
  const containerId = req.params.id;
  const { productId, productName, category, costPrice, sellingPrice, sizes } = req.body || {};

  if (!productName || !productName.trim()) {
    return res.status(400).json({ error: 'Product name is required.' });
  }
  const sizesObj = sizes && typeof sizes === 'object' ? sizes : {};
  const totalQuantity = Object.values(sizesObj).reduce((s, v) => s + (parseInt(v) || 0), 0);
  if (totalQuantity < 1) {
    return res.status(400).json({ error: 'Add at least 1 unit across sizes.' });
  }

  try {
    const [[exists]] = await db.execute('SELECT id FROM containers WHERE id=?', [containerId]);
    if (!exists) return res.status(404).json({ error: 'Container not found.' });

    const [result] = await db.execute(
      'INSERT INTO container_items (container_id, product_id, product_name, category, cost_price, selling_price, sizes, total_quantity, added_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [containerId, productId || null, productName.trim(), category || null, parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0, JSON.stringify(sizesObj), totalQuantity, req.user.id]
    );
    res.status(201).json({ id: result.insertId, message: 'Item added to container.' });
  } catch (err) {
    console.error('Add container item error:', err);
    res.status(500).json({ error: 'Failed to add item.' });
  }
});

/* ── PUT /api/admin/containers/:id/items/:itemId ───────── */
router.put('/containers/:id/items/:itemId', requireAuth, requireAdmin, async (req, res) => {
  const { productName, category, costPrice, sellingPrice, productId, sizes } = req.body || {};
  if (!productName || !productName.trim()) {
    return res.status(400).json({ error: 'Product name is required.' });
  }
  const sizesObj = sizes && typeof sizes === 'object' ? sizes : {};
  const totalQuantity = Object.values(sizesObj).reduce((s, v) => s + (parseInt(v) || 0), 0);
  try {
    const [r] = await db.execute(
      'UPDATE container_items SET product_id=?, product_name=?, category=?, cost_price=?, selling_price=?, sizes=?, total_quantity=? WHERE id=? AND container_id=?',
      [productId || null, productName.trim(), category || null, parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0, JSON.stringify(sizesObj), totalQuantity, req.params.itemId, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Item not found.' });
    res.json({ message: 'Item updated.' });
  } catch (err) {
    console.error('Update container item error:', err);
    res.status(500).json({ error: 'Failed to update item.' });
  }
});

/* ── DELETE /api/admin/containers/:id/items/:itemId ────── */
router.delete('/containers/:id/items/:itemId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await db.execute(
      'DELETE FROM container_items WHERE id=? AND container_id=?',
      [req.params.itemId, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Item not found.' });
    res.json({ message: 'Item removed.' });
  } catch (err) {
    console.error('Delete container item error:', err);
    res.status(500).json({ error: 'Failed to remove item.' });
  }
});

/* ── GET /api/admin/storage/all-items ──────────────────── */
router.get('/storage/all-items', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ci.*, c.number AS container_number, c.name AS container_name,
              c.country AS container_country, c.status AS container_status,
              c.delivery_cost AS container_delivery_cost,
              p.image_url AS product_image
       FROM container_items ci
       JOIN containers c ON c.id = ci.container_id
       LEFT JOIN products p ON p.id = ci.product_id
       ORDER BY c.number ASC, ci.id ASC`
    );
    res.json(rows.map(r => {
      const sizes = r.sizes ? (typeof r.sizes === 'string' ? JSON.parse(r.sizes) : r.sizes) : {};
      const qty = Number(r.total_quantity);
      const cp = parseFloat(r.cost_price);
      const sp = parseFloat(r.selling_price);
      return {
        id: r.id,
        containerId: r.container_id,
        containerNumber: r.container_number,
        containerName: r.container_name,
        containerCountry: r.container_country,
        containerStatus: r.container_status,
        containerDeliveryCost: parseFloat(r.container_delivery_cost),
        productId: r.product_id,
        productName: r.product_name,
        category: r.category,
        costPrice: cp,
        sellingPrice: sp,
        sizes,
        totalQuantity: qty,
        totalCost: cp * qty,
        totalSelling: sp * qty,
        totalProfit: (sp - cp) * qty,
        image: r.product_image
      };
    }));
  } catch (err) {
    console.error('Get all storage items error:', err);
    res.status(500).json({ error: 'Failed to fetch storage items.' });
  }
});

/* ── POST /api/admin/containers/:id/items/:itemId/push-to-product ── */
/* Push a container item into the products catalog as a new product. */
router.post('/containers/:id/items/:itemId/push-to-product', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT ci.*, c.number AS container_number FROM container_items ci JOIN containers c ON c.id = ci.container_id WHERE ci.id=? AND ci.container_id=?',
      [req.params.itemId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Container item not found.' });

    const ci = rows[0];
    const sizesObj = ci.sizes ? (typeof ci.sizes === 'string' ? JSON.parse(ci.sizes) : ci.sizes) : {};
    const sizeKeys = Object.keys(sizesObj).filter(k => sizesObj[k] > 0);
    const stockQty = Number(ci.total_quantity);
    const sizeStock = {};
    sizeKeys.forEach(k => { sizeStock[k] = sizesObj[k]; });

    const payload = req.body || {};
    const productName = (payload.name || ci.product_name || '').trim();
    const category = payload.category || ci.category || '';

    if (!productName) return res.status(400).json({ error: 'Product name is required.' });
    if (!category) return res.status(400).json({ error: 'Category is required.' });

    const [result] = await db.execute(
      `INSERT INTO products (name, category, price, cost_price, profit, shipping, in_stock, stock_mode, stock_qty, size_stock, sizes, image_url, owner_id)
       VALUES (?,?,?,?,?,?,1,'count',?,?,?,NULL,?)`,
      [
        productName, category,
        parseFloat(ci.selling_price) || 0,
        parseFloat(ci.cost_price) || 0,
        (parseFloat(ci.selling_price) - parseFloat(ci.cost_price)) || 0,
        0,
        stockQty,
        JSON.stringify(sizeStock),
        JSON.stringify(sizeKeys.length ? sizeKeys : ['ONE SIZE']),
        req.user.id
      ]
    );
    res.status(201).json({ productId: result.insertId, message: `Product "${productName}" created (ID: #${result.insertId}).` });
  } catch (err) {
    console.error('Push to product error:', err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

/* ════════════════════════════════════════════════════════════
   ADMIN ANALYTICS
   ════════════════════════════════════════════════════════════ */

/* ── GET /api/admin/analytics ──────────────────────────── */
/* Super admin sees all admins; regular admin sees only their own. */
router.get('/analytics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const isSuper = req.user.role === 'super_admin';
    const targetId = isSuper ? null : req.user.id;

    const [admins] = await db.execute(
      `SELECT id, name, email, role FROM users WHERE role IN ('admin','super_admin') ORDER BY role DESC, name ASC`
    );

    const analytics = [];

    for (const adm of admins) {
      if (!isSuper && adm.id !== req.user.id) continue;

      /* Orders taken by this admin */
      const [[orderStats]] = await db.execute(
        `SELECT COUNT(*) AS orderCount,
                COALESCE(SUM(o.total), 0) AS orderRevenue,
                COALESCE(SUM(oi.unit_profit * oi.quantity), 0) AS orderProfit,
                COALESCE(SUM(oi.unit_cost * oi.quantity), 0) AS orderCost
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.taken_by = ? AND o.status = 'delivered'`,
        [adm.id]
      );

      /* Products created by this admin */
      const [[productStats]] = await db.execute(
        `SELECT COUNT(*) AS productCount,
                COALESCE(SUM(p.cost_price), 0) AS productTotalCost,
                COALESCE(SUM(p.profit), 0) AS productTotalProfit
         FROM products p
         WHERE p.owner_id = ?`,
        [adm.id]
      );

      /* Items added to storage by this admin */
      const [[storageStats]] = await db.execute(
        `SELECT COUNT(*) AS storageItemCount,
                COALESCE(SUM(ci.cost_price * ci.total_quantity), 0) AS storageCost,
                COALESCE(SUM((ci.selling_price - ci.cost_price) * ci.total_quantity), 0) AS storageProfit
         FROM container_items ci
         WHERE ci.added_by = ?`,
        [adm.id]
      );

      /* Containers created by this admin */
      const [[containerStats]] = await db.execute(
        `SELECT COUNT(*) AS containerCount,
                COALESCE(SUM(c.delivery_cost), 0) AS totalDeliveryCost
         FROM containers c
         WHERE c.created_by = ?`,
        [adm.id]
      );

      analytics.push({
        adminId: adm.id,
        name: adm.name,
        email: adm.email,
        role: adm.role,
        orders: {
          count: Number(orderStats.orderCount),
          revenue: parseFloat(orderStats.orderRevenue),
          profit: parseFloat(orderStats.orderProfit),
          cost: parseFloat(orderStats.orderCost)
        },
        products: {
          count: Number(productStats.productCount),
          totalCost: parseFloat(productStats.productTotalCost),
          totalProfit: parseFloat(productStats.productTotalProfit)
        },
        storage: {
          itemCount: Number(storageStats.storageItemCount),
          cost: parseFloat(storageStats.storageCost),
          profit: parseFloat(storageStats.storageProfit)
        },
        containers: {
          count: Number(containerStats.containerCount),
          deliveryCost: parseFloat(containerStats.totalDeliveryCost)
        },
        combined: {
          totalProfit: parseFloat(orderStats.orderProfit) + parseFloat(productStats.productTotalProfit) + parseFloat(storageStats.storageProfit),
          totalCost: parseFloat(orderStats.orderCost) + parseFloat(productStats.productTotalCost) + parseFloat(storageStats.storageCost),
          totalRevenue: parseFloat(orderStats.orderRevenue)
        }
      });
    }

    /* Global totals (super admin only) */
    let globalTotals = null;
    if (isSuper) {
      const [[gt]] = await db.execute(
        `SELECT
           (SELECT COALESCE(SUM(oi.unit_profit * oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'delivered') AS allOrderProfit,
           (SELECT COALESCE(SUM(oi.unit_cost * oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'delivered') AS allOrderCost,
           (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.status = 'delivered') AS allOrderRevenue,
           (SELECT COALESCE(SUM(p.profit), 0) FROM products p) AS allProductProfit,
           (SELECT COALESCE(SUM(p.cost_price), 0) FROM products p) AS allProductCost,
           (SELECT COALESCE(SUM(ci.cost_price * ci.total_quantity), 0) FROM container_items ci) AS allStorageCost,
           (SELECT COALESCE(SUM((ci.selling_price - ci.cost_price) * ci.total_quantity), 0) FROM container_items ci) AS allStorageProfit,
           (SELECT COALESCE(SUM(c.delivery_cost), 0) FROM containers c) AS allDeliveryCost`
      );
      globalTotals = {
        orderProfit: parseFloat(gt.allOrderProfit),
        orderCost: parseFloat(gt.allOrderCost),
        orderRevenue: parseFloat(gt.allOrderRevenue),
        productProfit: parseFloat(gt.allProductProfit),
        productCost: parseFloat(gt.allProductCost),
        storageCost: parseFloat(gt.allStorageCost),
        storageProfit: parseFloat(gt.allStorageProfit),
        deliveryCost: parseFloat(gt.allDeliveryCost),
        grandProfit: parseFloat(gt.allOrderProfit) + parseFloat(gt.allProductProfit) + parseFloat(gt.allStorageProfit),
        grandCost: parseFloat(gt.allOrderCost) + parseFloat(gt.allProductCost) + parseFloat(gt.allStorageCost) + parseFloat(gt.allDeliveryCost)
      };
    }

    res.json({ analytics, globalTotals });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

/* ════════════════════════════════════════════════════════════
   SPONSOR ANALYTICS (super admin + regular admin)
   ════════════════════════════════════════════════════════════ */

/* ── GET /api/admin/sponsor-analytics ──────────────────── */
/* Shows each sponsor's performance: items added, sold, revenue, profit, commission */
router.get('/sponsor-analytics', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [commRows] = await db.execute(
      "SELECT value FROM settings WHERE key_name = 'sponsor_commission_pct'"
    );
    const commissionPct = commRows.length ? parseFloat(commRows[0].value) || 20 : 20;

    const [sponsors] = await db.execute(
      `SELECT u.id, u.name, u.email FROM users u WHERE u.role = 'sponsor' ORDER BY u.name ASC`
    );

    const analytics = [];
    for (const sp of sponsors) {
      /* Products added */
      const [[{ productCount }]] = await db.execute(
        'SELECT COUNT(*) AS productCount FROM products WHERE owner_id = ?',
        [sp.id]
      );

      /* Items sold, revenue, profit (delivered orders only) */
      const [[sales]] = await db.execute(
        `SELECT COALESCE(SUM(oi.quantity), 0) AS totalSold,
                COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS totalRevenue,
                COALESCE(SUM(oi.unit_profit * oi.quantity), 0) AS totalProfit
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         JOIN orders o ON o.id = oi.order_id
         WHERE p.owner_id = ? AND o.status = 'delivered'`,
        [sp.id]
      );

      /* Orders count */
      const [[{ orderCount }]] = await db.execute(
        `SELECT COUNT(DISTINCT o.id) AS orderCount
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE p.owner_id = ? AND o.status = 'delivered'`,
        [sp.id]
      );

      const totalProfit = parseFloat(sales.totalProfit);
      const commission = totalProfit * (commissionPct / 100);
      const sponsorEarnings = totalProfit - commission;

      /* Store name */
      const [[cat]] = await db.execute(
        'SELECT name FROM categories WHERE owner_id = ? LIMIT 1',
        [sp.id]
      );

      analytics.push({
        sponsorId: sp.id,
        name: sp.name,
        email: sp.email,
        storeName: cat ? cat.name : null,
        productCount: Number(productCount),
        totalSold: Number(sales.totalSold),
        totalRevenue: parseFloat(sales.totalRevenue),
        totalProfit,
        commissionPct,
        commission,
        sponsorEarnings,
        orderCount: Number(orderCount)
      });
    }

    /* Global totals */
    const [[gt]] = await db.execute(
      `SELECT
        COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS allRevenue,
        COALESCE(SUM(oi.unit_profit * oi.quantity), 0) AS allProfit,
        COALESCE(SUM(oi.quantity), 0) AS allSold
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       JOIN users u ON u.id = p.owner_id
       WHERE u.role = 'sponsor' AND o.status = 'delivered'`
    );

    res.json({
      commissionPct,
      globalRevenue: parseFloat(gt.allRevenue),
      globalProfit: parseFloat(gt.allProfit),
      globalCommission: parseFloat(gt.allProfit) * (commissionPct / 100),
      globalSold: Number(gt.allSold),
      sponsors: analytics
    });
  } catch (err) {
    console.error('Sponsor analytics error:', err);
    res.status(500).json({ error: 'Failed to load sponsor analytics.' });
  }
});

/* ── GET /api/admin/push/status ────────────────────────── */
router.get('/push/status', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[devices]] = await db.execute(
      `SELECT
         COUNT(*)                            AS total,
         COALESCE(SUM(is_active = 1), 0)     AS active,
         COUNT(DISTINCT CASE WHEN is_active = 1 THEN user_id END) AS activeUsers,
         COALESCE(SUM(is_active = 1 AND platform = 'android'), 0) AS activeAndroid,
         COALESCE(SUM(is_active = 1 AND platform = 'ios'), 0)     AS activeIos
       FROM device_tokens`
    );

    const firebase = pushSvc.getPushConfigStatus();
    const lastTest = await pushSvc.lastTestResult();

    res.json({
      deliveryMode: firebase.deliveryMode,
      firebase: {
        installed: firebase.installed,
        configured: firebase.configured,
        configuredVia: firebase.configuredVia,
        projectId: firebase.projectId,
        configError: firebase.configError,
        env: firebase.env
      },
      devices: {
        total: Number(devices.total),
        active: Number(devices.active),
        activeUsers: Number(devices.activeUsers),
        byPlatform: { android: Number(devices.activeAndroid), ios: Number(devices.activeIos) }
      },
      lastTest
    });
  } catch (err) {
    console.error('Push status error:', err);
    res.status(500).json({ error: 'Failed to load push status.' });
  }
});

/* ── POST /api/admin/push/test ─────────────────────────── */
router.post('/push/test', requireAuth, requireAdmin, pushTestLimiter, async (req, res) => {
  const { title, message, type = 'general', audience = 'all', targetRole = null, targetUserId = null, token = null } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required.' });
  }
  if (message.trim().length > 300) {
    return res.status(400).json({ error: 'message must be 300 characters or fewer.' });
  }
  if (title != null && (typeof title !== 'string' || title.trim().length > 200)) {
    return res.status(400).json({ error: 'title must be a string up to 200 characters.' });
  }
  if (type && typeof type === 'string' && !['general','product','category','order','account','promotion','system'].includes(type)) {
    return res.status(400).json({ error: 'Invalid notification type.' });
  }

  const hasToken = typeof token === 'string' && token.trim().length > 0;

  /* Single-token test push: audience is ignored. */
  if (hasToken) {
    if (token.trim().length > pushSvc.MAX_TOKEN_LEN) {
      return res.status(400).json({ error: 'token is too long.' });
    }
    try {
      const result = await pushSvc.sendTestPush({ title, message, type, token: token.trim() });
      return res.json({ result });
    } catch (err) {
      console.error('Push test error:', err);
      return res.status(500).json({ error: 'Failed to run push test.' });
    }
  }

  /* Audience-based test push (dry-run projections until configured). */
  if (!['all', 'role', 'user'].includes(audience)) {
    return res.status(400).json({ error: 'Invalid audience. Must be "all", "role" or "user".' });
  }
  const VALID_ROLES = ['customer', 'sponsor', 'admin', 'super_admin'];
  if (audience === 'role' && !VALID_ROLES.includes(targetRole)) {
    return res.status(400).json({ error: 'A valid targetRole is required when audience is "role".' });
  }

  try {
    let userId = null;
    if (audience === 'user') {
      userId = parseInt(targetUserId, 10);
      if (!userId || userId < 1) {
        return res.status(400).json({ error: 'A valid targetUserId is required when audience is "user".' });
      }
      const [ur] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
      if (!ur.length) {
        return res.status(404).json({ error: 'Target user not found.' });
      }
    }
    const result = await pushSvc.sendTestPush({ title, message, type, audience, targetRole: audience === 'role' ? targetRole : null, targetUserId: userId });
    res.json({ result });
  } catch (err) {
    console.error('Push test error:', err);
    res.status(500).json({ error: 'Failed to run push test.' });
  }
});

module.exports = router;
