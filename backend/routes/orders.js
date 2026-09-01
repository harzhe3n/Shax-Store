'use strict';
/**
 * Shax Store — Order Routes
 * POST /api/orders              (auth required — places order + fires Telegram)
 * GET  /api/orders/my           (auth required — user's own orders)
 * GET  /api/orders              (admin only — all orders)
 * PUT  /api/orders/:id/status   (admin only)
 * DELETE /api/orders/:id        (admin only)
 */
const router = require('express').Router();
const db     = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendOrderNotification, sendSponsorOrderNotification, sendSponsorStatusNotification, sendMessage } = require('../services/telegram');
const orderAlerts = require('../services/orderAlerts');

/* ── POST /api/orders ──────────────────────────────────── */
const ALLOWED_CITIES = ['Erbil', 'Slemani', 'Duhok'];

/**
 * Return an order's items back into stock. Used when an order is cancelled or
 * deleted. Only affects count-mode products (per-size stock). Safe to call for
 * any order id — it no-ops for products that don't track per-size stock.
 * Pass the order's items if you already have them, otherwise they're fetched.
 */
async function restockOrder(orderId, items) {
  try {
    let lines = items;
    if (!lines) {
      const [rows] = await db.execute(
        'SELECT product_id, size, quantity FROM order_items WHERE order_id = ?', [orderId]
      );
      lines = rows;
    }
    for (const it of lines) {
      const pid = it.product_id;
      const size = it.size;
      const qty  = parseInt(it.quantity) || 0;
      if (!pid || !size || qty <= 0) continue;

      const [prow] = await db.execute(
        'SELECT stock_mode, size_stock FROM products WHERE id = ?', [pid]
      );
      if (!prow.length || prow[0].stock_mode !== 'count' || !prow[0].size_stock) continue;

      let ss = {};
      try { ss = typeof prow[0].size_stock === 'string' ? JSON.parse(prow[0].size_stock) : prow[0].size_stock; }
      catch { ss = {}; }
      // Only restock sizes the product actually has.
      if (ss[size] == null) continue;
      ss[size] = (Number(ss[size]) || 0) + qty;

      const newTotal = Object.values(ss).reduce((s, n) => s + (Number(n) || 0), 0);
      await db.execute(
        'UPDATE products SET size_stock = ?, stock_qty = ?, in_stock = ? WHERE id = ?',
        [JSON.stringify(ss), newTotal, newTotal > 0 ? 1 : 0, pid]
      );
    }
  } catch (err) {
    console.error('Restock error for order', orderId, err.message);
  }
}

