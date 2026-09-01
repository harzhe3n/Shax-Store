'use strict';
/**
 * Shax Store — API Test Suite (Stage 10: Order Tracking + Status Notifications)
 *
 * Self-contained end-to-end HTTP tests against the REAL server (spawned on an
 * ephemeral port). Requires MySQL reachable via backend/.env (the shared dev
 * database is used, but every row this suite creates is removed in cleanup).
 *
 * Run:  node --test tests/api.test.js   (from the backend/ directory)
 *
 * Covers the Stage 10 order-tracking / status-notification additions, the
 * Stage 11 native push diagnostics (device tokens, dry-run test push), plus
 * targeted regressions of the existing auth / products / categories / orders
 * / notifications surface.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const BACKEND_DIR = path.join(__dirname, '..');

const ctx = {
  child: null,
  logs: '',
  customerToken: null,
  customerId: null,
  otherToken: null,
  otherId: null,
  adminToken: null,
  adminId: null,
  sponsorToken: null,
  sponsorId: null,
  sponsorProductId: null,
  categoryId: null,
  normalProductId: null,
  countProductId: null,
  orderIds: [],
  productIds: [],
  pushToken: null,
  cleanupIds: { users: [], orders: [], products: [], categories: [] }
};

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  ctx.child = child;
  child.stdout.on('data', d => { ctx.logs += d.toString(); });
  child.stderr.on('data', d => { ctx.logs += d.toString(); });

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('Server did not start.\n' + ctx.logs.slice(-2000));
}

async function req(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

function randomEmail(prefix) {
  return `${prefix}${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;
}

/* ── Setup ─────────────────────────────────────────────── */
before(async () => {
  await startServer();

  // Customer + "other user" accounts via the real signup flow.
  const custEmail = randomEmail('cust');
  const s1 = await req('POST', '/api/auth/signup', { body: { name: 'Stage10 Customer', email: custEmail, password: 'Test12345678!' } });
  assert.strictEqual(s1.status, 201, 'signup customer ' + s1.status);
  ctx.customerToken = s1.json.token;
  ctx.customerId = s1.json.user.id;
  ctx.cleanupIds.users.push(ctx.customerId);

  const otherEmail = randomEmail('other');
  const s2 = await req('POST', '/api/auth/signup', { body: { name: 'Other User', email: otherEmail, password: 'Test12345678!' } });
  assert.strictEqual(s2.status, 201, 'signup other ' + s2.status);
  ctx.otherToken = s2.json.token;
  ctx.otherId = s2.json.user.id;
  ctx.cleanupIds.users.push(ctx.otherId);

  // Admin seeded directly (signup always creates customers), then logged in.
  const adminEmail = randomEmail('admin');
  const hash = await bcrypt.hash('Stage10Admin!987', 10);
  const [ar] = await db.execute(
    "INSERT INTO users (name, email, password, is_admin, role) VALUES (?,?,?,1,'admin')",
    ['Stage10 Admin', adminEmail, hash]
  );
  ctx.adminId = ar.insertId;
  ctx.cleanupIds.users.push(ctx.adminId);
  const lg = await req('POST', '/api/auth/login', { body: { email: adminEmail, password: 'Stage10Admin!987' } });
  assert.strictEqual(lg.status, 200, 'admin login ' + lg.status);
  ctx.adminToken = lg.json.token;

  // Category + two products (one count-mode for restock checks).
  const catName = `Stage10 Cat ${Date.now()}`;
  const cat = await req('POST', '/api/admin/categories', { token: ctx.adminToken, body: { name: catName } });
  assert.strictEqual(cat.status, 201, 'create category ' + cat.status);
  ctx.categoryId = cat.json.id; // id is slug-derived from the name by the API
  ctx.cleanupIds.categories.push(ctx.categoryId);

  const p1 = await req('POST', '/api/products', {
    token: ctx.adminToken,
    body: {
      name: 'Stage10 Normal Tee', category: ctx.categoryId,
      cost_price: 5000, profit: 2000, shipping: 1000, sizes: ['ONE SIZE'], in_stock: true
    }
  });
  assert.strictEqual(p1.status, 201, 'create normal product ' + p1.status);
  ctx.normalProductId = p1.json.id;
  ctx.productIds.push(ctx.normalProductId);

  const p2 = await req('POST', '/api/products', {
    token: ctx.adminToken,
    body: {
      name: 'Stage10 Count Hoodie', category: ctx.categoryId,
      cost_price: 10000, profit: 3000, shipping: 1000,
      sizes: ['M'], stock_mode: 'count', size_stock: { M: 2 }
    }
  });
  assert.strictEqual(p2.status, 201, 'create count product ' + p2.status);
  ctx.countProductId = p2.json.id;
  ctx.productIds.push(ctx.countProductId);

  // Sponsor seeded directly (like admin) then logged in, with one owned product
  // so sponsor-driven status changes can be exercised too.
  const sponsorEmail = randomEmail('sponsor');
  const sHash = await bcrypt.hash('Stage10Sponsor!765', 10);
  const [spr] = await db.execute(
    "INSERT INTO users (name, email, password, is_admin, role) VALUES (?,?,?,0,'sponsor')",
    ['Stage10 Sponsor', sponsorEmail, sHash]
  );
  ctx.sponsorId = spr.insertId;
  ctx.cleanupIds.users.push(ctx.sponsorId);
  const spg = await req('POST', '/api/auth/login', { body: { email: sponsorEmail, password: 'Stage10Sponsor!765' } });
  assert.strictEqual(spg.status, 200, 'sponsor login ' + spg.status);
  ctx.sponsorToken = spg.json.token;

  const [sProd] = await db.execute(
    "INSERT INTO products (name, category, price, cost_price, profit, shipping, sizes, in_stock, owner_id) VALUES (?,?,?,?,?,?,?,?,?)",
    ['Stage10 Sponsor Mug', ctx.categoryId, 3500, 3500, 0, 0, '["ONE SIZE"]', 1, ctx.sponsorId]
  );
  ctx.sponsorProductId = sProd.insertId;
  ctx.productIds.push(ctx.sponsorProductId);
});

