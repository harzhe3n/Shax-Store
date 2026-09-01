/* ============================================================
   SHAX STORE — Sponsor Panel JavaScript
   A limited panel for sponsor accounts: set up ONE store category
   and manage their OWN products. All calls are authenticated and
   the backend enforces ownership.
   ============================================================ */
'use strict';

/* API origin:
   - On the website, requests are same-origin relative (/api).
   - Inside the bundled Capacitor app the WebView origin is a local scheme
     with no backend behind it, so API calls use the origin set in
     shax-native-config.js (window.ShaxNativeConfig.apiBase) when provided,
     otherwise same-origin /api. */
const API_BASE = (function () {
  try {
    if (typeof window !== 'undefined' &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()) {
      const cfg = window.ShaxNativeConfig && window.ShaxNativeConfig.apiBase;
      if (typeof cfg === 'string' && cfg.trim()) return cfg.replace(/\/+$/, '');
    }
  } catch (e) { /* fall through to same-origin */ }
  return '/api';
})();

const SP = {
  token: localStorage.getItem('shax_token') || null,
  user: null,
  category: null,        // the sponsor's single store category (or null)
  products: [],
  orders: [],
  editingProduct: null
};

/* ── API helper ── */
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (SP.token) headers['Authorization'] = `Bearer ${SP.token}`;

  let res;
  try { res = await fetch(`${API_BASE}${path}`, { ...options, headers }); }
  catch { throw new Error('Network error — check your connection.'); }

  let data = null;
  try { data = await res.json(); } catch {}

  if (res.status === 401) { clearSession(); showLogin(); }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed.');
  return data;
}

function clearSession() {
  SP.token = null; SP.user = null;
  localStorage.removeItem('shax_token');
  localStorage.removeItem('shax_user');
}

/* ── Toast ── */
function toast(msg, type = 'ok') {
  const c = document.getElementById('admin-toast');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `admin-toast-item${type === 'err' ? ' err' : ''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n) { return `${Math.round(parseFloat(n) || 0).toLocaleString('en-US')} IQD`; }

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const yr = d.getFullYear();
  const hr = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${mon}.${yr} ${hr}:${min}`;
}

/* ── Auth ── */
function showLogin() { document.getElementById('sp-login-overlay')?.classList.add('open'); }
function hideLogin() { document.getElementById('sp-login-overlay')?.classList.remove('open'); }

async function checkAuth() {
  if (!SP.token) { showLogin(); return false; }
  try {
    const user = await api('/auth/me');
    if (user.role !== 'sponsor') {
      clearSession();
      document.getElementById('spl-error').textContent =
        'This panel is for sponsor accounts. Use the admin panel instead.';
      showLogin();
      return false;
    }
    SP.user = user;
    localStorage.setItem('shax_user', JSON.stringify(user));
    populateUser(user);
    hideLogin();
    return true;
  } catch {
    clearSession(); showLogin(); return false;
  }
}

function populateUser(user) {
  const n = document.getElementById('sp-name-label');
  const a = document.getElementById('sp-avatar');
  if (n) n.textContent = user.name || 'Sponsor';
  if (a) a.textContent = (user.name || 'S').trim().charAt(0).toUpperCase();
}

async function sponsorLogin(e) {
  e.preventDefault();
  const email = document.getElementById('spl-email').value.trim();
  const pass  = document.getElementById('spl-pass').value;
  const errEl = document.getElementById('spl-error');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'Enter email and password.'; return; }

  try {
    const data = await api('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password: pass })
    });
    if (data.user.role !== 'sponsor') {
      errEl.textContent = 'This panel is for sponsor accounts only.';
      return;
    }
    SP.token = data.token; SP.user = data.user;
    localStorage.setItem('shax_token', data.token);
    localStorage.setItem('shax_user', JSON.stringify(data.user));
    populateUser(data.user);
    hideLogin();
    toast(`Welcome, ${data.user.name}!`);
    init();
  } catch (err) {
    errEl.textContent = err.message || 'Invalid credentials.';
  }
}

function sponsorLogout() {
  clearSession();
  window.location.href = '../index.html';
}

/* ── Nav ── */
const PAGE_TITLES = {
  store: 'My Store',
  products: 'My Products',
  orders: 'My Orders',
  stats: 'My Stats',
  telegram: 'Telegram Notifications'
};