router.post('/', requireAuth, async (req, res) => {
  const { customer_name, phone, city, address, note, items, latitude, longitude } = req.body || {};

  if (!customer_name || !phone || !address || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'customer_name, phone, address and items are required.' });
  }
  if (!city || !ALLOWED_CITIES.includes(city)) {
    return res.status(400).json({ error: 'Please choose a valid city (Erbil, Slemani, or Duhok).' });
  }

  // Optional location — only kept if both coordinates are valid numbers in range.
  let lat = null, lng = null;
  if (latitude != null && longitude != null) {
    const la = parseFloat(latitude), lo = parseFloat(longitude);
    if (!isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180) {
      lat = la; lng = lo;
    }
  }

  const orderId = 'SX' + Date.now();

  try {
    /* Look up each product's authoritative price/cost/profit from the DB.
       Never trust client-sent money values. Falls back to the sent unit_price
       for any line whose product no longer exists (cost = price, profit = 0). */
    const priced = [];
    for (const item of items) {
      let unitPrice = Math.max(0, parseFloat(item.unit_price) || 0);
      let unitCost  = unitPrice;
      let unitProfit = 0;
      let imageUrl  = null;
      let unitShipping = 0;

      if (item.product_id) {
        const [rows] = await db.execute(
          'SELECT price, cost_price, profit, shipping, image_url, stock_mode, size_stock FROM products WHERE id = ?',
          [item.product_id]
        );
        if (rows.length) {
          unitPrice    = parseFloat(rows[0].price);
          unitCost     = parseFloat(rows[0].cost_price);
          unitProfit   = parseFloat(rows[0].profit);
          unitShipping = parseFloat(rows[0].shipping) || 0;
          imageUrl     = rows[0].image_url || null;
        }
      }

      priced.push({
        product_id  : item.product_id || null,
        product_name: item.product_name,
        size        : item.size || '',
        color       : item.color || '',
        quantity    : Math.max(1, parseInt(item.quantity, 10) || 1),
        unit_price  : unitPrice,
        unit_cost   : unitCost,
        unit_profit : unitProfit,
        shipping    : unitShipping,
        image_url   : imageUrl
      });
    }

const itemsTotal = priced.reduce((s, i) => s + i.unit_price * i.quantity, 0);

// Charge shipping only once for the entire order (highest shipping cost).
const shippingTotal = priced.length
  ? Math.max(...priced.map(i => parseFloat(i.shipping) || 0))
  : 0;

const total = itemsTotal + shippingTotal;

    // Enforce the store-wide minimum order amount (on items, before shipping).
    const [moRows] = await db.execute('SELECT value FROM settings WHERE key_name = ?', ['min_order_amount']);
    const minOrder = moRows.length ? parseFloat(moRows[0].value) || 0 : 0;
    if (minOrder > 0 && itemsTotal < minOrder) {
      return res.status(400).json({
        error: `Minimum order is ${Math.round(minOrder).toLocaleString('en-US')} IQD. Please add more items.`,
        minOrder
      });
    }

    await db.execute(
      `INSERT INTO orders (id, user_id, customer_name, email, phone, city, address, note, total, shipping_total, latitude, longitude)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderId, req.user.id, customer_name.trim(), req.user.email,
       phone.trim(), city || '', address.trim(), note || '', total, shippingTotal, lat, lng]
    );

    /* Record the 'pending' (placed) entry so the tracking timeline starts
       at checkout. Best-effort — never blocks the response. */
    await orderAlerts.logOrderStatus({
      orderId, status: 'pending', userId: req.user.id, userName: req.user.name, note: 'Order placed'
    });

    for (const it of priced) {
      await db.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, size, color, quantity, unit_price, unit_cost, unit_profit)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [orderId, it.product_id, it.product_name, it.size, it.color,
         it.quantity, it.unit_price, it.unit_cost, it.unit_profit]
      );

      /* Reduce per-size stock for count-mode products. Reads the current
         size_stock, subtracts the ordered size (floored at 0), writes it
         back, and refreshes stock_qty + in_stock from the new totals. */
      if (it.product_id && it.size) {
        const [prow] = await db.execute(
          'SELECT stock_mode, size_stock FROM products WHERE id = ?', [it.product_id]
        );
        if (prow.length && prow[0].stock_mode === 'count' && prow[0].size_stock) {
          let ss = {};
          try { ss = typeof prow[0].size_stock === 'string' ? JSON.parse(prow[0].size_stock) : prow[0].size_stock; }
          catch { ss = {}; }
          if (ss[it.size] != null) {
            ss[it.size] = Math.max(0, (Number(ss[it.size]) || 0) - it.quantity);
            const newTotal = Object.values(ss).reduce((s, n) => s + (Number(n) || 0), 0);
            await db.execute(
              'UPDATE products SET size_stock = ?, stock_qty = ?, in_stock = ? WHERE id = ?',
              [JSON.stringify(ss), newTotal, newTotal > 0 ? 1 : 0, it.product_id]
            );
          }
        }
      }
    }

    /* Fire-and-forget Telegram notification — never blocks the response */
    sendOrderNotification({
      orderId, customer: customer_name, email: req.user.email,
      phone, city, address, note,
      latitude: lat, longitude: lng,
      shippingTotal,
      items: priced.map(i => ({ id: i.product_id, name: i.product_name, size: i.size, color: i.color, qty: i.quantity, price: i.unit_price, image_url: i.image_url })),
      total
    }).catch(e => console.error('Telegram notification failed:', e.message));

    /* Send filtered Telegram notifications to sponsors whose products are in this order */
    try {
      const sponsorChatMap = {};
      for (const it of priced) {
        if (!it.product_id) continue;
        const [prows] = await db.execute(
          'SELECT p.owner_id, u.telegram_chat_id FROM products p JOIN users u ON u.id = p.owner_id WHERE p.id = ? AND u.role = ?',
          [it.product_id, 'sponsor']
        );
        if (prows.length && prows[0].telegram_chat_id) {
          const sid = prows[0].owner_id;
          if (!sponsorChatMap[sid]) sponsorChatMap[sid] = { chatId: prows[0].telegram_chat_id, items: [] };
          sponsorChatMap[sid].items.push({
            id: it.product_id, name: it.product_name, size: it.size, color: it.color,
            qty: it.quantity, price: it.unit_price, image_url: it.image_url
          });
        }
      }
      for (const [, data] of Object.entries(sponsorChatMap)) {
        sendSponsorOrderNotification({
          orderId, customer: customer_name, email: req.user.email,
          phone, city, address, note, total
        }, data.chatId, data.items).catch(e => console.error('Sponsor Telegram failed:', e.message));
      }
    } catch (e) { console.error('Sponsor notification lookup failed:', e.message); }

    res.status(201).json({ orderId, message: 'Order placed successfully.' });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ error: 'Failed to place order.' });
  }
});

/* ── GET /api/orders/my ────────────────────────────────── */
router.get('/my', requireAuth, async (req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT id, customer_name, email, phone, city, address, note, total, status, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );

    const result = await Promise.all(orders.map(async o => {
      const [items] = await db.execute(
        'SELECT product_name, size, quantity, unit_price FROM order_items WHERE order_id = ?',
        [o.id]
      );
      return {
        id      : o.id,
        customer: o.customer_name,
        email   : o.email,
        phone   : o.phone,
        city    : o.city,
        address : o.address,
        note    : o.note,
        total   : parseFloat(o.total),
        status  : o.status,
        date    : o.created_at,
        items   : items.map(i => ({
          name : i.product_name,
          size : i.size,
          qty  : i.quantity,
          price: parseFloat(i.unit_price)
        }))
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('Get my orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

/* ── GET /api/orders/my/:id (owner or admin) ───────────── */
/* Per-order detail with the full status timeline used by the customer
   tracking view. Scoped to the authenticated owner; admins may read any
   order. Never exposes another user's order. */
router.get('/my/:id', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.isAdmin || req.user.role === 'admin' || req.user.role === 'super_admin';
    const [rows] = isAdmin
      ? await db.execute(
          `SELECT id, customer_name, email, phone, city, address, note, total, shipping_total, status, created_at
           FROM orders WHERE id = ?`, [req.params.id])
      : await db.execute(
          `SELECT id, customer_name, email, phone, city, address, note, total, shipping_total, status, created_at
           FROM orders WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found.' });

    const o = rows[0];
    const [items] = await db.execute(
      'SELECT product_name, size, quantity, unit_price FROM order_items WHERE order_id = ?',
      [o.id]
    );
    const [timeline] = await db.execute(
      `SELECT status, changed_by_name, note, created_at
       FROM order_status_log WHERE order_id = ?
       ORDER BY created_at ASC, id ASC`, [o.id]
    );

    res.json({
      id            : o.id,
      customer      : o.customer_name,
      email         : o.email,
      phone         : o.phone,
      city          : o.city,
      address       : o.address,
      note          : o.note,
      total         : parseFloat(o.total),
      shippingTotal : parseFloat(o.shipping_total) || 0,
      status        : o.status,
      date          : o.created_at,
      items         : items.map(i => ({
        name : i.product_name,
        size : i.size,
        qty  : i.quantity,
        price: parseFloat(i.unit_price)
      })),
      timeline: timeline.map(r => ({
        status: r.status,
        by    : r.changed_by_name,
        note  : r.note,
        at    : r.created_at
      }))
    });
  } catch (err) {
    console.error('Get order tracking error:', err);
    res.status(500).json({ error: 'Failed to fetch order tracking.' });
  }
});