after(async () => {
  // Kill the spawned server first so no in-flight DB work races cleanup.
  if (ctx.child) {
    try { ctx.child.kill('SIGTERM'); } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 300));
    if (ctx.child.exitCode === null) { try { ctx.child.kill('SIGKILL'); } catch { /* ignore */ } }
  }

  // Remove every row this suite created (FKs cascade the detail rows).
  try {
    const allOrders = ctx.orderIds;
    const allProducts = ctx.productIds;
    if (allOrders.length) {
      const ph = allOrders.map(() => '?').join(',');
      await db.execute(`DELETE FROM orders WHERE id IN (${ph})`, allOrders);
    }
    if (allProducts.length) {
      const ph = allProducts.map(() => '?').join(',');
      await db.execute(`DELETE FROM products WHERE id IN (${ph})`, allProducts);
    }
    if (ctx.cleanupIds.categories.length) {
      const ph = ctx.cleanupIds.categories.map(() => '?').join(',');
      await db.execute(`DELETE FROM categories WHERE id IN (${ph})`, ctx.cleanupIds.categories);
    }
    if (ctx.cleanupIds.users.length) {
      const ph = ctx.cleanupIds.users.map(() => '?').join(',');
      await db.execute(`DELETE FROM users WHERE id IN (${ph})`, ctx.cleanupIds.users);
    }
    // Remove the settings row written by the Stage 11 push test (cached
    // last-test result) so the shared DB is left exactly as it was found.
    await db.execute("DELETE FROM settings WHERE key_name = 'push_test_result'");
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
  await db.end();
});

/* ── Stage 10: tracking + status notifications ─────────── */
test('customer places an order (two products, one count-mode)', async () => {
  const r = await req('POST', '/api/orders', {
    token: ctx.customerToken,
    body: {
      customer_name: 'Stage10 Customer', phone: '07501234567', city: 'Erbil',
      address: 'Test St 12', note: 'stage10 test',
      items: [
        { product_id: ctx.normalProductId, product_name: 'Stage10 Normal Tee', size: 'ONE SIZE', quantity: 1, unit_price: 7000 },
        { product_id: ctx.countProductId, product_name: 'Stage10 Count Hoodie', size: 'M', quantity: 1, unit_price: 13000 }
      ]
    }
  });
  assert.strictEqual(r.status, 201, 'place order ' + r.status);
  assert.ok(r.json.orderId && r.json.orderId.startsWith('SX'), 'has SX order id');
  ctx.orderIds.push(r.json.orderId);
});

test('count-mode stock decrements on order placement', async () => {
  const r = await req('GET', `/api/products/${ctx.countProductId}`, { token: ctx.adminToken });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.sizeStock.M, 1, 'stock reduced from 2 to 1');
});