function showPage(id) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${id}`)?.classList.add('active');
  document.querySelectorAll('.sidebar-link[data-page]').forEach(l =>
    l.classList.toggle('active', l.dataset.page === id));
  document.getElementById('admin-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[id] || 'Sponsor Panel';
  if (id === 'store') loadStore();
  if (id === 'products') loadProducts();
  if (id === 'orders') loadSponsorOrders();
  if (id === 'stats') loadSponsorStats();
  if (id === 'telegram') loadSponsorTelegram();
}

/* ── Store (category) ── */
async function loadStore() {
  try {
    SP.category = await api('/sponsor/category');
  } catch { SP.category = null; }

  const saveLabel = document.getElementById('sp-cat-save-label');
  if (SP.category) {
    document.getElementById('sp-cat-name').value     = SP.category.name || '';
    document.getElementById('sp-cat-name-ku').value  = SP.category.name_ku || '';
    document.getElementById('sp-cat-name-ar').value  = SP.category.name_ar || '';
    document.getElementById('sp-cat-image-url').value = SP.category.image_url || '';
    if (SP.category.image_url) {
      const pv = document.getElementById('sp-cat-img-preview');
      pv.src = SP.category.image_url; pv.style.display = 'block';
    }
    if (saveLabel) saveLabel.textContent = 'Update Store';
    const help = document.getElementById('store-help');
    if (help) help.innerHTML = 'Your store is set up. You can update its name or image anytime below.';
  } else {
    if (saveLabel) saveLabel.textContent = 'Create Store';
  }
}

async function saveStore() {
  const name = document.getElementById('sp-cat-name').value.trim();
  if (!name) { toast('Store name is required.', 'err'); return; }

  const payload = {
    name,
    name_ku: document.getElementById('sp-cat-name-ku').value.trim(),
    name_ar: document.getElementById('sp-cat-name-ar').value.trim(),
    image_url: document.getElementById('sp-cat-image-url').value || null
  };

  const btn = document.getElementById('sp-cat-save-btn');
  btn.disabled = true;
  try {
    if (SP.category) {
      await api('/sponsor/category', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Store updated!');
    } else {
      await api('/sponsor/category', { method: 'POST', body: JSON.stringify(payload) });
      toast('Store created! You can now add products.');
    }
    await loadStore();
  } catch (err) {
    toast(err.message || 'Failed to save store.', 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ── Products ── */
async function loadProducts() {
  if (SP.category === null) {
    try { SP.category = await api('/sponsor/category'); } catch {}
  }
  const warn = document.getElementById('sp-no-store-warning');
  const addBtn = document.getElementById('sp-add-product-btn');
  if (!SP.category) {
    if (warn) warn.style.display = 'flex';
    if (addBtn) addBtn.disabled = true;
  } else {
    if (warn) warn.style.display = 'none';
    if (addBtn) addBtn.disabled = false;
  }

  const tbody = document.getElementById('sp-products-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="6">Loading…</td></tr>';
  try {
    SP.products = await api('/products?mine=true');
    renderProducts();
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="6">Could not load products.</td></tr>';
    toast(err.message || 'Failed to load products.', 'err');
  }
}

function renderProducts() {
  const tbody = document.getElementById('sp-products-tbody');
  if (!tbody) return;
  tbody.innerHTML = SP.products.length === 0
    ? '<tr class="admin-empty-row"><td colspan="6">No products yet. Click "Add Product" to create your first one.</td></tr>'
    : SP.products.map(p => `
      <tr>
        <td style="font-weight:700;color:var(--gold)">#${p.id}</td>
        <td><img class="tbl-thumb" src="${escapeHtml(p.image || '../assets/placeholder-product.png')}"
                 onerror="this.src='../assets/placeholder-product.png'" alt=""></td>
        <td><div class="tbl-name">${escapeHtml(p.name)}</div></td>
        <td style="color:var(--gold);font-weight:700">${money(p.price)}</td>
        <td>${!p.inStock ? '<span class="badge badge-danger">Out of Stock</span>' : (p.stockMode==='count' && p.sizeStock ? '<div style="display:flex;flex-wrap:wrap;gap:4px 8px;font-size:.78rem;font-weight:600">'+Object.entries(p.sizeStock).map(function(e){return '<span style="color:'+(e[1]>0?'#27ae60':'#c0392b')+'">'+e[0]+':'+e[1]+'</span>';}).join('')+'</div>' : '<span class="badge badge-success">In Stock</span>')}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-edit" onclick="editProduct(${p.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="tbl-btn tbl-btn-del" onclick="deleteProduct(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
}

async function loadSpFilters(){
  if(!SP.filters){ try{ SP.filters = await api('/filters'); }catch{ SP.filters=[]; } }
  renderSpFilterChooser();
}
function renderSpFilterChooser(){
  var box = document.getElementById('p-filters-box'); if(!box) return;
  var all = SP.filters || [];
  SP._productFilters = SP._productFilters || [];
  if(!all.length){ box.innerHTML = '<span style="color:#666;font-size:.82rem">No filters available.</span>'; return; }
  box.innerHTML = all.map(function(f){
    var on = SP._productFilters.indexOf(f.id) >= 0;
    return '<button type="button" onclick="toggleSpFilter(\''+f.id+'\')" style="padding:6px 12px;border-radius:20px;border:1px solid '+(on?'#C9A84C':'#333')+';background:'+(on?'rgba(201,168,76,0.15)':'#1a1a1a')+';color:'+(on?'#C9A84C':'#ccc')+';cursor:pointer;font-size:.82rem">'+(on?'<i class="fas fa-check" style="margin-right:5px"></i>':'')+f.name+'</button>';
  }).join('');
}
function toggleSpFilter(id){
  SP._productFilters = SP._productFilters || [];
  var i = SP._productFilters.indexOf(id);
  if(i>=0) SP._productFilters.splice(i,1); else SP._productFilters.push(id);
  renderSpFilterChooser();
}
function openAddProduct() {
  if (!SP.category) { toast('Create your store first.', 'err'); showPage('store'); return; }
  SP.editingProduct = null;
  resetProductForm();
  SP._productFilters = [];
  loadSpFilters();
  document.getElementById('product-modal-title').textContent = 'Add Product';
  openModal('product-modal');
}

function editProduct(id) {
  const p = SP.products.find(x => x.id === id);
  if (!p) return;
  SP.editingProduct = p;
  resetProductForm();
  document.getElementById('p-id').value        = p.id;
  document.getElementById('p-image-url').value  = p.image || '';
  document.getElementById('p-name').value       = p.name || '';
  document.getElementById('p-name-ku').value    = p.name_ku || '';
  document.getElementById('p-name-ar').value    = p.name_ar || '';
  SP._productFilters = Array.isArray(p.filters) ? p.filters.map(function(f){return f.id;}) : [];
  loadSpFilters();
  document.getElementById('p-price').value      = p.price || '';
  document.getElementById('p-old-price').value  = p.oldPrice || '';
  document.getElementById('p-shipping').value   = (p.shipping != null ? p.shipping : 0);
  document.getElementById('p-badge').value      = p.badge || '';
  document.getElementById('p-desc').value       = p.description || '';
  document.getElementById('p-desc-ku').value    = p.description_ku || '';
  document.getElementById('p-desc-ar').value    = p.description_ar || '';
  document.getElementById('p-in-stock').value = p.inStock !== false ? '1' : '0';
  document.getElementById('p-stock-mode').value = p.stockMode || 'hidden';
  SP_SIZESTOCK = (p.sizeStock && typeof p.sizeStock === 'object') ? Object.assign({}, p.sizeStock) : {};
  spToggleStockQty();
  document.querySelectorAll('.size-check').forEach(cb => cb.checked = (p.sizes || []).includes(cb.value));
  if (p.image) {
    const pv = document.getElementById('img-preview');
    pv.src = p.image; pv.style.display = 'block';
  }
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  openModal('product-modal');
}

async function saveProduct() {
  const name  = document.getElementById('p-name').value.trim();
  const price = parseFloat(document.getElementById('p-price').value);
  if (!name) { toast('Product name is required.', 'err'); return; }
  if (isNaN(price) || price <= 0) { toast('A valid price is required.', 'err'); return; }
  if (!SP.category) { toast('Create your store first.', 'err'); return; }

  const sizes = Array.from(document.querySelectorAll('.size-check:checked')).map(c => c.value);
  const oldPriceVal = parseFloat(document.getElementById('p-old-price').value);

  const payload = {
    name,
    name_ku: document.getElementById('p-name-ku').value.trim(),
    name_ar: document.getElementById('p-name-ar').value.trim(),
    category: SP.category.id,
    filters: SP._productFilters || [],
    price,
    old_price: isNaN(oldPriceVal) ? null : oldPriceVal,
    shipping: parseFloat(document.getElementById('p-shipping').value) || 0,
    badge: document.getElementById('p-badge').value || null,
    description: document.getElementById('p-desc').value.trim(),
    description_ku: document.getElementById('p-desc-ku').value.trim(),
    description_ar: document.getElementById('p-desc-ar').value.trim(),
    stock_mode: document.getElementById('p-stock-mode').value,
    size_stock: (function(){ var o={}; if(document.getElementById('p-stock-mode').value==='count'){ document.querySelectorAll('#p-size-stock-grid input[data-size]').forEach(function(i){ o[i.dataset.size]=parseInt(i.value)||0; }); } return o; })(),
    in_stock: document.getElementById('p-stock-mode').value !== 'out',
    sizes: sizes.length ? sizes : ['ONE SIZE'],
    image_url: document.getElementById('p-image-url').value || null
  };

  const btn = document.getElementById('p-save-btn');
  btn.disabled = true;
  try {
    if (SP.editingProduct) {
      await api(`/products/${SP.editingProduct.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('product-modal');
    await loadProducts();
    toast('Product saved!');
  } catch (err) {
    toast(err.message || 'Failed to save product.', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  try {
    await api(`/products/${id}`, { method: 'DELETE' });
    await loadProducts();
    toast('Product deleted.');
  } catch (err) {
    toast(err.message || 'Failed to delete product.', 'err');
  }
}

function resetProductForm() {
  ['p-id','p-name','p-name-ku','p-name-ar','p-price','p-old-price','p-shipping','p-desc','p-desc-ku','p-desc-ar','p-image-url']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('p-badge').value = '';
  document.getElementById('p-in-stock').value = '1';
  document.getElementById('p-stock-mode').value = 'hidden';
  document.getElementById('p-stock-qty').value = '0';
  SP_SIZESTOCK = {};
  spToggleStockQty();
  document.querySelectorAll('.size-check').forEach(cb => cb.checked = true);
  const pv = document.getElementById('img-preview');
  pv.style.display = 'none'; pv.removeAttribute('src');
  document.getElementById('p-upload-status').textContent = '';
}

/* ════════════════════════════════════════════════════════════
   ORDERS
   ════════════════════════════════════════════════════════════ */

const STATUS_COLORS = {
  pending: '#f39c12',
  processing: '#3498db',
  shipped: '#8e44ad',
  delivered: '#27ae60',
  cancelled: '#c0392b'
};
const STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

async function loadSponsorOrders() {
  const tbody = document.getElementById('sp-orders-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="8">Loading…</td></tr>';
  try {
    SP.orders = await api('/sponsor/orders');
    renderSponsorOrdersTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="8">Could not load orders.</td></tr>';
    toast(err.message || 'Failed to load orders.', 'err');
  }
}

function renderSponsorOrdersTable() {
  const tbody = document.getElementById('sp-orders-tbody');
  if (!tbody) return;

  if (SP.orders.length === 0) {
    tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="8">No orders containing your products yet.</td></tr>';
    return;
  }

  tbody.innerHTML = SP.orders.map(o => {
    const st = o.status || 'pending';
    const stColor = STATUS_COLORS[st] || '#888';
    const myTotal = parseFloat(o.my_total || 0);
    return `
      <tr>
        <td style="font-weight:700;color:var(--gold)">${escapeHtml(o.id)}</td>
        <td>
          <div style="font-weight:600">${escapeHtml(o.customer_name || '—')}</div>
          <div style="font-size:.75rem;color:#888">${escapeHtml(o.email || '')}</div>
        </td>
        <td style="font-size:.85rem">${escapeHtml(o.my_items || '')}</td>
        <td style="color:var(--gold);font-weight:700">${money(myTotal)}</td>
        <td style="font-weight:600">${money(o.total)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:.78rem;font-weight:700;background:${stColor}22;color:${stColor}"><span style="width:6px;height:6px;border-radius:50%;background:${stColor}"></span>${STATUS_LABELS[st] || st}</span></td>
        <td style="font-size:.8rem;color:#888">${formatDate(o.created_at)}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-edit" onclick="viewSponsorOrder('${escapeHtml(o.id)}')" title="View Details"><i class="fas fa-eye"></i></button>
            <select onchange="updateSponsorOrderStatus('${escapeHtml(o.id)}', this.value); this.value='${st}'"
              style="padding:4px 6px;border-radius:6px;border:1px solid #333;background:#1a1a1a;color:#ccc;font-size:.75rem;cursor:pointer">
              <option value="pending"${st==='pending'?' selected':''}>Pending</option>
              <option value="processing"${st==='processing'?' selected':''}>Processing</option>
              <option value="shipped"${st==='shipped'?' selected':''}>Shipped</option>
              <option value="delivered"${st==='delivered'?' selected':''}>Delivered</option>
              <option value="cancelled"${st==='cancelled'?' selected':''}>Cancelled</option>
            </select>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function viewSponsorOrder(orderId) {
  const o = SP.orders.find(x => x.id === orderId);
  if (!o) return;

  const st = o.status || 'pending';
  const stColor = STATUS_COLORS[st] || '#888';

  const itemsHtml = (o.items || []).map(it => `
    <div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)">
      <img src="${escapeHtml(it.image || '../assets/placeholder-product.png')}"
           onerror="this.src='../assets/placeholder-product.png'"
           style="width:50px;height:50px;border-radius:8px;object-fit:cover;border:1px solid rgba(201,168,76,0.15)" alt="">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(it.product_name || 'Product')}</div>
        <div style="font-size:.78rem;color:#888;margin-top:2px">${it.size ? 'Size: '+escapeHtml(it.size) : ''}${it.color ? ' · Color: '+escapeHtml(it.color) : ''} × ${it.quantity}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:var(--gold)">${money(it.unit_price * it.quantity)}</div>
        <div style="font-size:.72rem;color:#666;margin-top:2px">${money(it.unit_price)} each</div>
      </div>
    </div>
  `).join('');

  document.getElementById('sp-od-title').textContent = `Order #${o.id}`;
  document.getElementById('sp-od-body').innerHTML = `
    <div class="order-detail-grid" style="margin-bottom:20px">
      <div class="admin-card" style="margin:0">
        <div class="admin-card-body" style="padding:16px">
          <div class="form-section-title" style="margin-bottom:10px">Customer</div>
          <div style="font-size:.88rem;color:#ccc;line-height:1.8">
            <div><strong style="color:#fff">${escapeHtml(o.customer_name || '—')}</strong></div>
            <div>${escapeHtml(o.email || '—')}</div>
            <div>${escapeHtml(o.phone || '—')}</div>
            <div>${escapeHtml(o.city || '')}${o.city && o.address ? ', ' : ''}${escapeHtml(o.address || '')}</div>
          </div>
        </div>
      </div>
      <div class="admin-card" style="margin:0">
        <div class="admin-card-body" style="padding:16px">
          <div class="form-section-title" style="margin-bottom:10px">Order Summary</div>
          <div style="font-size:.88rem;color:#ccc;line-height:1.8">
            <div>Order Total: <strong style="color:#fff">${money(o.total)}</strong></div>
            <div>My Total: <strong style="color:var(--gold)">${money(o.my_total)}</strong></div>
            <div>Status: <span style="display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:700;background:${stColor}22;color:${stColor}"><span style="width:5px;height:5px;border-radius:50%;background:${stColor}"></span>${STATUS_LABELS[st] || st}</span></div>
            <div style="margin-top:4px;font-size:.78rem;color:#666">Created: ${formatDate(o.created_at)}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="admin-card" style="margin:0">
      <div class="admin-card-body" style="padding:16px">
        <div class="form-section-title" style="margin-bottom:10px">Items</div>
        ${itemsHtml || '<div style="color:#666;font-size:.85rem">No item details available.</div>'}
      </div>
    </div>`;

  openModal('sp-order-detail-modal');
}

async function updateSponsorOrderStatus(orderId, newStatus) {
  if (!newStatus) return;
  try {
    await api(`/sponsor/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    const o = SP.orders.find(x => x.id === orderId);
    if (o) o.status = newStatus;
    renderSponsorOrdersTable();
    toast(`Order #${orderId} → ${STATUS_LABELS[newStatus] || newStatus}`);
  } catch (err) {
    toast(err.message || 'Failed to update order status.', 'err');
  }
}

/* ════════════════════════════════════════════════════════════
   STATS DASHBOARD
   ════════════════════════════════════════════════════════════ */

async function loadSponsorStats() {
  const cardsEl = document.getElementById('sp-stats-cards');
  const tbody = document.getElementById('sp-stats-products');
  if (cardsEl) cardsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:#888">Loading…</div>';
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="7">Loading…</td></tr>';

  try {
    const data = await api('/sponsor/stats');
    renderSponsorStatsCards(data);
    renderSponsorStatsProducts(data);
  } catch (err) {
    if (cardsEl) cardsEl.innerHTML = '';
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="7">Could not load stats.</td></tr>';
    toast(err.message || 'Failed to load stats.', 'err');
  }
}

function renderSponsorStatsCards(data) {
  const el = document.getElementById('sp-stats-cards');
  if (!el) return;

  const cards = [
    { icon: 'fas fa-shopping-cart', label: 'Orders', value: data.orderCount || 0, color: '#3498db' },
    { icon: 'fas fa-box', label: 'Products', value: data.productCount || 0, color: '#9b59b6' },
    { icon: 'fas fa-dollar-sign', label: 'Revenue', value: money(data.totalRevenue), color: '#27ae60' },
    { icon: 'fas fa-wallet', label: 'My Earnings', value: money(data.sponsorEarnings), color: '#C9A84C' }
  ];

  el.innerHTML = cards.map(c => `
    <div class="admin-card" style="margin:0">
      <div class="admin-card-body" style="padding:18px;display:flex;align-items:center;gap:14px">
        <div style="width:46px;height:46px;border-radius:12px;background:${c.color}18;display:flex;align-items:center;justify-content:center">
          <i class="${c.icon}" style="font-size:1.1rem;color:${c.color}"></i>
        </div>
        <div>
          <div style="font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.5px">${c.label}</div>
          <div style="font-size:1.3rem;font-weight:800;color:#fff;margin-top:2px">${c.value}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderSponsorStatsProducts(data) {
  const tbody = document.getElementById('sp-stats-products');
  if (!tbody) return;

  const products = data.products || [];
  if (products.length === 0) {
    tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="7">No product data yet.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td><img class="tbl-thumb" src="${escapeHtml(p.image || '../assets/placeholder-product.png')}"
               onerror="this.src='../assets/placeholder-product.png'" alt=""></td>
      <td style="font-weight:600">${escapeHtml(p.name || 'Product')}</td>
      <td>${Number(p.totalSold || 0)}</td>
      <td style="color:#27ae60;font-weight:700">${money(p.totalRevenue)}</td>
      <td style="color:var(--gold);font-weight:700">${money(p.totalProfit)}</td>
      <td style="color:#c0392b;font-weight:600">-${money(p.commission)}</td>
      <td style="color:#C9A84C;font-weight:700">${money(p.sponsorEarnings)}</td>
    </tr>
  `).join('');
}

/* ════════════════════════════════════════════════════════════
   TELEGRAM CONFIG
   ════════════════════════════════════════════════════════════ */

async function loadSponsorTelegram() {
  try {
    const me = await api('/sponsor/me');
    const input = document.getElementById('sp-tg-chatid');
    if (input) input.value = me.telegram_chat_id || '';
  } catch (err) {
    toast(err.message || 'Failed to load Telegram config.', 'err');
  }
}

async function saveSponsorTelegram() {
  const chatId = document.getElementById('sp-tg-chatid').value.trim();
  const statusEl = document.getElementById('sp-tg-status');
  if (!chatId) { toast('Enter a Telegram chat ID.', 'err'); return; }

  try {
    await api('/sponsor/telegram', {
      method: 'PUT',
      body: JSON.stringify({ chat_id: chatId })
    });
    if (statusEl) { statusEl.textContent = 'Chat ID saved!'; statusEl.style.color = '#27ae60'; }
    toast('Telegram chat ID saved!');
  } catch (err) {
    if (statusEl) { statusEl.textContent = err.message || 'Failed to save.'; statusEl.style.color = '#c0392b'; }
    toast(err.message || 'Failed to save Telegram config.', 'err');
  }
}

async function testSponsorTelegram() {
  const statusEl = document.getElementById('sp-tg-status');
  try {
    if (statusEl) { statusEl.textContent = 'Sending test message…'; statusEl.style.color = '#888'; }
    const data = await api('/sponsor/telegram/test', { method: 'POST' });
    if (statusEl) { statusEl.textContent = 'Test message sent! Check your Telegram.'; statusEl.style.color = '#27ae60'; }
    toast('Test message sent!');
  } catch (err) {
    if (statusEl) { statusEl.textContent = err.message || 'Failed to send test.'; statusEl.style.color = '#c0392b'; }
    toast(err.message || 'Failed to send test message.', 'err');
  }
}

/* ── Image upload (shared) ── */
async function handleImageUpload(file, hiddenId, previewId, statusId) {
  const statusEl = document.getElementById(statusId);
  const preview  = document.getElementById(previewId);
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    statusEl.textContent = 'File too large — max 5MB.';
    statusEl.className = 'upload-status error';
    return;
  }
  statusEl.textContent = 'Uploading…';
  statusEl.className = 'upload-status uploading';
  const fd = new FormData();
  fd.append('image', file);
  try {
    const result = await api('/sponsor/upload', { method: 'POST', body: fd });
    document.getElementById(hiddenId).value = result.url;
    preview.src = result.url; preview.style.display = 'block';
    statusEl.textContent = 'Uploaded!';
    statusEl.className = 'upload-status';
  } catch (err) {
    statusEl.textContent = err.message || 'Upload failed.';
    statusEl.className = 'upload-status error';
  }
}

/* ── Modal helpers ── */
function openModal(id) { document.getElementById(id)?.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); document.body.style.overflow = ''; }

/* ── Init ── */
function init() {
  showPage('store');
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkAuth();

  document.getElementById('spl-form')?.addEventListener('submit', sponsorLogin);

  document.querySelectorAll('.size-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (document.getElementById('p-stock-mode')?.value === 'count') spRenderSizeStock();
    });
  });

  document.querySelectorAll('.sidebar-link[data-page]').forEach(link =>
    link.addEventListener('click', () => showPage(link.dataset.page)));

  document.querySelectorAll('[data-close-modal]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    if (overlay.id === 'sp-login-overlay') return;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  document.getElementById('p-image-file')?.addEventListener('change', e =>
    handleImageUpload(e.target.files[0], 'p-image-url', 'img-preview', 'p-upload-status'));
  document.getElementById('sp-cat-image-file')?.addEventListener('change', e =>
    handleImageUpload(e.target.files[0], 'sp-cat-image-url', 'sp-cat-img-preview', 'sp-cat-upload-status'));

  document.getElementById('mobile-sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('admin-sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-backdrop')?.classList.toggle('open');
  });
  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    document.getElementById('admin-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('open');
  });

  if (ok) init();
});