/* ── DELETE /api/orders/my/:id (user cancels own order) ── */
/* A logged-in user can cancel (delete) their own order any time before it has
   been delivered. The order and its items are removed; Telegram is notified. */
router.delete('/my/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, status, customer_name, total FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (rows[0].status === 'delivered') {
      return res.status(409).json({ error: 'Delivered orders cannot be cancelled.' });
    }

    // Return the items to stock before removing the order — but never twice:
    // if the order was already cancelled (e.g. by the admin), stock was
    // already restored, so a second restock would inflate inventory.
    if (rows[0].status !== 'cancelled') {
      await restockOrder(req.params.id);
    }

    await db.execute('DELETE FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

    const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
    sendMessage(
      `❌ <b>Order ${req.params.id} cancelled by the customer</b>\n` +
      `👤 ${rows[0].customer_name}\n💰 ${fmt(rows[0].total)}`
    ).catch(e => console.error('Telegram cancel notice failed:', e.message));

    /* Confirm the cancellation to the customer (in-app + best-effort push).
       The order row is already gone, so there is nothing left to log — the
       timeline row was removed with the order (cascade). */
    await orderAlerts.notifyCustomerStatus({
      orderId: req.params.id, status: 'cancelled', customerId: req.user.id
    });

    res.json({ message: 'Order cancelled.' });
  } catch (err) {
    console.error('User cancel order error:', err);
    res.status(500).json({ error: 'Failed to cancel order.' });
  }
});