test('tracking endpoint shows the initial pending entry', async () => {
  const id = ctx.orderIds[0];
  const r = await req('GET', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.strictEqual(r.status, 200, 'tracking ' + r.status);
  assert.strictEqual(r.json.status, 'pending');
  assert.strictEqual(r.json.timeline.length, 1);
  assert.strictEqual(r.json.timeline[0].status, 'pending');
  assert.strictEqual(r.json.items.length, 2);
});

test('tracking endpoint is owner-only (401 / 404)', async () => {
  const id = ctx.orderIds[0];
  const anon = await req('GET', `/api/orders/my/${id}`);
  assert.strictEqual(anon.status, 401, 'anonymous blocked');
  const other = await req('GET', `/api/orders/my/${id}`, { token: ctx.otherToken });
  assert.strictEqual(other.status, 404, 'foreign user blocked');
});

test('admin status change logs timeline and notifies the customer', async () => {
  const id = ctx.orderIds[0];
  for (const st of ['processing', 'shipped']) {
    const r = await req('PUT', `/api/orders/${id}/status`, { token: ctx.adminToken, body: { status: st } });
    assert.strictEqual(r.status, 200, `set ${st}`);
  }

  const track = await req('GET', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.deepStrictEqual(track.json.timeline.map(t => t.status), ['pending', 'processing', 'shipped'],
    'timeline order preserved');
  assert.strictEqual(track.json.status, 'shipped');
  assert.ok(track.json.timeline.every(t => t.at), 'each entry has a timestamp');

  const notifs = await req('GET', '/api/notifications?limit=50', { token: ctx.customerToken });
  assert.strictEqual(notifs.status, 200);
  const orderNotifs = (notifs.json.notifications || []).filter(n =>
    n.type === 'order' && n.metadata && n.metadata.orderId === id);
  assert.strictEqual(orderNotifs.length, 2, 'one notification per real change');
  for (const n of orderNotifs) {
    assert.strictEqual(n.isRead, false);
    assert.ok(n.link.startsWith('account.html#order-'), 'link targets tracking view');
    assert.ok(['processing', 'shipped'].includes(n.metadata.status));
  }
});

test('same-status no-op does not duplicate timeline entries or notifications', async () => {
  const id = ctx.orderIds[0];
  const r = await req('PUT', `/api/orders/${id}/status`, { token: ctx.adminToken, body: { status: 'shipped' } });
  assert.strictEqual(r.status, 200, 'no-op still accepted');

  const track = await req('GET', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.strictEqual(track.json.timeline.length, 3, 'no duplicate timeline entry');

  const notifs = await req('GET', '/api/notifications?limit=50', { token: ctx.customerToken });
  const orderNotifs = (notifs.json.notifications || []).filter(n =>
    n.type === 'order' && n.metadata && n.metadata.orderId === id);
  assert.strictEqual(orderNotifs.length, 2, 'no duplicate notification');
});

test('admins can read any order tracking detail', async () => {
  const id = ctx.orderIds[0];
  const r = await req('GET', `/api/orders/my/${id}`, { token: ctx.adminToken });
  assert.strictEqual(r.status, 200, 'admin read ' + r.status);
});

test('mark-read + unread-count still behave', async () => {
  const before = await req('GET', '/api/notifications/unread-count', { token: ctx.customerToken });
  const list = await req('GET', '/api/notifications?limit=50', { token: ctx.customerToken });
  const id = ctx.orderIds[0];
  const orderNotif = (list.json.notifications || []).find(n =>
    n.type === 'order' && n.metadata && n.metadata.orderId === id);
  assert.ok(orderNotif, 'an order notification exists to mark');
  const mark = await req('POST', `/api/notifications/${orderNotif.id}/read`, { token: ctx.customerToken });
  assert.strictEqual(mark.status, 200, 'mark read ' + mark.status);
  const afterC = await req('GET', '/api/notifications/unread-count', { token: ctx.customerToken });
  assert.strictEqual(afterC.json.unread, before.json.unread - 1, 'unread decreased by 1');
});

test('customer cancel restores count stock and confirms via notification', async () => {
  const id = ctx.orderIds[0];
  const del = await req('DELETE', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.strictEqual(del.status, 200, 'cancel own order ' + del.status);

  const gone = await req('GET', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.strictEqual(gone.status, 404, 'order removed');

  const prod = await req('GET', `/api/products/${ctx.countProductId}`, { token: ctx.adminToken });
  assert.strictEqual(prod.json.sizeStock.M, 2, 'count stock restored to 2');

  const notifs = await req('GET', '/api/notifications?limit=50', { token: ctx.customerToken });
  const cancelNotif = (notifs.json.notifications || []).find(n =>
    n.type === 'order' && n.metadata && n.metadata.orderId === id && n.metadata.status === 'cancelled');
  assert.ok(cancelNotif, 'cancellation confirmation notification exists');
});

test('admin hard-delete of an order still works (regression)', async () => {
  const r = await req('POST', '/api/orders', {
    token: ctx.customerToken,
    body: {
      customer_name: 'Stage10 Customer', phone: '07501234567', city: 'Duhok',
      address: 'Del St 3', note: '',
      items: [{ product_id: ctx.normalProductId, product_name: 'Stage10 Normal Tee', size: 'ONE SIZE', quantity: 1, unit_price: 7000 }]
    }
  });
  assert.strictEqual(r.status, 201, 'place second order');
  const id2 = r.json.orderId;
  ctx.orderIds.push(id2);

  const del = await req('DELETE', `/api/orders/${id2}`, { token: ctx.adminToken });
  assert.strictEqual(del.status, 200, 'admin delete order ' + del.status);
  const list = await req('GET', '/api/orders', { token: ctx.adminToken });
  assert.ok(Array.isArray(list.json) && !list.json.some(o => o.id === id2), 'order gone from list');
  ctx.orderIds = ctx.orderIds.filter(x => x !== id2); // already removed
});

test('sponsor status change logs timeline and notifies the customer', async () => {
  const placed = await req('POST', '/api/orders', {
    token: ctx.customerToken,
    body: {
      customer_name: 'Stage10 Customer', phone: '07501234567', city: 'Erbil',
      address: 'Sponsor St 8', note: 'sponsor track test',
      items: [{ product_id: ctx.sponsorProductId, product_name: 'Stage10 Sponsor Mug', size: 'ONE SIZE', quantity: 1, unit_price: 3500 }]
    }
  });
  assert.strictEqual(placed.status, 201, 'place sponsor-product order ' + placed.status);
  const id = placed.json.orderId;
  ctx.orderIds.push(id);

  const upd = await req('PUT', `/api/sponsor/orders/${id}/status`, { token: ctx.sponsorToken, body: { status: 'shipped' } });
  assert.strictEqual(upd.status, 200, 'sponsor update ' + upd.status);

  const track = await req('GET', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.strictEqual(track.status, 200, 'tracking');
  assert.deepStrictEqual(track.json.timeline.map(t => t.status), ['pending', 'shipped'],
    'sponsor change is in the timeline');
  assert.strictEqual(track.json.timeline[1].by, 'Stage10 Sponsor', 'attributed to the sponsor');

  const notifs = await req('GET', '/api/notifications?limit=50', { token: ctx.customerToken });
  const orderNotifs = (notifs.json.notifications || []).filter(n =>
    n.type === 'order' && n.metadata && n.metadata.orderId === id);
  assert.strictEqual(orderNotifs.length, 1, 'one notification for the sponsor change');
  assert.strictEqual(orderNotifs[0].metadata.status, 'shipped');

  const noop = await req('PUT', `/api/sponsor/orders/${id}/status`, { token: ctx.sponsorToken, body: { status: 'shipped' } });
  assert.strictEqual(noop.status, 200, 'sponsor no-op still accepted');
  const still = await req('GET', `/api/orders/my/${id}`, { token: ctx.customerToken });
  assert.strictEqual(still.json.timeline.length, 2, 'no duplicate from sponsor no-op');

  const blocked = await req('PUT', `/api/sponsor/orders/${id}/status`, { token: ctx.customerToken, body: { status: 'delivered' } });
  assert.strictEqual(blocked.status, 403, 'customer cannot drive sponsor status');
});

/* ── Regression: existing customer/admin surface ───────── */
test('customer order list still works', async () => {
  const r = await req('GET', '/api/orders/my', { token: ctx.customerToken });
  assert.strictEqual(r.status, 200, 'orders/my ' + r.status);
});

test('admin order list still works', async () => {
  const r = await req('GET', '/api/orders', { token: ctx.adminToken });
  assert.strictEqual(r.status, 200, 'orders ' + r.status);
});

test('public products/categories/stats/content regressions', async () => {
  assert.strictEqual((await req('GET', '/api/products')).status, 200);
  assert.strictEqual((await req('GET', '/api/categories')).status, 200);
  assert.strictEqual((await req('GET', '/api/stats')).status, 200);
  assert.strictEqual((await req('GET', '/api/content/config/min-order')).status, 200);
});

test('invalid login is rejected (regression)', async () => {
  const r = await req('POST', '/api/auth/login', { body: { email: 'nobody@test.local', password: 'WrongPass123!' } });
  assert.strictEqual(r.status, 401, 'invalid login blocked');
});

/* ── Stage 11: native push diagnostics (env has no Firebase creds) ── */
test('device token registration updates push status (admin-only endpoint)', async () => {
  const token = `fcm_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  ctx.pushToken = token;

  // Baseline against the shared dev DB (other device tokens may exist).
  const base = await req('GET', '/api/admin/push/status', { token: ctx.adminToken });
  assert.strictEqual(base.status, 200, 'baseline status ' + base.status);

  const reg = await req('POST', '/api/push/register', {
    token: ctx.customerToken,
    body: { token, platform: 'android', deviceId: 'stage11-dev' }
  });
  assert.strictEqual(reg.status, 200, 'register ' + reg.status);
  assert.strictEqual(reg.json.registered, true);

  const anon = await req('GET', '/api/admin/push/status');
  assert.strictEqual(anon.status, 401, 'anonymous blocked');

  const cust = await req('GET', '/api/admin/push/status', { token: ctx.customerToken });
  assert.strictEqual(cust.status, 403, 'customer blocked');

  const s = await req('GET', '/api/admin/push/status', { token: ctx.adminToken });
  assert.strictEqual(s.status, 200, 'admin status ' + s.status);
  assert.ok(!JSON.stringify(s.json).includes(token), 'device tokens are never returned');
  assert.strictEqual(s.json.devices.active, base.json.devices.active + 1, 'one more active device');
  assert.strictEqual(s.json.devices.byPlatform.android, base.json.devices.byPlatform.android + 1, 'android counted');
  assert.strictEqual(s.json.devices.activeUsers, base.json.devices.activeUsers + 1, 'new user reached');
  assert.strictEqual(s.json.devices.total, base.json.devices.total + 1, 'all-time token count grows');
  assert.strictEqual(s.json.deliveryMode, 'unconfigured', 'no Firebase creds in test env');
  assert.strictEqual(typeof s.json.firebase.installed, 'boolean');
  assert.strictEqual(s.json.firebase.configured, false);
});

test('admin push test is a dry-run projection while firebase is unconfigured', async () => {
  const anon = await req('POST', '/api/admin/push/test', { body: { message: 'hi' } });
  assert.strictEqual(anon.status, 401, 'anonymous blocked');

  const cust = await req('POST', '/api/admin/push/test', { token: ctx.customerToken, body: { message: 'hi' } });
  assert.strictEqual(cust.status, 403, 'customer blocked');

  const bad = await req('POST', '/api/admin/push/test', { token: ctx.adminToken, body: {} });
  assert.strictEqual(bad.status, 400, 'missing message rejected');

  const badAud = await req('POST', '/api/admin/push/test', { token: ctx.adminToken, body: { message: 'hi', audience: 'bogus' } });
  assert.strictEqual(badAud.status, 400, 'invalid audience rejected');

  const r = await req('POST', '/api/admin/push/test', {
    token: ctx.adminToken,
    body: { title: 'Stage11 smoke', message: 'Hello customer', audience: 'all' }
  });
  assert.strictEqual(r.status, 200, 'admin test ' + r.status);
  assert.strictEqual(r.json.result.mode, 'dry-run', 'nothing is sent without firebase');
  assert.strictEqual(r.json.result.reason, 'firebase-unconfigured');
  assert.ok(r.json.result.devices >= 1, 'projection includes the registered device');
  assert.strictEqual(r.json.result.sent, 0, 'no real sends');

  const s = await req('GET', '/api/admin/push/status', { token: ctx.adminToken });
  assert.ok(s.json.lastTest && s.json.lastTest.mode === 'dry-run', 'last test persisted and visible');
});

test('single-token push test targets exactly that device (dry-run)', async () => {
  const r = await req('POST', '/api/admin/push/test', {
    token: ctx.adminToken,
    body: { message: 'Only one device', token: ctx.pushToken }
  });
  assert.strictEqual(r.status, 200, 'single-token test ' + r.status);
  assert.strictEqual(r.json.result.audience, 'single-token');
  assert.strictEqual(r.json.result.devices, 1, 'exactly one device targeted');
  assert.strictEqual(r.json.result.mode, 'dry-run');
});