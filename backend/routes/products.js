'use strict';
/**
 * Shax Store — Product Routes
 * GET    /api/products
 * GET    /api/products/:id
 * POST   /api/products       (admin or sponsor)
 * PUT    /api/products/:id   (admin, or sponsor for their own products)
 * DELETE /api/products/:id   (admin, or sponsor for their own products)
 *
 * Profit model (per product):
 *   - cost_price = what the item costs the store (the "original price")
 *   - profit     = the store's markup, a fixed IQD amount
 *   - price      = selling price shown to customers
 *   Admins enter cost + profit; the selling price is computed as cost + profit.
 *   Sponsors enter only the selling price (their own goods); their products
 *   carry profit = 0 and cost = price, so they don't affect store profit totals.
 */
const router = require('express').Router();
const db     = require('../config/db');
const { requireAuth, requireAdmin, requireSponsorOrAdmin } = require('../middleware/auth');

function isAdmin(u)   { return u && (u.isAdmin || u.role === 'admin'); }
function isSponsor(u) { return u && u.role === 'sponsor'; }

/* Clean an incoming colors array to [{name, hex, image}] with valid hex values.
   image is optional (falls back to the main product image on the storefront).
   Caps at 20 colors and trims names to keep data tidy. */
function sanitizeColors(colors) {
  if (!Array.isArray(colors)) return [];
  const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const out = [];
  for (const c of colors) {
    if (!c || typeof c !== 'object') continue;
    const name = String(c.name || '').trim().slice(0, 40);
    const hex  = String(c.hex || '').trim();
    if (!name || !hexRe.test(hex)) continue;
    const entry = { name, hex };
    const image = String(c.image || '').trim();
    if (image) entry.image = image.slice(0, 500);
    out.push(entry);
    if (out.length >= 20) break;
  }
  return out;
}

function normalise(p, viewer) {
  const stockMode = p.stock_mode || 'hidden';
  const stockQty  = p.stock_qty != null ? Number(p.stock_qty) : 0;

  // Per-size stock is stored as JSON like {"S":2,"M":1,"L":0}.
  let sizeStock = {};
  if (p.size_stock) {
    try { sizeStock = typeof p.size_stock === 'string' ? JSON.parse(p.size_stock) : p.size_stock; }
    catch { sizeStock = {}; }
  }
  const sizeStockTotal = Object.values(sizeStock).reduce((s, n) => s + (Number(n) || 0), 0);

  // Effective availability:
  //   'out'    → never in stock
  //   'count'  → in stock only if the per-size quantities add up to > 0
  //   'hidden' → use the in_stock flag
  let inStock;
  if (stockMode === 'out')        inStock = false;
  else if (stockMode === 'count') inStock = sizeStockTotal > 0;
  else                            inStock = Boolean(p.in_stock);

  const out = {
    ...p,
    sizes      : typeof p.sizes === 'string' ? JSON.parse(p.sizes || '[]') : (p.sizes || []),
    colors     : (() => {
      if (!p.colors) return [];
      try { return typeof p.colors === 'string' ? JSON.parse(p.colors) : p.colors; }
      catch { return []; }
    })(),
    inStock,
    stockMode,
    // Only expose per-size counts when the admin chose the count mode.
    sizeStock  : stockMode === 'count' ? sizeStock : null,
    stockQty   : stockMode === 'count' ? sizeStockTotal : null,
    price      : parseFloat(p.price),
    oldPrice   : p.old_price ? parseFloat(p.old_price) : null,
    shipping   : p.shipping != null ? parseFloat(p.shipping) : 0,
    image      : p.image_url || null,
    ownerId    : p.owner_id != null ? Number(p.owner_id) : null,
    soldCount  : p.sold_count != null ? Number(p.sold_count) : 0,
    avgRating  : p.avg_rating != null ? Math.round(parseFloat(p.avg_rating) * 10) / 10 : 0,
    reviewCount: p.review_count != null ? Number(p.review_count) : 0
  };
  // Only admins (and the owning sponsor) may see cost/profit; never the public.
  const privileged = isAdmin(viewer) || (isSponsor(viewer) && viewer.id === out.ownerId);
  if (privileged) {
    out.costPrice = p.cost_price != null ? parseFloat(p.cost_price) : 0;
    out.profit    = p.profit != null ? parseFloat(p.profit) : 0;
  } else {
    delete out.cost_price;
    delete out.profit;
  }

  // Show who added the product — admins only (keeps staff names off the public site).
  if (isAdmin(viewer)) {
    out.createdBy     = p.creator_name || null;
    out.createdByRole = p.creator_role || null;
  }
  delete out.creator_name;
  delete out.creator_role;

  return out;
}