/* ── GET /api/orders (admin) ───────────────────────────── */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT o.*,
         JSON_ARRAYAGG(JSON_OBJECT(
           'name',  oi.product_name,
           'size',  oi.size,
           'qty',   oi.quantity,
           'price', oi.unit_price
         )) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    res.json(orders.map(o => ({
      ...o,
      total: parseFloat(o.total),
      items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || [])
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

/* ── PUT /api/orders/:id/status (admin) ────────────────── */
router.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const valid = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const { status } = req.body || {};
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
  }
  try {
    // Check the current status first so we only restock on the transition
    // INTO cancelled (avoids restocking twice if cancelled repeatedly).
    const [cur] = await db.execute('SELECT status FROM orders WHERE id = ?', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Order not found.' });
    const wasCancelled = cur[0].status === 'cancelled';

    const [r] = await db.execute(
      'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' });

    // Newly cancelled → return items to stock.
    if (status === 'cancelled' && !wasCancelled) {
      await restockOrder(req.params.id);
    }

    // Notify Telegram on every status change.
    const [rows] = await db.execute(
      'SELECT customer_name, total FROM orders WHERE id = ?', [req.params.id]
    );
    const fmt = v => `${Math.round(parseFloat(v) || 0).toLocaleString('en-US')} IQD`;
    const who = rows.length ? rows[0].customer_name : '';
    const amt = rows.length ? ` — ${fmt(rows[0].total)}` : '';
    const icons = {
      pending: '🕒', processing: '🔧', shipped: '🚚', delivered: '✅', cancelled: '🚫'
    };
    const verb = status === 'cancelled' ? 'cancelled' : `marked as <b>${status}</b>`;
    sendMessage(`${icons[status] || '🔔'} <b>Order ${req.params.id}</b> ${verb} by ${req.user.name}\n👤 ${who}${amt}`)
      .catch(e => console.error('Telegram status notice failed:', e.message));

    /* Notify sponsors whose products are in this order about the status change */
    try {
      const [sponsorRows] = await db.execute(
        `SELECT DISTINCT p.owner_id, u.telegram_chat_id
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         JOIN users u ON u.id = p.owner_id
         WHERE oi.order_id = ? AND u.role = 'sponsor' AND u.telegram_chat_id IS NOT NULL`,
        [req.params.id]
      );
      for (const sr of sponsorRows) {
        sendSponsorStatusNotification(req.params.id, status, who, rows.length ? rows[0].total : 0, sr.telegram_chat_id)
          .catch(e => console.error('Sponsor status notice failed:', e.message));
      }
    } catch (e) { console.error('Sponsor status lookup failed:', e.message); }

    /* Track the change for the customer timeline + notify the order owner
       (in-app + best-effort native push). Only on an ACTUAL change — a no-op
       re-save of the same status is still accepted/announced on Telegram as
       before, but must not duplicate timeline entries or notifications. */
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
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

/* ── PUT /api/orders/:id/take (admin) ──────────────────── */
/* Claim an order. Uses a conditional UPDATE so two admins can't both grab the
   same unclaimed order — only the first one succeeds. */
router.put('/:id/take', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await db.execute(
      'UPDATE orders SET taken_by = ?, taken_by_name = ?, updated_at = NOW() WHERE id = ? AND taken_by IS NULL',
      [req.user.id, req.user.name, req.params.id]
    );
    if (!r.affectedRows) {
      // Either the order doesn't exist or someone already took it.
      const [rows] = await db.execute('SELECT taken_by_name FROM orders WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Order not found.' });
      return res.status(409).json({ error: `Already taken by ${rows[0].taken_by_name || 'another admin'}.` });
    }
    // Announce on Telegram who took the order (fire-and-forget).
    sendMessage(`🙋 <b>Order ${req.params.id}</b> taken by <b>${req.user.name}</b>`)
      .catch(e => console.error('Telegram take notice failed:', e.message));
    res.json({ message: 'Order taken.', takenBy: req.user.name });
  } catch (err) {
    console.error('Take order error:', err);
    res.status(500).json({ error: 'Failed to take order.' });
  }
});