var SP_SIZESTOCK = {};
function spToggleStockQty(){
  var m = document.getElementById('p-stock-mode').value;
  var g = document.getElementById('p-stock-qty-group');
  if (g) g.style.display = (m === 'count') ? 'block' : 'none';
  if (m === 'count') spRenderSizeStock();
}
function spRenderSizeStock(){
  var grid = document.getElementById('p-size-stock-grid');
  if (!grid) return;
  grid.querySelectorAll('input[data-size]').forEach(function(inp){ SP_SIZESTOCK[inp.dataset.size] = parseInt(inp.value)||0; });
  var checked = Array.from(document.querySelectorAll('.size-check:checked')).map(function(c){return c.value;});
  if (!checked.length){ grid.innerHTML = '<span style="color:#888;font-size:.85rem">Select a size above first.</span>'; return; }
  grid.innerHTML = checked.map(function(sz){
    var v = SP_SIZESTOCK[sz] != null ? SP_SIZESTOCK[sz] : 0;
    return '<div style="display:flex;flex-direction:column;gap:4px;width:88px">'
      + '<span style="font-size:.8rem;color:#C9A84C;font-weight:700;text-align:center">'+sz+'</span>'
      + '<input class="form-input" type="number" min="0" step="1" data-size="'+sz+'" value="'+v+'" style="text-align:center;padding:6px">'
      + '</div>';
  }).join('');
}