/* Ratings are joined in as a subquery so listing stays a single query.
   The creator (owner) name/role is joined so the admin panel can show who
   added each product. Sold-count (from DELIVERED orders only) is joined so
   the storefront can rank products by popularity. */
const RATINGS_JOIN = `
  LEFT JOIN (
    SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
    FROM reviews GROUP BY product_id
  ) r ON r.product_id = p.id
  LEFT JOIN (
    SELECT oi.product_id, SUM(oi.quantity) AS sold_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'delivered'
    GROUP BY oi.product_id
  ) s ON s.product_id = p.id
  LEFT JOIN users cu ON cu.id = p.owner_id
`;

/* Decode the bearer token (if any) WITHOUT requiring it, so public GETs can
   still hide cost/profit while an admin/sponsor GET can see it. */
function peekUser(req) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return null;
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

/* Fetch filter tags for a set of product ids → { productId: [{id,name,...}] }. */
async function getFilterMap(productIds) {
  if (!productIds || !productIds.length) return {};
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT pf.product_id, f.id, f.name, f.name_ku, f.name_ar
     FROM product_filters pf
     JOIN filters f ON f.id = pf.filter_id
     WHERE pf.product_id IN (${placeholders})
     ORDER BY f.sort_order ASC, f.created_at ASC`,
    productIds
  );
  const map = {};
  for (const r of rows) {
    (map[r.product_id] = map[r.product_id] || []).push({
      id: r.id, name: r.name, name_ku: r.name_ku, name_ar: r.name_ar
    });
  }
  return map;
}

/* Replace a product's filter links with the given list of filter ids. */
async function setProductFilters(productId, filterIds) {
  await db.execute('DELETE FROM product_filters WHERE product_id = ?', [productId]);
  if (!Array.isArray(filterIds) || !filterIds.length) return;
  const unique = [...new Set(filterIds.filter(id => typeof id === 'string' && id))];
  if (!unique.length) return;
  const placeholders = unique.map(() => '?').join(',');
  const [valid] = await db.execute(`SELECT id FROM filters WHERE id IN (${placeholders})`, unique);
  for (const row of valid) {
    await db.execute('INSERT IGNORE INTO product_filters (product_id, filter_id) VALUES (?,?)', [productId, row.id]);
  }
}

/* ── GET /api/products ─────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const viewer = peekUser(req);
    const { category, filter, badge, in_stock, mine, sort } = req.query;
    let sql = `SELECT p.*, r.avg_rating, r.review_count, s.sold_count, cu.name AS creator_name, cu.role AS creator_role FROM products p ${RATINGS_JOIN} WHERE 1=1`;
    const params = [];
    if (category && category !== 'all') { sql += ' AND p.category = ?'; params.push(category); }
    if (filter && filter !== 'all') {
      sql += ' AND p.id IN (SELECT product_id FROM product_filters WHERE filter_id = ?)';
      params.push(filter);
    }
    if (badge)                           { sql += ' AND p.badge = ?';    params.push(badge); }
    if (in_stock !== undefined)          { sql += ' AND p.in_stock = ?'; params.push(in_stock === 'true' ? 1 : 0); }
    // Sponsors can request only their own products with ?mine=true
    if (mine === 'true' && isSponsor(viewer)) { sql += ' AND p.owner_id = ?'; params.push(viewer.id); }

    if (sort === 'price_asc') {
      sql += ' ORDER BY p.in_stock DESC, p.price ASC';
    } else if (sort === 'price_desc') {
      sql += ' ORDER BY p.in_stock DESC, p.price DESC';
    } else if (sort === 'popular') {
      /* Best products first: most units sold (delivered), then best-rated,
         then most-reviewed, then newest. In-stock items rank above sold-out. */
      sql += ` ORDER BY p.in_stock DESC,
                        COALESCE(s.sold_count, 0) DESC,
                        COALESCE(r.avg_rating, 0) DESC,
                        COALESCE(r.review_count, 0) DESC,
                        p.created_at DESC`;
    } else {
      sql += ' ORDER BY p.created_at ASC';
    }

    const [rows] = await db.execute(sql, params);
    const filterMap = await getFilterMap(rows.map(p => p.id));
    res.json(rows.map(p => {
      const out = normalise(p, viewer);
      out.filters = filterMap[p.id] || [];
      return out;
    }));
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

/* ── GET /api/products/:id ─────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const viewer = peekUser(req);
    const [rows] = await db.execute(
      `SELECT p.*, r.avg_rating, r.review_count, cu.name AS creator_name, cu.role AS creator_role FROM products p ${RATINGS_JOIN} WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found.' });
    const out = normalise(rows[0], viewer);
    const fm = await getFilterMap([rows[0].id]);
    out.filters = fm[rows[0].id] || [];
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

/* ── POST /api/products ────────────────────────────────── */
router.post('/', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  const {
    name, name_ku, name_ar, category, price, cost_price, profit, shipping, old_price, badge,
    description, description_ku, description_ar, sizes, in_stock, image_url,
    stock_mode, stock_qty, size_stock, colors, filters
  } = req.body || {};

  if (!name || !category) {
    return res.status(400).json({ error: 'name and category are required.' });
  }

  // Sanitize colors: keep only entries with a name + valid hex color.
  const cleanColors = sanitizeColors(colors);

  let shipCost = parseFloat(shipping);
  if (isNaN(shipCost) || shipCost < 0) shipCost = 0;   // 0 = free shipping

  const sizeList = Array.isArray(sizes) && sizes.length ? sizes : ['ONE SIZE'];

  // Resolve stock mode. For 'count', build a clean per-size stock map limited
  // to the product's actual sizes, with non-negative integer quantities.
  const mode = ['hidden', 'count', 'out'].includes(stock_mode) ? stock_mode : 'hidden';
  const cleanSizeStock = {};
  if (mode === 'count' && size_stock && typeof size_stock === 'object') {
    for (const sz of sizeList) {
      let q = parseInt(size_stock[sz]);
      cleanSizeStock[sz] = (isNaN(q) || q < 0) ? 0 : q;
    }
  }
  const sizeTotal = Object.values(cleanSizeStock).reduce((s, n) => s + n, 0);

  let inStockFlag;
  if (mode === 'out')        inStockFlag = 0;
  else if (mode === 'count') inStockFlag = sizeTotal > 0 ? 1 : 0;
  else                       inStockFlag = in_stock ? 1 : 0;

  // Work out the money fields based on who's adding it.
  let finalCost, finalProfit, finalPrice;
  if (isAdmin(req.user)) {
    finalCost   = parseFloat(cost_price);
    finalProfit = parseFloat(profit);
    if (isNaN(finalCost) || finalCost < 0)   return res.status(400).json({ error: 'A valid original price is required.' });
    if (isNaN(finalProfit) || finalProfit < 0) finalProfit = 0;
    finalPrice  = finalCost + finalProfit;       // selling price = cost + profit
  } else {
    // Sponsor: enters the selling price directly; no markup tracked.
    finalPrice  = parseFloat(price);
    if (isNaN(finalPrice) || finalPrice <= 0) return res.status(400).json({ error: 'A valid price is required.' });
    finalCost   = finalPrice;
    finalProfit = 0;
  }

  try {
    // Sponsors may only attach products to their OWN category.
    if (isSponsor(req.user)) {
      const [cat] = await db.execute('SELECT id FROM categories WHERE id = ? AND owner_id = ?', [category, req.user.id]);
      if (!cat.length) {
        return res.status(403).json({ error: 'You can only add products to your own store category.' });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO products
         (name, name_ku, name_ar, category, price, cost_price, profit, shipping, old_price, badge,
          description, description_ku, description_ar, sizes, in_stock, stock_mode, stock_qty, size_stock, colors, image_url, owner_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        name, name_ku || null, name_ar || null,
        category, finalPrice, finalCost, finalProfit, shipCost, old_price || null, badge || null,
        description || '', description_ku || '', description_ar || '',
        JSON.stringify(sizeList), inStockFlag, mode, sizeTotal,
        mode === 'count' ? JSON.stringify(cleanSizeStock) : null,
        cleanColors.length ? JSON.stringify(cleanColors) : null,
        image_url || null, req.user.id
      ]
    );
    await setProductFilters(result.insertId, filters);
    res.status(201).json({ id: result.insertId, message: 'Product created.' });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

/* ── PUT /api/products/:id ─────────────────────────────── */
router.put('/:id', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  const {
    name, name_ku, name_ar, category, price, cost_price, profit, shipping, old_price, badge,
    description, description_ku, description_ar, sizes, in_stock, image_url,
    stock_mode, stock_qty, size_stock, colors, filters
  } = req.body || {};

  if (!name || !category) {
    return res.status(400).json({ error: 'name and category are required.' });
  }

  const cleanColors = sanitizeColors(colors);

  let shipCost = parseFloat(shipping);
  if (isNaN(shipCost) || shipCost < 0) shipCost = 0;

  const sizeList = Array.isArray(sizes) && sizes.length ? sizes : ['ONE SIZE'];

  const mode = ['hidden', 'count', 'out'].includes(stock_mode) ? stock_mode : 'hidden';
  const cleanSizeStock = {};
  if (mode === 'count' && size_stock && typeof size_stock === 'object') {
    for (const sz of sizeList) {
      let q = parseInt(size_stock[sz]);
      cleanSizeStock[sz] = (isNaN(q) || q < 0) ? 0 : q;
    }
  }
  const sizeTotal = Object.values(cleanSizeStock).reduce((s, n) => s + n, 0);

  let inStockFlag;
  if (mode === 'out')        inStockFlag = 0;
  else if (mode === 'count') inStockFlag = sizeTotal > 0 ? 1 : 0;
  else                       inStockFlag = in_stock ? 1 : 0;

  try {
    // Fetch the existing product to check ownership.
    const [existing] = await db.execute('SELECT owner_id FROM products WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Product not found.' });

    if (isSponsor(req.user) && Number(existing[0].owner_id) !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own products.' });
    }

    let finalCost, finalProfit, finalPrice;
    if (isAdmin(req.user)) {
      finalCost   = parseFloat(cost_price);
      finalProfit = parseFloat(profit);
      if (isNaN(finalCost) || finalCost < 0)   return res.status(400).json({ error: 'A valid original price is required.' });
      if (isNaN(finalProfit) || finalProfit < 0) finalProfit = 0;
      finalPrice  = finalCost + finalProfit;
    } else {
      finalPrice  = parseFloat(price);
      if (isNaN(finalPrice) || finalPrice <= 0) return res.status(400).json({ error: 'A valid price is required.' });
      finalCost   = finalPrice;
      finalProfit = 0;
      // Sponsor can only keep it within their own category.
      const [cat] = await db.execute('SELECT id FROM categories WHERE id = ? AND owner_id = ?', [category, req.user.id]);
      if (!cat.length) return res.status(403).json({ error: 'You can only use your own store category.' });
    }

    const [result] = await db.execute(
      `UPDATE products
       SET name=?, name_ku=?, name_ar=?, category=?, price=?, cost_price=?, profit=?, shipping=?, old_price=?,
           badge=?, description=?, description_ku=?, description_ar=?,
           sizes=?, in_stock=?, stock_mode=?, stock_qty=?, size_stock=?, colors=?, image_url=?, updated_at=NOW()
       WHERE id = ?`,
      [
        name, name_ku || null, name_ar || null,
        category, finalPrice, finalCost, finalProfit, shipCost, old_price || null, badge || null,
        description || '', description_ku || '', description_ar || '',
        JSON.stringify(sizeList), inStockFlag, mode, sizeTotal,
        mode === 'count' ? JSON.stringify(cleanSizeStock) : null,
        cleanColors.length ? JSON.stringify(cleanColors) : null,
        image_url || null, req.params.id
      ]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found.' });
    if (filters !== undefined) await setProductFilters(Number(req.params.id), filters);
    res.json({ message: 'Product updated.' });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

/* ── DELETE /api/products/:id ──────────────────────────── */
router.delete('/:id', requireAuth, requireSponsorOrAdmin, async (req, res) => {
  try {
    const [existing] = await db.execute('SELECT owner_id FROM products WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Product not found.' });

    if (isSponsor(req.user) && Number(existing[0].owner_id) !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own products.' });
    }

    const [result] = await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

module.exports = router;