/* ── PUT /api/orders/:id/release (admin) ───────────────── */
/* Release a claimed order back to unclaimed. Any admin can release it. */
router.put('/:id/release', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await db.execute(
      'UPDATE orders SET taken_by = NULL, taken_by_name = NULL, updated_at = NOW() WHERE id = ?',
      [req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' });
    sendMessage(`↩️ <b>Order ${req.params.id}</b> released by <b>${req.user.name}</b> — available again`)
      .catch(e => console.error('Telegram release notice failed:', e.message));
    res.json({ message: 'Order released.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to release order.' });
  }
});

/* ── DELETE /api/orders/clear (admin) ──────────────────── */
/* Bulk-delete orders. Body: { status }.
   - status omitted or "all"  → delete every order
   - status = pending|processing|shipped|delivered|cancelled → that status only
   order_items rows are removed automatically (ON DELETE CASCADE). */
router.delete('/clear', requireAuth, requireAdmin, async (req, res) => {
  const valid = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  const status = (req.body && req.body.status) || 'all';

  if (status !== 'all' && !valid.includes(status)) {
    return res.status(400).json({ error: `Status must be "all" or one of: ${valid.join(', ')}` });
  }

  try {
    /* Before deleting, return stock for orders that were still holding it.
       Cancelled orders already returned their stock; delivered orders were
       genuinely sold — neither should be restocked. */
    let toRestock;
    if (status === 'all') {
      [toRestock] = await db.execute(
        "SELECT id FROM orders WHERE status NOT IN ('cancelled','delivered')"
      );
    } else if (status !== 'cancelled' && status !== 'delivered') {
      [toRestock] = await db.execute('SELECT id FROM orders WHERE status = ?', [status]);
    } else {
      toRestock = [];
    }
    for (const o of toRestock) {
      await restockOrder(o.id);
    }

    let result;
    if (status === 'all') {
      [result] = await db.execute('DELETE FROM orders');
    } else {
      [result] = await db.execute('DELETE FROM orders WHERE status = ?', [status]);
    }
    res.json({
      message: `Cleared ${result.affectedRows} order(s).`,
      deleted: result.affectedRows
    });
  } catch (err) {
    console.error('Clear orders error:', err);
    res.status(500).json({ error: 'Failed to clear orders.' });
  }
});

/* ── DELETE /api/orders/:id (admin) ────────────────────── */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Restock only if the order was still holding stock (active order).
    const [cur] = await db.execute('SELECT status FROM orders WHERE id = ?', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Order not found.' });
    if (cur[0].status !== 'cancelled' && cur[0].status !== 'delivered') {
      await restockOrder(req.params.id);
    }

    const [r] = await db.execute('DELETE FROM orders WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' });
    res.json({ message: 'Order deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order.' });
  }
});

module.exports = router;
