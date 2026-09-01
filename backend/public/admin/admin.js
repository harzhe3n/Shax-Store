/* ============================================================
   SHAX STORE — Admin Panel JavaScript
   Fully API-driven: every action below talks to the real
   Express/MySQL backend with a JWT bearer token. Nothing here
   reads or writes localStorage except the token/user pair used
   for authentication, exactly like the public storefront.
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

/* ─── STATE ──────────────────────────────────────────────── */
const ADMIN = {
  currentPage: 'dashboard',
  token: localStorage.getItem('shax_token') || null,
  user: null,
  editingProduct: null,
  editingCategory: null,
  products: [],
  categories: [],
  orders: [],
  settings: { botTokenSet: false, chatId: '' }
};

/* ─── API HELPER ─────────────────────────────────────────── */
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (ADMIN.token) headers['Authorization'] = `Bearer ${ADMIN.token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('Network error — check your connection.');
  }

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401) {
    /* Token invalid/expired — drop back to the login overlay */
    clearAdminSession();
    showLoginOverlay();
  }

  if (!res.ok) {
    throw new Error((data && data.error) || 'Request failed.');
  }
  return data;
}

function clearAdminSession() {
  ADMIN.token = null;
  ADMIN.user = null;
  localStorage.removeItem('shax_token');
  localStorage.removeItem('shax_user');
}

/* ─── TOAST ──────────────────────────────────────────────── */
function toast(msg, type = 'ok') {
  const c = document.getElementById('admin-toast');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `admin-toast-item${type === 'err' ? ' err' : ''}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ─── ESCAPE HTML (review comments / order notes are user input) ─ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n) {
  const v = Math.round(parseFloat(n) || 0);
  return `${v.toLocaleString('en-US')} IQD`;
}

/* ─── AUTH ───────────────────────────────────────────────── */
function showLoginOverlay() {
  document.getElementById('admin-login-overlay')?.classList.add('open');
}
function hideLoginOverlay() {
  document.getElementById('admin-login-overlay')?.classList.remove('open');
}

async function checkAdminAuth() {
  if (!ADMIN.token) {
    showLoginOverlay();
    return false;
  }
  try {
    const user = await api('/auth/me');
    if (!user.isAdmin) {
      clearAdminSession();
      document.getElementById('al-error').textContent = 'That account does not have admin access.';
      showLoginOverlay();
      return false;
    }
    ADMIN.user = user;
    localStorage.setItem('shax_user', JSON.stringify(user));
    populateAdminUser(user);
    applyRoleVisibility();
    hideLoginOverlay();
    return true;
  } catch {
    clearAdminSession();
    showLoginOverlay();
    return false;
  }
}

function populateAdminUser(user) {
  const nameEl = document.getElementById('admin-name');
  const avEl   = document.getElementById('admin-avatar');
  if (nameEl) nameEl.textContent = user.name || 'Administrator';
  if (avEl)   avEl.textContent   = (user.name || 'A').trim().charAt(0).toUpperCase();
}

async function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('al-email').value.trim();
  const pass  = document.getElementById('al-pass').value;
  const errEl = document.getElementById('al-error');
  errEl.textContent = '';

  if (!email || !pass) {
    errEl.textContent = 'Enter both email and password.';
    return;
  }

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    if (!data.user.isAdmin) {
      errEl.textContent = 'That account does not have admin access.';
      return;
    }
    ADMIN.token = data.token;
    ADMIN.user  = data.user;
    localStorage.setItem('shax_token', data.token);
    localStorage.setItem('shax_user', JSON.stringify(data.user));
    populateAdminUser(data.user);
    applyRoleVisibility();
    hideLoginOverlay();
    toast(`Welcome back, ${data.user.name}!`);
    initAdminPanel();
  } catch (err) {
    errEl.textContent = err.message || 'Invalid credentials.';
  }
}

function adminLogout() {
  clearAdminSession();
  window.location.href = '../index.html';
}

/* ─── NAV ────────────────────────────────────────────────── */
function showPage(id) {
  ADMIN.currentPage = id;
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${id}`)?.classList.add('active');
  document.querySelectorAll('.sidebar-link[data-page]').forEach(l => {
    l.classList.toggle('active', l.dataset.page === id);
  });
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
  document.getElementById('admin-sidebar')?.classList.remove('open');

  const titles = {
    dashboard: 'Dashboard', products: 'Products', categories: 'Categories',
    filters: 'Filters', orders: 'Orders', storage: 'Storage', analytics: 'Analytics',
    'sponsor-analytics': 'Sponsor Analytics',
    notifications: 'Notifications',
    push: 'Push Messages',
    settings: 'Settings'
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[id] || id;

  if (id === 'dashboard')  loadDashboard();
  if (id === 'products')   loadProducts();
  if (id === 'categories') loadCategories();
  if (id === 'filters')    loadFilters();
  if (id === 'orders')     loadOrders();
  if (id === 'storage')    loadStorage();
  if (id === 'analytics')  loadAnalytics();
  if (id === 'sponsor-analytics') loadSponsorAnalytics();
  if (id === 'notifications') initNotificationPage();
  if (id === 'push')       initPushPage();
  if (id === 'settings')   loadSettings();
}

/* ─── DASHBOARD ──────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const d = await api('/admin/dashboard');

    document.getElementById('dash-revenue').textContent  = money(d.totalRevenue);
    document.getElementById('dash-profit').textContent   = money(d.totalProfit || 0);
    document.getElementById('dash-cost').textContent     = money(d.totalCost || 0);
    document.getElementById('dash-orders').textContent   = d.orderCount;
    document.getElementById('dash-products').textContent = d.productCount;
    document.getElementById('dash-users').textContent    = d.userCount;
    document.getElementById('dash-pending').textContent  = d.pendingCount;
    const sp = document.getElementById('dash-sponsors');
    if (sp) sp.textContent = d.sponsorCount || 0;

    const recentEl = document.getElementById('recent-orders');
    if (recentEl) {
      recentEl.innerHTML = (!d.recentOrders || !d.recentOrders.length)
        ? '<tr class="admin-empty-row"><td colspan="5">No orders yet.</td></tr>'
        : d.recentOrders.map(o => `
          <tr>
            <td><b>${escapeHtml(o.id)}</b></td>
            <td>${escapeHtml(o.customer)}</td>
            <td>${new Date(o.date).toLocaleDateString()}</td>
            <td style="color:var(--gold);font-weight:700">${money(o.total)}</td>
            <td><span class="badge ${statusBadge(o.status)}">${escapeHtml(o.status)}</span></td>
          </tr>
        `).join('');
    }

    const lowEl = document.getElementById('low-stock');
    if (lowEl) {
      lowEl.innerHTML = (!d.outOfStock || !d.outOfStock.length)
        ? '<p style="color:#555;padding:8px 0">All products in stock.</p>'
        : d.outOfStock.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
            <span style="font-weight:600">${escapeHtml(p.name)}</span>
            <span class="badge badge-danger">Out of Stock</span>
          </div>
        `).join('');
    }
  } catch (err) {
    toast(err.message || 'Failed to load dashboard.', 'err');
  }
}

function statusBadge(s) {
  if (s === 'pending')    return 'badge-warning';
  if (s === 'processing') return 'badge-info';
  if (s === 'shipped')    return 'badge-info';
  if (s === 'delivered')  return 'badge-success';
  if (s === 'cancelled')  return 'badge-danger';
  return 'badge-info';
}

/* ─── PRODUCTS ───────────────────────────────────────────── */
async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="8">Loading…</td></tr>';
  try {
    ADMIN.products = await api('/products');
    if (!ADMIN.categories.length) await loadCategoriesQuiet();
    renderProductsTable();
  } catch (err) {
    toast(err.message || 'Failed to load products.', 'err');
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="7">Could not load products.</td></tr>';
  }
}

function renderProductsTable(filter = '') {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  let list = ADMIN.products;
  if (filter) {
    const f = filter.toLowerCase().trim();
    // Allow searching by product ID: "5" or "#5" matches product #5 exactly.
    const idQuery = f.replace(/^#/, '');
    const isNumeric = /^\d+$/.test(idQuery);
    list = list.filter(p =>
      (isNumeric && String(p.id) === idQuery) ||
      (p.name || '').toLowerCase().includes(f) ||
      (p.category || '').toLowerCase().includes(f)
    );
  }

  tbody.innerHTML = list.length === 0
    ? '<tr class="admin-empty-row"><td colspan="9">No products yet. Click "Add Product" to create your first one.</td></tr>'
    : list.map(p => {
      let addedBy;
      if (p.createdBy) {
        const isSponsor = p.createdByRole === 'sponsor';
        addedBy = `<span class="badge ${isSponsor ? 'badge-gold' : 'badge-info'}" title="${isSponsor ? 'Sponsor' : 'Admin'}">${escapeHtml(p.createdBy)}</span>`;
      } else {
        addedBy = '<span style="color:#555;font-size:.8rem">—</span>';
      }
      return `
      <tr>
        <td style="font-weight:700;color:var(--gold)">#${p.id}</td>
        <td><img class="tbl-thumb" src="${escapeHtml(p.image || '../assets/placeholder-product.png')}"
                 onerror="this.src='../assets/placeholder-product.png'" alt=""></td>
        <td>
          <div class="tbl-name">${escapeHtml(p.name)}</div>
          <div class="tbl-cat">${escapeHtml(categoryLabel(p.category))}</div>
        </td>
        <td style="color:var(--gold);font-weight:700">${money(p.price)}</td>
        <td>${p.reviewCount ? `<i class="fas fa-star" style="color:var(--gold)"></i> ${p.avgRating.toFixed(1)} (${p.reviewCount})` : '<span style="color:#555">No reviews</span>'}</td>
        <td>
          ${(() => {
            if (!p.inStock) return '<span class="badge badge-danger">Out of Stock</span>';
            if (p.stockMode === 'count' && p.sizeStock) {
              const parts = Object.entries(p.sizeStock).map(([sz, q]) =>
                `<span style="white-space:nowrap;color:${q > 0 ? '#27ae60' : '#c0392b'}">${escapeHtml(sz)}:${q}</span>`);
              return `<div style="display:flex;flex-wrap:wrap;gap:4px 8px;font-size:.78rem;font-weight:600">${parts.join('')}</div>`;
            }
            return '<span class="badge badge-success">In Stock</span>';
          })()}
        </td>
        <td>${addedBy}</td>
        <td>${p.badge ? `<span class="badge badge-gold">${escapeHtml(p.badge)}</span>` : '—'}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-edit" onclick="editProduct(${p.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="tbl-btn tbl-btn-del"  onclick="deleteProduct(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
}

function categoryLabel(id) {
  const c = ADMIN.categories.find(c => c.id === id);
  return c ? c.name : id;
}

function populateCategorySelect() {
  const sel = document.getElementById('p-category');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select category…</option>' +
    ADMIN.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  if (current) sel.value = current;
}

function openAddProduct() {
  ADMIN.editingProduct = null;
  resetProductForm();
  populateCategorySelect();
  ADMIN._productFilters = [];
  if (!ADMIN.filters || !ADMIN.filters.length) { loadFiltersQuiet().then(renderProductFilterChooser); }
  renderProductFilterChooser();
  document.getElementById('product-modal-title').textContent = 'Add Product';
  openModal('product-modal');
}

function editProduct(id) {
  const p = ADMIN.products.find(x => x.id === id);
  if (!p) return;
  ADMIN.editingProduct = p;
  resetProductForm();
  populateCategorySelect();

  document.getElementById('p-id').value          = p.id;
  document.getElementById('p-image-url').value    = p.image || '';
  document.getElementById('p-name').value         = p.name || '';
  document.getElementById('p-name-ku').value      = p.name_ku || '';
  document.getElementById('p-name-ar').value      = p.name_ar || '';
  ADMIN._productFilters = Array.isArray(p.filters) ? p.filters.map(f => f.id) : [];
  renderProductFilterChooser();
  document.getElementById('p-category').value     = p.category || '';
  document.getElementById('p-cost').value          = (p.costPrice != null ? p.costPrice : (p.price || ''));
  document.getElementById('p-profit').value        = (p.profit != null ? p.profit : 0);
  document.getElementById('p-old-price').value    = p.oldPrice || '';
  document.getElementById('p-shipping').value      = (p.shipping != null ? p.shipping : 0);
  document.getElementById('p-badge').value        = p.badge || '';
  document.getElementById('p-desc').value         = p.description || '';
  document.getElementById('p-desc-ku').value      = p.description_ku || '';
  document.getElementById('p-desc-ar').value      = p.description_ar || '';
  document.getElementById('p-in-stock').value     = p.inStock !== false ? '1' : '0';
  document.getElementById('p-stock-mode').value    = p.stockMode || 'hidden';
  ADMIN._sizeStock = (p.sizeStock && typeof p.sizeStock === 'object') ? { ...p.sizeStock } : {};
  ADMIN._colors = Array.isArray(p.colors) ? p.colors.map(c => ({ ...c })) : [];
  renderColorsList();
  syncMainImage();
  toggleStockQty();
  recalcSellingPrice();

  document.querySelectorAll('.size-check').forEach(cb => {
    cb.checked = (p.sizes || []).includes(cb.value);
  });

  document.getElementById('product-modal-title').textContent = 'Edit Product';
  openModal('product-modal');
}

function toggleStockQty() {
  const mode = document.getElementById('p-stock-mode').value;
  const grp = document.getElementById('p-stock-qty-group');
  if (grp) grp.style.display = (mode === 'count') ? 'block' : 'none';
  if (mode === 'count') renderSizeStockInputs();
}

/* Build a quantity input for each currently-checked size. Preserves any
   values already typed (and any previously-loaded values in ADMIN._sizeStock). */
function renderSizeStockInputs() {
  const grid = document.getElementById('p-size-stock-grid');
  if (!grid) return;
  // Capture current typed values first so re-rendering doesn't lose them.
  grid.querySelectorAll('input[data-size]').forEach(inp => {
    ADMIN._sizeStock = ADMIN._sizeStock || {};
    ADMIN._sizeStock[inp.dataset.size] = parseInt(inp.value) || 0;
  });
  const store = ADMIN._sizeStock || {};
  const checked = Array.from(document.querySelectorAll('.size-check:checked')).map(c => c.value);
  if (!checked.length) {
    grid.innerHTML = '<span style="color:#888;font-size:.85rem">Select at least one size above first.</span>';
    return;
  }
  grid.innerHTML = checked.map(sz => `
    <div style="display:flex;flex-direction:column;gap:4px;width:88px">
      <span style="font-size:.8rem;color:#C9A84C;font-weight:700;text-align:center">${escapeHtml(sz)}</span>
      <input class="form-input" type="number" min="0" step="1" data-size="${escapeHtml(sz)}"
             value="${store[sz] != null ? store[sz] : 0}" style="text-align:center;padding:6px">
    </div>
  `).join('');
}

function recalcSellingPrice() {
  const cost   = parseFloat(document.getElementById('p-cost').value) || 0;
  const profit = parseFloat(document.getElementById('p-profit').value) || 0;
  const total  = Math.round(cost + profit);
  const el = document.getElementById('p-selling');
  if (el) el.value = `${total.toLocaleString('en-US')} IQD`;
}

async function saveProduct() {
  const name  = document.getElementById('p-name').value.trim();
  const cat   = document.getElementById('p-category').value;
  const cost  = parseFloat(document.getElementById('p-cost').value);
  const profit = parseFloat(document.getElementById('p-profit').value) || 0;

  if (!name)             { toast('Product name is required.', 'err'); return; }
  if (!cat)              { toast('Category is required.', 'err'); return; }
  if (isNaN(cost) || cost < 0) { toast('A valid original price is required.', 'err'); return; }

  const sizes = Array.from(document.querySelectorAll('.size-check:checked')).map(c => c.value);
  const oldPriceVal = parseFloat(document.getElementById('p-old-price').value);

  const stockMode = document.getElementById('p-stock-mode').value;
  // Gather per-size quantities from the grid when in count mode.
  const sizeStock = {};
  if (stockMode === 'count') {
    document.querySelectorAll('#p-size-stock-grid input[data-size]').forEach(inp => {
      sizeStock[inp.dataset.size] = parseInt(inp.value) || 0;
    });
  }

  const colors = ADMIN._colors || [];

  if (!colors.length) {
    toast('Add at least one color with an image.', 'err');
    return;
  }

  const payload = {
    name,
    name_ku: document.getElementById('p-name-ku').value.trim(),
    name_ar: document.getElementById('p-name-ar').value.trim(),
    category: cat,
    filters: ADMIN._productFilters || [],
    cost_price: cost,
    profit: profit,
    shipping: parseFloat(document.getElementById('p-shipping').value) || 0,
    old_price: isNaN(oldPriceVal) ? null : oldPriceVal,
    badge: document.getElementById('p-badge').value || null,
    description: document.getElementById('p-desc').value.trim(),
    description_ku: document.getElementById('p-desc-ku').value.trim(),
    description_ar: document.getElementById('p-desc-ar').value.trim(),
    stock_mode: stockMode,
    size_stock: sizeStock,
    colors: colors,
    in_stock: stockMode !== 'out',
    sizes: sizes.length ? sizes : ['ONE SIZE'],
    image_url: colors[0]?.image || null
  };

  const btn = document.getElementById('p-save-btn');
  btn.disabled = true;

  try {
    if (ADMIN.editingProduct) {
      await api(`/products/${ADMIN.editingProduct.id}`, { method: 'PUT', body: JSON.stringify(payload) });
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
  ['p-id', 'p-name', 'p-name-ku', 'p-name-ar', 'p-category', 'p-cost', 'p-profit', 'p-old-price', 'p-shipping',
   'p-desc', 'p-desc-ku', 'p-desc-ar', 'p-image-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('p-badge').value = '';
  document.getElementById('p-in-stock').value = '1';
  document.getElementById('p-stock-mode').value = 'hidden';
  document.getElementById('p-stock-qty').value = '0';
  ADMIN._sizeStock = {};
  ADMIN._colors = [];
  renderColorsList();
  toggleStockQty();
  document.querySelectorAll('.size-check').forEach(cb => cb.checked = true);
  const selling = document.getElementById('p-selling');
  if (selling) selling.value = '0 IQD';
  const ship = document.getElementById('p-shipping');
  if (ship) ship.value = '0';
  const colorImg = document.getElementById('color-image-url');
  if (colorImg) colorImg.value = '';
  const colorLabel = document.getElementById('color-image-label');
  if (colorLabel) colorLabel.textContent = 'Upload';
}

/* ─── CATEGORIES ─────────────────────────────────────────── */
async function loadCategoriesQuiet() {
  try { ADMIN.categories = await api('/admin/categories'); } catch { ADMIN.categories = []; }
}

async function loadCategories() {
  const tbody = document.getElementById('categories-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="5">Loading…</td></tr>';
  try {
    ADMIN.categories = await api('/admin/categories');
    renderCategoriesTable();
  } catch (err) {
    toast(err.message || 'Failed to load categories.', 'err');
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="5">Could not load categories.</td></tr>';
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categories-tbody');
  if (!tbody) return;

  tbody.innerHTML = ADMIN.categories.length === 0
    ? '<tr class="admin-empty-row"><td colspan="6">No categories yet.</td></tr>'
    : ADMIN.categories.map(c => `
      <tr>
        <td><img class="tbl-thumb" src="${escapeHtml(c.image_url || '../assets/placeholder-category.png')}"
                 onerror="this.src='../assets/placeholder-category.png'" alt=""></td>
        <td><b>${escapeHtml(c.name)}</b></td>
        <td>${escapeHtml(c.name_ku) || '—'}</td>
        <td>${escapeHtml(c.name_ar) || '—'}</td>
        <td>${c.owner_name
              ? `<span class="badge badge-gold">${escapeHtml(c.owner_name)}</span>`
              : '<span style="color:#666;font-size:.8rem">Store</span>'}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-edit" onclick="editCategory('${escapeHtml(c.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="tbl-btn tbl-btn-del"  onclick="deleteCategory('${escapeHtml(c.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
}

function openAddCategory() {
  ADMIN.editingCategory = null;
  resetCategoryForm();
  document.getElementById('cat-modal-title').textContent = 'Add Category';
  openModal('category-modal');
}

function editCategory(id) {
  const c = ADMIN.categories.find(x => x.id === id);
  if (!c) return;
  ADMIN.editingCategory = c;
  resetCategoryForm();

  document.getElementById('cat-id').value         = c.id;
  document.getElementById('cat-image-url').value  = c.image_url || '';
  document.getElementById('cat-name').value       = c.name || '';
  document.getElementById('cat-name-ku').value    = c.name_ku || '';
  document.getElementById('cat-name-ar').value    = c.name_ar || '';

  if (c.image_url) {
    const preview = document.getElementById('cat-img-preview');
    preview.src = c.image_url;
    preview.style.display = 'block';
  }

  document.getElementById('cat-modal-title').textContent = 'Edit Category';
  openModal('category-modal');
}

async function saveCategory() {
  const name = document.getElementById('cat-name').value.trim();
  if (!name) { toast('Category name is required.', 'err'); return; }

  const payload = {
    name,
    name_ku: document.getElementById('cat-name-ku').value.trim(),
    name_ar: document.getElementById('cat-name-ar').value.trim(),
    image_url: document.getElementById('cat-image-url').value || null
  };

  const btn = document.getElementById('cat-save-btn');
  btn.disabled = true;

  try {
    if (ADMIN.editingCategory) {
      await api(`/admin/categories/${ADMIN.editingCategory.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/admin/categories', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('category-modal');
    await loadCategories();
    toast('Category saved!');
  } catch (err) {
    toast(err.message || 'Failed to save category.', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    await api(`/admin/categories/${id}`, { method: 'DELETE' });
    await loadCategories();
    toast('Category deleted.');
  } catch (err) {
    toast(err.message || 'Failed to delete category.', 'err');
  }
}

function resetCategoryForm() {
  ['cat-id', 'cat-name', 'cat-name-ku', 'cat-name-ar', 'cat-image-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const preview = document.getElementById('cat-img-preview');
  preview.style.display = 'none';
  preview.removeAttribute('src');
  document.getElementById('cat-upload-status').textContent = '';
}

/* ─── FILTERS (admin-made tags; product can have many) ──── */
async function loadFiltersQuiet() {
  try { ADMIN.filters = await api('/filters'); } catch { ADMIN.filters = []; }
}

async function loadFilters() {
  const tbody = document.getElementById('filters-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="6">Loading…</td></tr>';
  try {
    ADMIN.filters = await api('/filters');
    if (!ADMIN.products || !ADMIN.products.length) {
      try { ADMIN.products = await api('/products'); } catch {}
    }
    renderFiltersTable();
  } catch (err) {
    toast(err.message || 'Failed to load filters.', 'err');
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="6">Could not load filters.</td></tr>';
  }
}

function renderFiltersTable() {
  const tbody = document.getElementById('filters-tbody');
  if (!tbody) return;
  const countFor = id => (ADMIN.products || []).filter(p => (p.filters || []).some(f => f.id === id)).length;

  tbody.innerHTML = ADMIN.filters.length === 0
    ? '<tr class="admin-empty-row"><td colspan="6">No filters yet. Add one like "Summer" or "Sale".</td></tr>'
    : ADMIN.filters.map(f => `
      <tr>
        <td><img class="tbl-thumb" src="${escapeHtml(f.image_url || '../assets/placeholder-category.png')}"
                 onerror="this.src='../assets/placeholder-category.png'" alt=""></td>
        <td><b>${escapeHtml(f.name)}</b></td>
        <td>${escapeHtml(f.name_ku) || '—'}</td>
        <td>${escapeHtml(f.name_ar) || '—'}</td>
        <td>${countFor(f.id)}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-edit" onclick="editFilter('${escapeHtml(f.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="tbl-btn tbl-btn-del"  onclick="deleteFilter('${escapeHtml(f.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
}

function openAddFilter() {
  ADMIN.editingFilter = null;
  resetFilterForm();
  document.getElementById('filter-modal-title').textContent = 'Add Filter';
  openModal('filter-modal');
}

function editFilter(id) {
  const f = ADMIN.filters.find(x => x.id === id);
  if (!f) return;
  ADMIN.editingFilter = f;
  resetFilterForm();
  document.getElementById('filter-id').value        = f.id;
  document.getElementById('filter-image-url').value  = f.image_url || '';
  document.getElementById('filter-name').value       = f.name || '';
  document.getElementById('filter-name-ku').value    = f.name_ku || '';
  document.getElementById('filter-name-ar').value    = f.name_ar || '';
  if (f.image_url) {
    const preview = document.getElementById('filter-img-preview');
    preview.src = f.image_url;
    preview.style.display = 'block';
  }
  document.getElementById('filter-modal-title').textContent = 'Edit Filter';
  openModal('filter-modal');
}

async function saveFilter() {
  const name = document.getElementById('filter-name').value.trim();
  if (!name) { toast('Filter name is required.', 'err'); return; }
  const payload = {
    name,
    name_ku: document.getElementById('filter-name-ku').value.trim(),
    name_ar: document.getElementById('filter-name-ar').value.trim(),
    image_url: document.getElementById('filter-image-url').value || null
  };
  const btn = document.getElementById('filter-save-btn');
  btn.disabled = true;
  try {
    if (ADMIN.editingFilter) {
      await api(`/filters/${ADMIN.editingFilter.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/filters', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('filter-modal');
    await loadFilters();
    toast('Filter saved!');
  } catch (err) {
    toast(err.message || 'Failed to save filter.', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function deleteFilter(id) {
  if (!confirm('Delete this filter? Products keep existing but lose this tag.')) return;
  try {
    await api(`/filters/${id}`, { method: 'DELETE' });
    await loadFilters();
    toast('Filter deleted.');
  } catch (err) {
    toast(err.message || 'Failed to delete filter.', 'err');
  }
}

function resetFilterForm() {
  ['filter-id', 'filter-name', 'filter-name-ku', 'filter-name-ar', 'filter-image-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const preview = document.getElementById('filter-img-preview');
  preview.style.display = 'none';
  preview.removeAttribute('src');
  document.getElementById('filter-upload-status').textContent = '';
}

/* Multi-select filter chooser inside the product form. */
function renderProductFilterChooser() {
  const box = document.getElementById('p-filters-box');
  if (!box) return;
  const all = ADMIN.filters || [];
  if (!all.length) {
    box.innerHTML = '<span style="color:#666;font-size:.82rem">No filters yet. Create some in the Filters page.</span>';
    return;
  }
  ADMIN._productFilters = ADMIN._productFilters || [];
  box.innerHTML = all.map(f => {
    const on = ADMIN._productFilters.includes(f.id);
    return `<button type="button" onclick="toggleProductFilter('${escapeHtml(f.id)}')"
      style="padding:6px 12px;border-radius:20px;border:1px solid ${on ? '#C9A84C' : '#333'};
             background:${on ? 'rgba(201,168,76,0.15)' : '#1a1a1a'};color:${on ? '#C9A84C' : '#ccc'};
             cursor:pointer;font-size:.82rem">
      ${on ? '<i class="fas fa-check" style="margin-right:5px"></i>' : ''}${escapeHtml(f.name)}
    </button>`;
  }).join('');
}

function toggleProductFilter(id) {
  ADMIN._productFilters = ADMIN._productFilters || [];
  const i = ADMIN._productFilters.indexOf(id);
  if (i >= 0) ADMIN._productFilters.splice(i, 1);
  else ADMIN._productFilters.push(id);
  renderProductFilterChooser();
}

/* ─── PRODUCT COLORS (name + swatch + image — image required) ──── */
function addColor() {
  const nameEl = document.getElementById('color-name-input');
  const hexEl  = document.getElementById('color-hex-input');
  const imgEl  = document.getElementById('color-image-url');
  const name = nameEl.value.trim();
  const hex  = hexEl.value;
  if (!name) { toast('Enter a color name first.', 'err'); return; }
  if (!imgEl.value) { toast('Upload an image for this color.', 'err'); return; }

  ADMIN._colors = ADMIN._colors || [];
  if (ADMIN._colors.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    toast('That color name is already added.', 'err'); return;
  }
  const entry = { name, hex, image: imgEl.value };
  ADMIN._colors.push(entry);

  nameEl.value = '';
  hexEl.value = '#C9A84C';
  imgEl.value = '';
  document.getElementById('color-image-label').textContent = 'Upload';
  renderColorsList();
  syncMainImage();
}

function removeColor(index) {
  if (!ADMIN._colors) return;
  ADMIN._colors.splice(index, 1);
  renderColorsList();
  syncMainImage();
}

function renderColorsList() {
  const wrap = document.getElementById('colors-list');
  if (!wrap) return;
  const colors = ADMIN._colors || [];
  if (!colors.length) {
    wrap.innerHTML = '<span style="color:#666;font-size:.82rem">No images added. Each product needs at least one color with an image.</span>';
    return;
  }
  wrap.innerHTML = colors.map((c, i) => `
    <div class="color-card-item">
      ${c.image
        ? `<img class="color-card-img" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}">`
        : `<div class="color-card-img-placeholder"><i class="fas fa-image" style="font-size:1.5rem;margin-right:6px"></i>No Image</div>`
      }
      <div class="color-card-img-upload">
        <label title="Change image" for="color-reupload-${i}">
          <i class="fas fa-camera"></i>
        </label>
        <input type="file" id="color-reupload-${i}" accept="image/jpeg,image/png,image/webp,image/gif"
               style="display:none" onchange="replaceColorImage(${i}, this)">
      </div>
      <div class="color-card-body">
        <span class="color-card-swatch" style="background:${escapeHtml(c.hex)}"></span>
        <span class="color-card-name">${escapeHtml(c.name)}</span>
        <button type="button" class="color-card-remove" onclick="removeColor(${i})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function replaceColorImage(index, input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) { toast('File too large — max 5MB.', 'err'); return; }
  const formData = new FormData();
  formData.append('image', file);
  try {
    const result = await api('/admin/upload', { method: 'POST', body: formData });
    ADMIN._colors[index].image = result.url;
    renderColorsList();
    syncMainImage();
    toast('Image updated!');
  } catch (err) {
    toast(err.message || 'Upload failed.', 'err');
  }
}

function syncMainImage() {
  const colors = ADMIN._colors || [];
  const imgUrl = document.getElementById('p-image-url');
  if (colors.length && colors[0].image) {
    imgUrl.value = colors[0].image;
  } else {
    imgUrl.value = '';
  }
}

async function handleImageUpload(file, hiddenInputId, previewId, statusId) {
  const statusEl = statusId ? document.getElementById(statusId) : null;
  const preview  = previewId ? document.getElementById(previewId) : null;
  const setStatus = (txt, cls) => { if (statusEl) { statusEl.textContent = txt; statusEl.className = cls || 'upload-status'; } };

  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    setStatus('File too large — max 5MB.', 'upload-status error');
    return;
  }

  setStatus('Uploading…', 'upload-status uploading');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const result = await api('/admin/upload', { method: 'POST', body: formData });
    document.getElementById(hiddenInputId).value = result.url;
    if (preview) { preview.src = result.url; preview.style.display = 'block'; }
    setStatus('Uploaded!');
  } catch (err) {
    setStatus(err.message || 'Upload failed.', 'upload-status error');
  }
}

/* ─── ORDERS ─────────────────────────────────────────────── */
async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="8">Loading…</td></tr>';
  try {
    ADMIN.orders = await api('/orders');
    const activeTab = document.querySelector('.status-tab.active');
    renderOrdersTable(activeTab?.dataset.status || 'all', document.getElementById('orders-search')?.value || '');
  } catch (err) {
    toast(err.message || 'Failed to load orders.', 'err');
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="8">Could not load orders.</td></tr>';
  }
}

function renderOrdersTable(statusFilter = 'all', search = '') {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;

  let list = [...ADMIN.orders];
  if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(o =>
      (o.customer_name || '').toLowerCase().includes(s) ||
      (o.id || '').toLowerCase().includes(s)
    );
  }

  tbody.innerHTML = list.length === 0
    ? '<tr class="admin-empty-row"><td colspan="8">No orders found.</td></tr>'
    : list.map(o => {
      const myId = ADMIN.user && ADMIN.user.id;
      let assignedCell;
      if (o.taken_by) {
        const mine = myId && Number(o.taken_by) === Number(myId);
        assignedCell = `
          <div style="display:flex;flex-direction:column;gap:4px">
            <span class="badge ${mine ? 'badge-success' : 'badge-info'}">
              <i class="fas fa-user-check"></i> ${escapeHtml(o.taken_by_name || 'Admin')}${mine ? ' (you)' : ''}
            </span>
            <button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:.72rem"
                    onclick="releaseOrder('${escapeHtml(o.id)}')">Release</button>
          </div>`;
      } else {
        assignedCell = `
          <button class="btn btn-gold btn-sm" style="padding:5px 12px;font-size:.78rem"
                  onclick="takeOrder('${escapeHtml(o.id)}')">
            <i class="fas fa-hand-paper"></i> Take
          </button>`;
      }
      return `
      <tr>
        <td><b style="color:var(--gold)">${escapeHtml(o.id)}</b></td>
        <td>${escapeHtml(o.customer_name)}<br><small style="color:#555">${escapeHtml(o.email)}</small></td>
        <td>${escapeHtml(o.city) || '—'}</td>
        <td>${new Date(o.created_at).toLocaleDateString()}</td>
        <td style="color:var(--gold);font-weight:700">${money(o.total)}</td>
        <td>
          <select class="form-select" style="padding:4px 8px;font-size:0.8rem" onchange="updateOrderStatus('${escapeHtml(o.id)}', this.value)">
            ${['pending', 'processing', 'shipped', 'delivered', 'cancelled'].map(s =>
              `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </td>
        <td>${assignedCell}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-view" onclick="viewOrder('${escapeHtml(o.id)}')" title="View"><i class="fas fa-eye"></i></button>
            ${(o.status !== 'cancelled' && o.status !== 'delivered')
              ? `<button class="tbl-btn tbl-btn-cancel" onclick="cancelOrderAdmin('${escapeHtml(o.id)}')" title="Cancel order"><i class="fas fa-ban"></i></button>`
              : ''}
            <button class="tbl-btn tbl-btn-del" onclick="deleteOrder('${escapeHtml(o.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
}

async function cancelOrderAdmin(id) {
  if (!confirm(`Cancel order ${id}? The customer's total won't count and Telegram will be notified.`)) return;
  try {
    await api(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
    const o = ADMIN.orders.find(x => x.id === id);
    if (o) o.status = 'cancelled';
    toast('Order cancelled.');
    renderOrdersTable(
      document.querySelector('.status-tab.active')?.dataset.status || 'all',
      document.getElementById('orders-search')?.value || ''
    );
    if (ADMIN.currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message || 'Failed to cancel order.', 'err');
  }
}

async function takeOrder(id) {
  try {
    const res = await api(`/orders/${id}/take`, { method: 'PUT' });
    const o = ADMIN.orders.find(x => x.id === id);
    if (o) { o.taken_by = ADMIN.user.id; o.taken_by_name = res.takenBy || ADMIN.user.name; }
    toast('You took this order.');
    renderOrdersTable(
      document.querySelector('.status-tab.active')?.dataset.status || 'all',
      document.getElementById('orders-search')?.value || ''
    );
  } catch (err) {
    toast(err.message || 'Could not take order.', 'err');
    loadOrders(); // refresh so we see who actually has it
  }
}

async function releaseOrder(id) {
  try {
    await api(`/orders/${id}/release`, { method: 'PUT' });
    const o = ADMIN.orders.find(x => x.id === id);
    if (o) { o.taken_by = null; o.taken_by_name = null; }
    toast('Order released.');
    renderOrdersTable(
      document.querySelector('.status-tab.active')?.dataset.status || 'all',
      document.getElementById('orders-search')?.value || ''
    );
  } catch (err) {
    toast(err.message || 'Could not release order.', 'err');
    loadOrders();
  }
}

async function updateOrderStatus(id, status) {
  try {
    await api(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    const o = ADMIN.orders.find(x => x.id === id);
    if (o) o.status = status;
    toast(`Order ${id} → ${status}`);
    
    // Send Telegram notification automatically when order status changes
    if (ADMIN.settings && ADMIN.settings.botTokenSet) {
      try {
        await api('/admin/telegram/resend', { method: 'POST', body: JSON.stringify({ orderId: id }) });
        toast('Telegram notification sent for status change');
      } catch (e) {
        console.warn('Failed to send Telegram notification:', e.message);
        toast('Notification error - check configuration', 'err');
      }
    }
    
    if (ADMIN.currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message || 'Failed to update order status.', 'err');
    loadOrders();
  }
}

async function deleteOrder(id) {
  if (!confirm(`Delete order ${id}? This permanently removes it and its items.`)) return;
  try {
    await api(`/orders/${id}`, { method: 'DELETE' });
    toast(`Order ${id} deleted.`);
    await loadOrders();
    if (ADMIN.currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message || 'Failed to delete order.', 'err');
  }
}

/* Clear orders in bulk — respects the active status tab.
   "All" tab clears every order; a status tab clears only that status. */
async function clearOrders() {
  const activeTab = document.querySelector('.status-tab.active');
  const status = activeTab?.dataset.status || 'all';

  const label = status === 'all' ? 'ALL orders' : `all "${status}" orders`;
  if (!confirm(`This will permanently delete ${label}. This cannot be undone.\n\nContinue?`)) return;

  try {
    const result = await api('/orders/clear', {
      method: 'DELETE',
      body: JSON.stringify({ status })
    });
    toast(result.message || 'Orders cleared.');
    await loadOrders();
    if (ADMIN.currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message || 'Failed to clear orders.', 'err');
  }
}

/* Keep the Clear button label in sync with the active status tab */
function updateClearOrdersLabel() {
  const activeTab = document.querySelector('.status-tab.active');
  const status = activeTab?.dataset.status || 'all';
  const labelEl = document.getElementById('clear-orders-label');
  if (labelEl) {
    labelEl.textContent = status === 'all' ? 'Clear All' : `Clear ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  }
}

function viewOrder(id) {
  const o = ADMIN.orders.find(x => x.id === id);
  if (!o) return;

  const items = Array.isArray(o.items) ? o.items : [];
  const waNumber = (o.phone || '').replace(/\D/g, '');

  document.getElementById('order-detail-body').innerHTML = `
    <div class="order-detail-grid">
      <div class="order-detail-block">
        <div class="order-detail-label">Order ID</div>
        <div class="order-detail-value" style="color:var(--gold)">${escapeHtml(o.id)}</div>
      </div>
      <div class="order-detail-block">
        <div class="order-detail-label">Status</div>
        <div class="order-detail-value"><span class="badge ${statusBadge(o.status)}">${escapeHtml(o.status)}</span></div>
      </div>
      <div class="order-detail-block">
        <div class="order-detail-label">Assigned To</div>
        <div class="order-detail-value">${o.taken_by_name
          ? `<span class="badge badge-info"><i class="fas fa-user-check"></i> ${escapeHtml(o.taken_by_name)}</span>`
          : '<span style="color:#888">Unassigned</span>'}</div>
      </div>
      <div class="order-detail-block">
        <div class="order-detail-label">Customer</div>
        <div class="order-detail-value">${escapeHtml(o.customer_name)}<br><small style="color:#aaa">${escapeHtml(o.email)}</small></div>
      </div>
      <div class="order-detail-block">
        <div class="order-detail-label">Phone</div>
        <div class="order-detail-value">${escapeHtml(o.phone) || '—'}</div>
      </div>
      <div class="order-detail-block" style="grid-column:1/-1">
        <div class="order-detail-label">Address</div>
        <div class="order-detail-value">${o.city ? escapeHtml(o.city) + ', ' : ''}${escapeHtml(o.address) || '—'}</div>
      </div>
      ${(o.latitude != null && o.longitude != null) ? `
        <div class="order-detail-block" style="grid-column:1/-1">
          <div class="order-detail-label">Shared Location</div>
          <div class="order-detail-value">
            <a href="https://www.google.com/maps?q=${o.latitude},${o.longitude}" target="_blank" rel="noopener"
               style="color:#C9A84C;text-decoration:underline">
              <i class="fas fa-map-location-dot" style="margin-right:5px"></i>Open in Google Maps
            </a>
          </div>
        </div>
      ` : ''}
      ${o.note ? `
        <div class="order-detail-block" style="grid-column:1/-1">
          <div class="order-detail-label">Note</div>
          <div class="order-detail-value">${escapeHtml(o.note)}</div>
        </div>
      ` : ''}
    </div>
    <div style="margin-top:20px">
      <div class="form-section-title">Items</div>
      ${items.map(i => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
          <span>${escapeHtml(i.name)} (${escapeHtml(i.size)}) × ${i.qty}</span>
          <span style="color:var(--gold)">${money((i.price || 0) * (i.qty || 1))}</span>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;padding:14px 0;font-weight:800;font-size:1.1rem">
        <span>Total</span>
        <span style="color:var(--gold)">${money(o.total)}</span>
      </div>
    </div>
    <div style="margin-top:16px;text-align:right">
      ${waNumber ? `
        <a href="https://wa.me/${waNumber}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="margin-right:8px">
          <i class="fab fa-whatsapp"></i> WhatsApp
        </a>
      ` : ''}
      <button class="btn btn-gold btn-sm" onclick="resendTelegram('${escapeHtml(o.id)}')">
        <i class="fab fa-telegram"></i> Resend Telegram
      </button>
    </div>
  `;

  openModal('order-detail-modal');
}

async function resendTelegram(orderId) {
  try {
    await api('/admin/telegram/resend', { method: 'POST', body: JSON.stringify({ orderId }) });
    toast('Sent to Telegram!');
  } catch (err) {
    toast(err.message || 'Failed to resend.', 'err');
  }
}

/* ─── SETTINGS ───────────────────────────────────────────── */
async function loadSettings() {
  try {
    const s = await api('/admin/settings');
    ADMIN.settings = s;
    document.getElementById('tg-chat').value = s.chatId || '';
    document.getElementById('tg-token').placeholder = s.botTokenSet
      ? 'Bot token is saved — enter a new one only to replace it'
      : 'Paste your bot token from @BotFather';
    document.getElementById('tg-status').textContent = s.botTokenSet
      ? '● A bot token is currently configured.'
      : '○ No bot token configured yet.';
    const moEl = document.getElementById('min-order-input');
    if (moEl) moEl.value = s.minOrder != null ? s.minOrder : 0;
    const cpEl = document.getElementById('commission-pct-input');
    if (cpEl) cpEl.value = s.sponsorCommissionPct != null ? s.sponsorCommissionPct : 20;
  } catch (err) {
    toast(err.message || 'Failed to load settings.', 'err');
  }

  if (ADMIN.user) {
    document.getElementById('admin-email').placeholder = ADMIN.user.email;
  }

  /* Load shipping info page content */
  try {
    const c = await api('/admin/content/shipping_info');
    const ta = document.getElementById('shipping-text');
    if (ta) ta.value = (c && c.content) ? c.content : '';
  } catch { /* non-fatal */ }

  /* Load sponsor accounts */
  loadSponsors();

  /* Super-admin-only: load the admin accounts list */
  if (ADMIN.user && ADMIN.user.role === 'super_admin') {
    loadAdmins();
  }
}

async function loadSponsors() {
  const tbody = document.getElementById('sponsors-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="5">Loading…</td></tr>';
  try {
    const list = await api('/admin/sponsors');
    tbody.innerHTML = (!list.length)
      ? '<tr class="admin-empty-row"><td colspan="5">No sponsor accounts yet.</td></tr>'
      : list.map(s => `
        <tr>
          <td class="tbl-name">${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.email)}</td>
          <td>${s.storeName ? escapeHtml(s.storeName) : '<span style="color:#666">No store yet</span>'}</td>
          <td>${s.productCount}</td>
          <td>
            <div class="tbl-actions">
              <button class="tbl-btn tbl-btn-del" onclick="deleteSponsor(${s.id}, '${escapeHtml(s.name)}')" title="Remove sponsor">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="5">Could not load sponsors.</td></tr>';
    toast(err.message || 'Failed to load sponsors.', 'err');
  }
}

async function createSponsor() {
  const name  = document.getElementById('sp-name').value.trim();
  const email = document.getElementById('sp-email').value.trim();
  const pass  = document.getElementById('sp-pass').value;

  if (!name || !email || !pass) { toast('Fill in name, email and password.', 'err'); return; }
  if (pass.length < 8) { toast('Password must be at least 8 characters.', 'err'); return; }

  try {
    await api('/admin/sponsors', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass })
    });
    toast('Sponsor account created!');
    document.getElementById('sp-name').value = '';
    document.getElementById('sp-email').value = '';
    document.getElementById('sp-pass').value = '';
    loadSponsors();
    loadDashboard();
  } catch (err) {
    toast(err.message || 'Failed to create sponsor.', 'err');
  }
}

async function deleteSponsor(id, name) {
  if (!confirm(`Remove sponsor "${name}"?\n\nTheir products and store category stay in the shop but will no longer belong to anyone. This cannot be undone.`)) return;
  try {
    await api(`/admin/sponsors/${id}`, { method: 'DELETE' });
    toast('Sponsor removed.');
    loadSponsors();
    loadDashboard();
  } catch (err) {
    toast(err.message || 'Failed to remove sponsor.', 'err');
  }
}

/* ── ADMIN MANAGEMENT (super admin only) ──────────────── */
async function loadAdmins() {
  const tbody = document.getElementById('admins-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="4">Loading…</td></tr>';
  try {
    const list = await api('/admin/admins');
    tbody.innerHTML = list.map(a => `
      <tr>
        <td class="tbl-name">${escapeHtml(a.name)}</td>
        <td>${escapeHtml(a.email)}</td>
        <td>
          ${a.isSuperAdmin
            ? '<span class="badge badge-gold">Super Admin</span>'
            : '<span class="badge badge-info">Admin</span>'}
        </td>
        <td>
          ${a.isSuperAdmin
            ? '<span style="color:#555;font-size:.8rem">—</span>'
            : `<div class="tbl-actions">
                 <button class="tbl-btn tbl-btn-del" onclick="deleteAdmin(${a.id}, '${escapeHtml(a.name)}')" title="Remove admin">
                   <i class="fas fa-trash"></i>
                 </button>
               </div>`}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="4">Could not load admins.</td></tr>';
  }
}

async function createAdmin() {
  const name  = document.getElementById('adm-name').value.trim();
  const email = document.getElementById('adm-email').value.trim();
  const pass  = document.getElementById('adm-pass').value;

  if (!name || !email || !pass) { toast('Fill in name, email and password.', 'err'); return; }
  if (pass.length < 8) { toast('Password must be at least 8 characters.', 'err'); return; }

  try {
    await api('/admin/admins', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass })
    });
    toast('Admin account created!');
    document.getElementById('adm-name').value = '';
    document.getElementById('adm-email').value = '';
    document.getElementById('adm-pass').value = '';
    loadAdmins();
  } catch (err) {
    toast(err.message || 'Failed to create admin.', 'err');
  }
}

async function deleteAdmin(id, name) {
  if (!confirm(`Remove admin "${name}"? This cannot be undone.`)) return;
  try {
    await api(`/admin/admins/${id}`, { method: 'DELETE' });
    toast('Admin removed.');
    loadAdmins();
  } catch (err) {
    toast(err.message || 'Failed to remove admin.', 'err');
  }
}

/* Show/hide super-admin-only UI based on the logged-in user's role. */
function applyRoleVisibility() {
  const isSuper = ADMIN.user && ADMIN.user.role === 'super_admin';

  const adminMgmt = document.getElementById('admin-mgmt-section');
  if (adminMgmt) adminMgmt.style.display = isSuper ? 'block' : 'none';

  // Telegram bot token editing is super-admin only. Regular admins can't
  // see or change it. (Order notifications still work; they just can't edit.)
  const tg = document.getElementById('telegram-config-section');
  if (tg) tg.style.display = isSuper ? 'block' : 'none';
}

async function saveShippingInfo() {
  const content = document.getElementById('shipping-text').value;
  try {
    await api('/admin/content/shipping_info', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    toast('Shipping info saved!');
  } catch (err) {
    toast(err.message || 'Failed to save shipping info.', 'err');
  }
}

async function saveTelegramSettings() {
  const token  = document.getElementById('tg-token').value.trim();
  const chatId = document.getElementById('tg-chat').value.trim();

  if (!chatId) { toast('Chat ID is required.', 'err'); return; }
  if (!token && !ADMIN.settings.botTokenSet) {
    toast('Bot token is required the first time you save.', 'err');
    return;
  }
  if (!token) {
    toast('Re-enter the bot token to confirm this save (it is never sent back to the browser for security).', 'err');
    return;
  }

  try {
    await api('/admin/settings', { method: 'POST', body: JSON.stringify({ botToken: token, chatId }) });
    toast('Telegram settings saved!');
    document.getElementById('tg-token').value = '';
    loadSettings();
  } catch (err) {
    toast(err.message || 'Failed to save settings.', 'err');
  }
}

async function saveMinOrder() {
  const val = parseFloat(document.getElementById('min-order-input').value) || 0;
  try {
    await api('/admin/min-order', { method: 'POST', body: JSON.stringify({ minOrder: val }) });
    toast(val > 0 ? `Minimum order set to ${Math.round(val).toLocaleString('en-US')} IQD.` : 'Minimum order removed.');
  } catch (err) {
    toast(err.message || 'Failed to save minimum order.', 'err');
  }
}

async function saveCommissionPct() {
  const val = parseFloat(document.getElementById('commission-pct-input').value);
  if (isNaN(val) || val < 0 || val > 100) { toast('Enter a value between 0 and 100.', 'err'); return; }
  try {
    await api('/admin/sponsor-commission', {
      method: 'POST',
      body: JSON.stringify({ pct: val })
    });
    toast(`Sponsor commission set to ${val}%.`);
  } catch (err) {
    toast(err.message || 'Failed to save commission.', 'err');
  }
}

async function testTelegram() {
  try {
    await api('/admin/telegram/test', { method: 'POST' });
    toast('Test message sent!');
  } catch (err) {
    toast(err.message || 'Failed to send test message.', 'err');
  }
}

async function saveAdminCredentials() {
  const email = document.getElementById('admin-email').value.trim();
  const pass  = document.getElementById('admin-pass').value;

  if (!email || !pass) { toast('Fill in both the email and password.', 'err'); return; }
  if (pass.length < 8) { toast('Password must be at least 8 characters.', 'err'); return; }

  try {
    await api('/admin/credentials', { method: 'POST', body: JSON.stringify({ email, password: pass }) });
    toast('Admin credentials updated! Use the new email/password next time you log in.');
    document.getElementById('admin-pass').value = '';
    document.getElementById('admin-email').value = '';
    document.getElementById('admin-email').placeholder = email;
  } catch (err) {
    toast(err.message || 'Failed to update credentials.', 'err');
  }
}

/* ─── STORAGE / CONTAINERS  (v2) ──────────────────────────── */
ADMIN.containers = [];
ADMIN.allStorageItems = [];
ADMIN._editingContainer = null;
ADMIN._editingContainerItem = null;
ADMIN._currentDetailContainerId = null;
ADMIN._ciSizes = {};   // { "M": 5, "L": 3, ... }

async function loadStorage() {
  await Promise.all([loadStorageSummary(), loadContainers(), loadStorageItems()]);
}

async function loadStorageSummary() {
  try {
    const s = await api('/admin/storage/summary');
    document.getElementById('storage-container-count').textContent = s.containerCount;
    document.getElementById('storage-total-units').textContent    = s.totalUnits;
    document.getElementById('storage-total-cost').textContent     = money(s.totalCost);
    document.getElementById('storage-total-profit').textContent   = money(s.totalPotentialProfit);
    document.getElementById('storage-total-delivery').textContent = money(s.totalDeliveryCost);
    document.getElementById('storage-total-overall').textContent  = money(s.totalOverall);
  } catch (err) {
    toast(err.message || 'Failed to load storage summary.', 'err');
  }
}

async function loadContainers() {
  const tbody = document.getElementById('containers-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="11">Loading…</td></tr>';
  try {
    ADMIN.containers = await api('/admin/containers');
    renderContainersTable();
  } catch (err) {
    toast(err.message || 'Failed to load containers.', 'err');
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="11">Could not load containers.</td></tr>';
  }
}

function renderContainersTable() {
  const tbody = document.getElementById('containers-tbody');
  if (!tbody) return;

  const statusBadgeMap = {
    pending: 'badge-warning',
    received: 'badge-info',
    completed: 'badge-success'
  };

  tbody.innerHTML = ADMIN.containers.length === 0
    ? '<tr class="admin-empty-row"><td colspan="11">No containers yet. Click "New Container" to create your first shipment.</td></tr>'
    : ADMIN.containers.map(c => {
        const grand = c.totalCost + c.deliveryCost;
        return `
      <tr>
        <td style="font-weight:700;color:var(--gold)">#${c.number}</td>
        <td><b>${escapeHtml(c.name)}</b></td>
        <td>${escapeHtml(c.country) || '—'}</td>
        <td style="text-align:center">${c.itemCount}</td>
        <td style="text-align:center">${c.totalUnits}</td>
        <td style="font-weight:600;color:#3498db">${money(c.totalCost)}</td>
        <td style="font-weight:600;color:${c.totalProfit >= 0 ? '#27ae60' : '#e57368'}">${money(c.totalProfit)}</td>
        <td style="font-weight:600;color:#f39c12">${money(c.deliveryCost)}</td>
        <td style="font-weight:700;color:var(--gold)">${money(grand)}</td>
        <td><span class="badge ${statusBadgeMap[c.status] || 'badge-info'}">${escapeHtml(c.status)}</span></td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-view" onclick="viewContainer(${c.id})" title="View Items"><i class="fas fa-eye"></i></button>
            <button class="tbl-btn tbl-btn-edit" onclick="openAddContainerItem(${c.id})" title="Add Item"><i class="fas fa-plus"></i></button>
            <button class="tbl-btn tbl-btn-edit" onclick="editContainer(${c.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="tbl-btn tbl-btn-del"  onclick="deleteContainer(${c.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
      }).join('');
}

async function loadStorageItems() {
  const tbody = document.getElementById('storage-items-tbody');
  if (tbody) tbody.innerHTML = '<tr class="admin-loading-row"><td colspan="10">Loading…</td></tr>';
  try {
    ADMIN.allStorageItems = await api('/admin/storage/all-items');
    renderStorageItemsTable();
  } catch (err) {
    toast(err.message || 'Failed to load storage items.', 'err');
    if (tbody) tbody.innerHTML = '<tr class="admin-empty-row"><td colspan="10">Could not load items.</td></tr>';
  }
}

function renderStorageItemsTable(search = '') {
  const tbody = document.getElementById('storage-items-tbody');
  if (!tbody) return;

  let list = ADMIN.allStorageItems;
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(i =>
      (i.productName || '').toLowerCase().includes(s) ||
      (i.containerName || '').toLowerCase().includes(s) ||
      (i.category || '').toLowerCase().includes(s)
    );
  }

  tbody.innerHTML = list.length === 0
    ? '<tr class="admin-empty-row"><td colspan="10">No items in storage yet.</td></tr>'
    : list.map(i => {
      const sizesObj = i.sizes || {};
      const sizeLabels = Object.entries(sizesObj).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(', ') || '—';
      const profit = i.totalProfit;
      return `
      <tr>
        <td><img class="tbl-thumb" src="${escapeHtml(i.image || '../assets/placeholder-product.png')}"
                 onerror="this.src='../assets/placeholder-product.png'" alt=""></td>
        <td><div class="tbl-name">${escapeHtml(i.productName)}</div></td>
        <td>${escapeHtml(i.category) || '—'}</td>
        <td><span class="badge badge-info" style="font-size:.7rem">#${i.containerNumber} ${escapeHtml(i.containerName)}</span></td>
        <td style="font-size:.78rem">${sizeLabels}</td>
        <td style="font-weight:700">${i.totalQuantity}</td>
        <td style="color:#3498db;font-weight:600">${money(i.totalCost)}</td>
        <td style="color:#27ae60;font-weight:600">${money(i.totalSelling)}</td>
        <td style="color:${profit >= 0 ? '#27ae60' : '#e57368'};font-weight:600">${money(profit)}</td>
        <td>
          <div class="tbl-actions">
            <button class="tbl-btn tbl-btn-edit" onclick="editContainerItem(${i.containerId}, ${i.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="tbl-btn tbl-btn-del"  onclick="deleteContainerItem(${i.containerId}, ${i.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
}

function switchStorageTab(tab) {
  document.querySelectorAll('[data-storage-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.storageTab === tab);
  });
  document.getElementById('storage-tab-containers').style.display = tab === 'containers' ? 'block' : 'none';
  document.getElementById('storage-tab-all-items').style.display = tab === 'all-items' ? 'block' : 'none';
}

/* ── Container CRUD ────────────────────────────────────── */
function openAddContainer() {
  ADMIN._editingContainer = null;
  resetContainerForm();
  document.getElementById('container-modal-title').textContent = 'New Container';
  openModal('container-modal');
}

function editContainer(id) {
  const c = ADMIN.containers.find(x => x.id === id);
  if (!c) return;
  ADMIN._editingContainer = c;
  resetContainerForm();
  document.getElementById('ct-id').value = c.id;
  document.getElementById('ct-number').value = c.number || '';
  document.getElementById('ct-name').value = c.name || '';
  document.getElementById('ct-country').value = c.country || '';
  document.getElementById('ct-delivery').value = c.deliveryCost || 0;
  document.getElementById('ct-status').value = c.status || 'pending';
  document.getElementById('ct-notes').value = c.notes || '';
  document.getElementById('container-modal-title').textContent = 'Edit Container';
  openModal('container-modal');
}

async function saveContainer() {
  const name = document.getElementById('ct-name').value.trim();
  const number = parseInt(document.getElementById('ct-number').value);
  if (!name) { toast('Container name is required.', 'err'); return; }
  if (!number || number < 1) { toast('Container number is required.', 'err'); return; }

  const payload = {
    number,
    name,
    country: document.getElementById('ct-country').value.trim(),
    deliveryCost: parseFloat(document.getElementById('ct-delivery').value) || 0,
    status: document.getElementById('ct-status').value,
    notes: document.getElementById('ct-notes').value.trim()
  };

  const btn = document.getElementById('ct-save-btn');
  btn.disabled = true;

  try {
    if (ADMIN._editingContainer) {
      await api(`/admin/containers/${ADMIN._editingContainer.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/admin/containers', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('container-modal');
    await loadStorage();
    toast('Container saved!');
  } catch (err) {
    toast(err.message || 'Failed to save container.', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function deleteContainer(id) {
  if (!confirm('Delete this container and all its items? This cannot be undone.')) return;
  try {
    await api(`/admin/containers/${id}`, { method: 'DELETE' });
    await loadStorage();
    toast('Container deleted.');
  } catch (err) {
    toast(err.message || 'Failed to delete container.', 'err');
  }
}

function resetContainerForm() {
  ['ct-id', 'ct-number', 'ct-name', 'ct-country', 'ct-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('ct-delivery').value = '0';
  document.getElementById('ct-status').value = 'pending';
}

/* ── Container Detail View ─────────────────────────────── */
async function viewContainer(id) {
  ADMIN._currentDetailContainerId = id;
  const body = document.getElementById('ct-detail-body');
  body.innerHTML = '<p style="color:#888;text-align:center;padding:20px">Loading…</p>';
  document.getElementById('ct-detail-title').textContent = 'Container Details';
  openModal('container-detail-modal');

  try {
    const c = await api(`/admin/containers/${id}`);
    const t = c.totals;
    const statusBadgeMap = { pending: 'badge-warning', received: 'badge-info', completed: 'badge-success' };

    body.innerHTML = `
      <div class="order-detail-grid" style="margin-bottom:20px">
        <div class="order-detail-block">
          <div class="order-detail-label">Container</div>
          <div class="order-detail-value" style="color:var(--gold)">#${c.number} — ${escapeHtml(c.name)}</div>
        </div>
        <div class="order-detail-block">
          <div class="order-detail-label">Status</div>
          <div class="order-detail-value"><span class="badge ${statusBadgeMap[c.status] || 'badge-info'}">${escapeHtml(c.status)}</span></div>
        </div>
        <div class="order-detail-block">
          <div class="order-detail-label">Country</div>
          <div class="order-detail-value">${escapeHtml(c.country) || '—'}</div>
        </div>
        <div class="order-detail-block">
          <div class="order-detail-label">Delivery Cost</div>
          <div class="order-detail-value" style="color:#f39c12;font-weight:700">${money(c.deliveryCost)}</div>
        </div>
        ${c.createdBy ? `<div class="order-detail-block">
          <div class="order-detail-label">Created By</div>
          <div class="order-detail-value">${escapeHtml(c.createdBy)}</div>
        </div>` : ''}
      </div>
      ${c.notes ? `<div class="tg-info" style="margin-bottom:16px"><i class="fas fa-sticky-note" style="color:var(--gold)"></i><span>${escapeHtml(c.notes)}</span></div>` : ''}

      <!-- Summary Bar -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div style="background:var(--gray);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:100px;text-align:center">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:1px">Units</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--gold)">${t.totalUnits}</div>
        </div>
        <div style="background:var(--gray);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:100px;text-align:center">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:1px">Cost</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:#3498db">${money(t.totalCost)}</div>
        </div>
        <div style="background:var(--gray);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:100px;text-align:center">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:1px">Selling</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:#27ae60">${money(t.totalSelling)}</div>
        </div>
        <div style="background:var(--gray);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:100px;text-align:center">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:1px">Profit</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:${t.totalProfit >= 0 ? '#27ae60' : '#e57368'}">${money(t.totalProfit)}</div>
        </div>
        <div style="background:var(--gray);border-radius:var(--radius);padding:12px 16px;flex:1;min-width:100px;text-align:center;border:1px solid var(--gold)">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:1px">Grand Total</div>
          <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--gold)">${money(t.grandTotal)}</div>
        </div>
      </div>

      <!-- Add Item Button -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="form-section-title" style="margin:0;border:none;padding:0">Items</div>
        <button class="btn btn-gold btn-sm" onclick="openAddContainerItem(${c.id})">
          <i class="fas fa-plus"></i> Add Item
        </button>
      </div>

      ${c.items.length === 0
        ? '<p style="color:#888;text-align:center;padding:20px">No items in this container yet. Click "Add Item" to begin.</p>'
        : `<div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Sizes</th>
                  <th>Units</th>
                  <th>Cost/unit</th>
                  <th>Sell/unit</th>
                  <th>Total Cost</th>
                  <th>Total Selling</th>
                  <th>Profit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${c.items.map(i => {
                  const sizeLabels = Object.entries(i.sizes || {}).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(', ') || '—';
                  return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <img class="tbl-thumb" src="${escapeHtml(i.image || '../assets/placeholder-product.png')}"
                             onerror="this.src='../assets/placeholder-product.png'" alt="">
                        <div>
                          <div class="tbl-name">${escapeHtml(i.productName)}</div>
                          ${i.productId ? `<div style="font-size:.7rem;color:#666">Product #${i.productId}</div>` : ''}
                        </div>
                      </div>
                    </td>
                    <td>${escapeHtml(i.category) || '—'}</td>
                    <td style="font-size:.78rem">${sizeLabels}</td>
                    <td style="font-weight:700">${i.totalQuantity}</td>
                    <td>${money(i.costPrice)}</td>
                    <td style="color:#27ae60">${money(i.sellingPrice)}</td>
                    <td style="color:#3498db;font-weight:600">${money(i.totalCost)}</td>
                    <td style="color:#27ae60;font-weight:600">${money(i.totalSelling)}</td>
                    <td style="color:${i.totalProfit >= 0 ? '#27ae60' : '#e57368'};font-weight:600">${money(i.totalProfit)}</td>
                    <td>
                      <div class="tbl-actions">
                        <button class="tbl-btn tbl-btn-edit" onclick="editContainerItem(${c.id}, ${i.id})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="tbl-btn tbl-btn-view" onclick="pushContainerItem(${c.id}, ${i.id}, '${escapeHtml(i.productName).replace(/'/g,"\\'")}')" title="Push to Products"><i class="fas fa-share"></i></button>
                        <button class="tbl-btn tbl-btn-del"  onclick="deleteContainerItem(${c.id}, ${i.id})" title="Delete"><i class="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
      }
    `;
  } catch (err) {
    body.innerHTML = `<p style="color:#e57368;text-align:center;padding:20px">${escapeHtml(err.message || 'Failed to load container.')}</p>`;
  }
}

/* ── Push Container Item → Product Catalog ──────────────── */
async function pushContainerItem(containerId, itemId, currentName) {
  const newName = prompt('Product name for the catalog:', currentName);
  if (newName === null) return;
  const name = newName.trim();
  if (!name) { toast('Product name is required.', 'err'); return; }

  const category = prompt('Category for the product:', '');
  if (category === null) return;
  if (!category.trim()) { toast('Category is required.', 'err'); return; }

  try {
    const result = await api(`/admin/containers/${containerId}/items/${itemId}/push-to-product`, {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), category: category.trim() })
    });
    toast(result.message || 'Product created!');
    if (ADMIN._currentDetailContainerId) viewContainer(ADMIN._currentDetailContainerId);
  } catch (err) {
    toast(err.message || 'Failed to create product.', 'err');
  }
}

/* ── Container Item CRUD ───────────────────────────────── */
function openAddContainerItem(containerId) {
  ADMIN._editingContainerItem = null;
  resetContainerItemForm();
  ADMIN._ciSizes = {};
  document.getElementById('ci-container-id').value = containerId;
  document.getElementById('ci-modal-title').textContent = 'Add Item';
  populateCiProductSelect();
  populateCiCategorySelect();
  renderCiSizesUI();
  openModal('container-item-modal');
}

function editContainerItem(containerId, itemId) {
  let item = ADMIN.allStorageItems.find(i => i.containerId === containerId && i.id === itemId);
  if (!item && ADMIN._currentDetailContainerId === containerId) {
    /* Try to find from detail view's loaded data — fall back to API */
  }
  if (!item) {
    /* Load item from all-items if not found in memory */
    item = ADMIN.allStorageItems.find(i => i.containerId === containerId && i.id === itemId);
  }
  if (!item) { toast('Item not found in loaded data.', 'err'); return; }

  ADMIN._editingContainerItem = item;
  ADMIN._ciSizes = { ...(item.sizes || {}) };
  resetContainerItemForm();
  document.getElementById('ci-container-id').value = containerId;
  document.getElementById('ci-id').value = itemId;
  document.getElementById('ci-product-id').value = item.productId || '';
  document.getElementById('ci-product-name').value = item.productName || '';
  document.getElementById('ci-cost').value = item.costPrice || 0;
  document.getElementById('ci-selling').value = item.sellingPrice || 0;
  populateCiProductSelect();
  populateCiCategorySelect();
  if (item.category) document.getElementById('ci-category').value = item.category;
  document.getElementById('ci-modal-title').textContent = 'Edit Item';
  renderCiSizesUI();
  openModal('container-item-modal');
}

/* ── Size Row Helpers ──────────────────────────────────── */
function addCiSizeRow() {
  const sel  = document.getElementById('ci-size-select');
  const qtyEl = document.getElementById('ci-size-qty');
  const size = sel.value;
  const qty  = parseInt(qtyEl.value) || 0;
  if (qty < 1) { toast('Quantity must be at least 1.', 'err'); return; }
  ADMIN._ciSizes[size] = (ADMIN._ciSizes[size] || 0) + qty;
  qtyEl.value = 1;
  renderCiSizesUI();
}

function setCiSize(size, val) {
  const n = parseInt(val) || 0;
  if (n <= 0) delete ADMIN._ciSizes[size];
  else ADMIN._ciSizes[size] = n;
  renderCiSizesUI();
}

function removeCiSize(size) {
  delete ADMIN._ciSizes[size];
  renderCiSizesUI();
}

function renderCiSizesUI() {
  const container = document.getElementById('ci-sizes-container');
  const totalEl   = document.getElementById('ci-total-qty');
  if (!container) return;
  const entries = Object.entries(ADMIN._ciSizes).filter(([,v]) => v > 0);
  container.innerHTML = entries.length === 0
    ? '<span style="color:#888;font-size:.82rem">No sizes added yet</span>'
    : entries.map(([k, v]) => `
        <div style="display:flex;align-items:center;gap:4px;background:var(--gray);border-radius:6px;padding:4px 8px">
          <span style="font-weight:700;font-size:.82rem;min-width:32px">${k}</span>
          <input class="form-input" type="number" min="0" value="${v}" onchange="setCiSize('${k}', this.value)" style="width:60px;padding:2px 4px;font-size:.82rem">
          <button type="button" onclick="removeCiSize('${k}')" style="background:none;border:none;color:#e57368;cursor:pointer;font-size:.75rem"><i class="fas fa-times"></i></button>
        </div>`).join('');
  if (totalEl) totalEl.textContent = entries.reduce((s, [,v]) => s + v, 0);
}

function onCiProductChange() {
  const pid = document.getElementById('ci-product-id').value;
  if (pid && ADMIN.products && ADMIN.products.length) {
    const p = ADMIN.products.find(x => String(x.id) === String(pid));
    if (p) {
      document.getElementById('ci-product-name').value = p.name || '';
      if (p.category) document.getElementById('ci-category').value = p.category;
      if (p.costPrice) document.getElementById('ci-cost').value = p.costPrice;
      if (p.price) document.getElementById('ci-selling').value = p.price;
    }
  }
}

function populateCiProductSelect() {
  const sel = document.getElementById('ci-product-id');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">None — add as new product</option>' +
    (ADMIN.products || []).map(p => `<option value="${p.id}">${escapeHtml(p.name)} (#${p.id})</option>`).join('');
  if (current) sel.value = current;
}

function populateCiCategorySelect() {
  const sel = document.getElementById('ci-category');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select category…</option>' +
    ADMIN.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  if (current) sel.value = current;
}

async function saveContainerItem() {
  const name = document.getElementById('ci-product-name').value.trim();
  if (!name) { toast('Product name is required.', 'err'); return; }

  const sizes = { ...ADMIN._ciSizes };
  const totalUnits = Object.values(sizes).reduce((s, v) => s + (parseInt(v) || 0), 0);
  if (totalUnits < 1) { toast('Add at least 1 unit across sizes.', 'err'); return; }

  const payload = {
    productId: document.getElementById('ci-product-id').value || null,
    productName: name,
    category: document.getElementById('ci-category').value || null,
    costPrice: parseFloat(document.getElementById('ci-cost').value) || 0,
    sellingPrice: parseFloat(document.getElementById('ci-selling').value) || 0,
    sizes
  };

  const containerId = document.getElementById('ci-container-id').value;
  const itemId = document.getElementById('ci-id').value;
  const btn = document.getElementById('ci-save-btn');
  btn.disabled = true;

  try {
    if (itemId) {
      await api(`/admin/containers/${containerId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api(`/admin/containers/${containerId}/items`, { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal('container-item-modal');
    await loadStorage();
    if (ADMIN._currentDetailContainerId) viewContainer(ADMIN._currentDetailContainerId);
    toast('Item saved!');
  } catch (err) {
    toast(err.message || 'Failed to save item.', 'err');
  } finally {
    btn.disabled = false;
  }
}

async function deleteContainerItem(containerId, itemId) {
  if (!confirm('Remove this item from the container?')) return;
  try {
    await api(`/admin/containers/${containerId}/items/${itemId}`, { method: 'DELETE' });
    await loadStorage();
    if (ADMIN._currentDetailContainerId) viewContainer(ADMIN._currentDetailContainerId);
    toast('Item removed.');
  } catch (err) {
    toast(err.message || 'Failed to remove item.', 'err');
  }
}

function resetContainerItemForm() {
  ['ci-id', 'ci-container-id', 'ci-product-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('ci-product-id').value = '';
  document.getElementById('ci-category').value = '';
  document.getElementById('ci-cost').value = '';
  document.getElementById('ci-selling').value = '';
  ADMIN._ciSizes = {};
  renderCiSizesUI();
}

/* ─── ANALYTICS ─────────────────────────────────────────── */
async function loadAnalytics() {
  const grid = document.getElementById('analytics-admins-grid');
  if (grid) grid.innerHTML = '<div style="padding:40px;text-align:center;color:#888">Loading analytics…</div>';
  try {
    const data = await api('/admin/analytics');

    /* Super admin global totals */
    const globalEl = document.getElementById('analytics-global');
    if (data.globalTotals && globalEl) {
      globalEl.style.display = 'block';
      document.getElementById('analytics-global-profit').textContent   = money(data.globalTotals.grandProfit);
      document.getElementById('analytics-global-cost').textContent     = money(data.globalTotals.grandCost);
      document.getElementById('analytics-global-revenue').textContent  = money(data.globalTotals.orderRevenue);
      document.getElementById('analytics-global-delivery').textContent = money(data.globalTotals.deliveryCost);
    } else if (globalEl) {
      globalEl.style.display = 'none';
    }

    /* Per-admin cards */
    if (!data.analytics || data.analytics.length === 0) {
      grid.innerHTML = '<div style="padding:40px;text-align:center;color:#888">No analytics data available.</div>';
      return;
    }

    grid.innerHTML = data.analytics.map(a => `
      <div class="admin-card" style="padding:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--gold);color:#000;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem">${(a.name||'?')[0]}</div>
          <div>
            <div style="font-weight:700;font-size:1rem">${escapeHtml(a.name)}</div>
            <div style="font-size:.78rem;color:#888">${escapeHtml(a.email)} · ${a.role === 'super_admin' ? 'Super Admin' : 'Admin'}</div>
          </div>
        </div>

        <!-- Combined Totals -->
        <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:90px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Total Profit</div>
            <div style="font-weight:800;color:${a.combined.totalProfit >= 0 ? '#27ae60' : '#e57368'};font-size:1.05rem">${money(a.combined.totalProfit)}</div>
          </div>
          <div style="flex:1;min-width:90px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Total Cost</div>
            <div style="font-weight:800;color:#3498db;font-size:1.05rem">${money(a.combined.totalCost)}</div>
          </div>
          <div style="flex:1;min-width:90px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Revenue</div>
            <div style="font-weight:800;color:var(--gold);font-size:1.05rem">${money(a.combined.totalRevenue)}</div>
          </div>
        </div>

        <!-- Breakdown: Orders -->
        <div style="margin-bottom:10px">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px"><i class="fas fa-shopping-cart" style="color:var(--gold);margin-right:4px"></i> Orders Taken</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:.82rem">${a.orders.count} orders</span>
            <span style="font-size:.82rem;color:#27ae60">Profit: ${money(a.orders.profit)}</span>
            <span style="font-size:.82rem;color:#3498db">Cost: ${money(a.orders.cost)}</span>
          </div>
        </div>

        <!-- Breakdown: Products -->
        <div style="margin-bottom:10px">
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px"><i class="fas fa-box" style="color:var(--gold);margin-right:4px"></i> Products Created</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:.82rem">${a.products.count} products</span>
            <span style="font-size:.82rem;color:#27ae60">Profit: ${money(a.products.totalProfit)}</span>
            <span style="font-size:.82rem;color:#3498db">Cost: ${money(a.products.totalCost)}</span>
          </div>
        </div>

        <!-- Breakdown: Storage -->
        <div>
          <div style="font-size:.72rem;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px"><i class="fas fa-warehouse" style="color:var(--gold);margin-right:4px"></i> Storage Items Added</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:.82rem">${a.storage.itemCount} items · ${a.containers.count} containers</span>
            <span style="font-size:.82rem;color:#27ae60">Profit: ${money(a.storage.profit)}</span>
            <span style="font-size:.82rem;color:#3498db">Cost: ${money(a.storage.cost)}</span>
            <span style="font-size:.82rem;color:#f39c12">Delivery: ${money(a.containers.deliveryCost)}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div style="padding:40px;text-align:center;color:#e57368">${escapeHtml(err.message || 'Failed to load analytics.')}</div>`;
  }
}

/* ════════════════════════════════════════════════════════════
   SPONSOR ANALYTICS
   ════════════════════════════════════════════════════════════ */

async function loadSponsorAnalytics() {
  const grid = document.getElementById('sa-sponsors-grid');
  if (grid) grid.innerHTML = '<div style="padding:40px;text-align:center;color:#888">Loading sponsor analytics…</div>';
  try {
    const data = await api('/admin/sponsor-analytics');

    /* Global totals */
    const globalEl = document.getElementById('sa-global');
    if (globalEl) {
      globalEl.style.display = 'block';
      document.getElementById('sa-global-revenue').textContent   = money(data.globalRevenue);
      document.getElementById('sa-global-profit').textContent    = money(data.globalProfit);
      document.getElementById('sa-global-commission').textContent = money(data.globalCommission);
      document.getElementById('sa-global-sold').textContent      = Number(data.globalSold).toLocaleString();
      document.getElementById('sa-commission-pct-label').textContent = data.commissionPct;
    }

    /* Per-sponsor cards */
    if (!data.sponsors || data.sponsors.length === 0) {
      grid.innerHTML = '<div style="padding:40px;text-align:center;color:#888">No sponsors found. Create a sponsor account to get started.</div>';
      return;
    }

    grid.innerHTML = data.sponsors.map(s => `
      <div class="admin-card" style="padding:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--gold);color:#000;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem">${(s.name||'?')[0]}</div>
          <div>
            <div style="font-weight:700;font-size:1rem">${escapeHtml(s.name)}</div>
            <div style="font-size:.78rem;color:#888">${escapeHtml(s.email)}${s.storeName ? ' · ' + escapeHtml(s.storeName) : ''}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:80px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Products</div>
            <div style="font-weight:800;color:#fff;font-size:1.05rem">${s.productCount}</div>
          </div>
          <div style="flex:1;min-width:80px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Orders</div>
            <div style="font-weight:800;color:#3498db;font-size:1.05rem">${s.orderCount}</div>
          </div>
          <div style="flex:1;min-width:80px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Sold</div>
            <div style="font-weight:800;color:#9b59b6;font-size:1.05rem">${s.totalSold}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:100px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Revenue</div>
            <div style="font-weight:800;color:var(--gold);font-size:1rem">${money(s.totalRevenue)}</div>
          </div>
          <div style="flex:1;min-width:100px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Profit</div>
            <div style="font-weight:800;color:#27ae60;font-size:1rem">${money(s.totalProfit)}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:100px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Commission (${s.commissionPct}%)</div>
            <div style="font-weight:800;color:#c0392b;font-size:1rem">-${money(s.commission)}</div>
          </div>
          <div style="flex:1;min-width:100px;background:var(--gray);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.68rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Earnings</div>
            <div style="font-weight:800;color:#C9A84C;font-size:1rem">${money(s.sponsorEarnings)}</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div style="padding:40px;text-align:center;color:#e57368">${escapeHtml(err.message || 'Failed to load sponsor analytics.')}</div>`;
  }
}

/* ─── MODAL HELPERS ──────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ════════════════════════════════════════════════════════
   NOTIFICATIONS  (Stage 6 — Admin Notification Sender)
   Composes and sends notifications through the Stage 5 API.
   The backend enforces admin authorization; this UI is frontend
   only and can never bypass it.
   ════════════════════════════════════════════════════════ */
const NOTIF_TYPES = [
  { value: 'general',   label: 'General' },
  { value: 'product',   label: 'Product' },
  { value: 'category',  label: 'Category' },
  { value: 'order',     label: 'Order' },
  { value: 'account',   label: 'Account' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'system',    label: 'System' }
];

const NOTIF_AUDIENCES = {
  all: {
    label: 'All Customers / Users',
    desc: 'This notification will be sent to all registered user accounts (customers, sponsors and admins).'
  },
  role_customer: {
    label: 'All Customers (customer role)',
    desc: 'This notification will be sent to all customer accounts only (excludes sponsors and admins).'
  },
  role_sponsor: {
    label: 'All Sponsors',
    desc: 'This notification will be sent to all sponsor accounts only.'
  },
  role_admin: {
    label: 'All Admins',
    desc: 'This notification will be sent to all admin accounts (role admins).'
  },
  role_super_admin: {
    label: 'All Super Admins',
    desc: 'This notification will be sent to all super admin accounts only.'
  },
  user: {
    label: 'Specific User',
    desc: 'This notification will be sent only to the selected account. Choose a user by name or email below.'
  }
};

const NOTIF = {
  sending: false,
  selectedUser: null,
  users: [] // cached user list (id, name, email)
};

/* User-target input is shared by the Notifications composer and the
   Push test form. Each page names its inputs prefix-user-search /
   prefix-user-results / prefix-selected-user, so the active form is
   tracked by prefix and the same helpers serve both pages. */
let USER_TARGET_PREFIX = 'notif-';
function setUserTargetPrefix(p) {
  USER_TARGET_PREFIX = p;
  NOTIF.selectedUser = null;
}

function initNotificationPage() {
  setUserTargetPrefix('notif-');
  // Wire up event listeners only once per navigation is fine (idempotent if guarded).
  const audienceSel = document.getElementById('notif-audience');
  if (audienceSel && !audienceSel.dataset.wired) {
    audienceSel.dataset.wired = '1';

    audienceSel.addEventListener('change', () => {
      hideNotifErrors();
      onAudienceChange();
      updatePreview();
    });

    const titleEl = document.getElementById('notif-title');
    const msgEl = document.getElementById('notif-message');
    if (titleEl) titleEl.addEventListener('input', togglePreviewDirty);
    if (msgEl) msgEl.addEventListener('input', togglePreviewDirty);

    const typeSel = document.getElementById('notif-type');
    if (typeSel) typeSel.addEventListener('change', updatePreview);

    const searchEl = document.getElementById('notif-user-search');
    if (searchEl) searchEl.addEventListener('input', debounce(onUserSearch, 250));

    // Close search results on outside click
    document.addEventListener('click', (e) => {
      const groupId = USER_TARGET_PREFIX + 'user-group';
      if (e.target.closest('#' + groupId)) return;
      if (e.target.closest('.notif-user-results, .notif-selected-user')) return;
      closeUserResults();
    });
  }

  hideNotifResult();
  onAudienceChange();
  updatePreview();
  hideNotifErrors();
}

function onAudienceChange() {
  const aud = document.getElementById('notif-audience')?.value || 'all';
  const descEl = document.getElementById('notif-audience-desc-text');
  const userGroup = document.getElementById(USER_TARGET_PREFIX + 'user-group');
  const sel = document.getElementById(USER_TARGET_PREFIX + 'selected-user');

  if (descEl && NOTIF_AUDIENCES[aud]) descEl.textContent = NOTIF_AUDIENCES[aud].desc;

  const isUser = aud === 'user';
  if (userGroup) userGroup.style.display = isUser ? 'flex' : 'none';
  if (!isUser) {
    // Not sending to a specific user — clear any selected user for correctness.
    NOTIF.selectedUser = null;
    if (sel) sel.style.display = 'none';
    const search = document.getElementById(USER_TARGET_PREFIX + 'user-search');
    if (search) search.value = '';
    closeUserResults();
  }
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

async function onUserSearch() {
  const q = document.getElementById(USER_TARGET_PREFIX + 'user-search')?.value.trim();
  const resultsEl = document.getElementById(USER_TARGET_PREFIX + 'user-results');
  if (!resultsEl) return;

  // Load the user list once (any admin may call /api/admin/users).
  if (!NOTIF.users.length) {
    try { NOTIF.users = await api('/admin/users'); }
    catch { NOTIF.users = []; }
  }

  if (!q) { closeUserResults(); return; }

  const term = q.toLowerCase();
  const matches = NOTIF.users
    .filter(u =>
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term))
    )
    .slice(0, 25);

  resultsEl.innerHTML = '';
  if (NOTIF.selectedUser) {
    // Allow picking a different user while one is selected.
  }
  if (!matches.length) {
    resultsEl.innerHTML = '<div class="notif-user-no-results">No users match "' + escapeHtml(q) + '".</div>';
  } else {
    matches.forEach(u => {
      const item = document.createElement('div');
      item.className = 'notif-user-result-item';
      item.innerHTML =
        '<div class="nu-name">' + escapeHtml(u.name || 'Unnamed') + '</div>' +
        '<div class="nu-email">' + escapeHtml(u.email || '') + '</div>';
      item.addEventListener('click', () => selectUser(u));
      resultsEl.appendChild(item);
    });
  }
  resultsEl.classList.add('open');
}

function selectUser(u) {
  NOTIF.selectedUser = { id: u.id, name: u.name, email: u.email };
  const search = document.getElementById(USER_TARGET_PREFIX + 'user-search');
  const sel = document.getElementById(USER_TARGET_PREFIX + 'selected-user');
  if (search) search.value = '';
  closeUserResults();
  if (sel) {
    sel.style.display = 'flex';
    sel.innerHTML =
      '<span><i class="fas fa-user-check" style="color:var(--green-bright);margin-right:6px"></i>' +
      escapeHtml(u.name || 'Unnamed') + ' (' + escapeHtml(u.email || '') + ')</span>' +
      '<button type="button" onclick="clearSelectedUser()">Change</button>';
  }
  hideNotifErrors();
}

function clearSelectedUser() {
  NOTIF.selectedUser = null;
  const sel = document.getElementById(USER_TARGET_PREFIX + 'selected-user');
  if (sel) sel.style.display = 'none';
  const search = document.getElementById(USER_TARGET_PREFIX + 'user-search');
  if (search) search.value = '';
}

function closeUserResults() {
  const r = document.getElementById(USER_TARGET_PREFIX + 'user-results');
  if (r) { r.classList.remove('open'); r.innerHTML = ''; }
}

/* --- Preview --- */
function notifAudienceLabel() {
  const aud = document.getElementById('notif-audience')?.value || 'all';
  if (aud === 'user' && NOTIF.selectedUser) return 'Specific User: ' + (NOTIF.selectedUser.name || NOTIF.selectedUser.email);
  return NOTIF_AUDIENCES[aud] ? NOTIF_AUDIENCES[aud].label : 'All Customers / Users';
}

function notifTypeLabel() {
  const t = document.getElementById('notif-type')?.value || 'general';
  const found = NOTIF_TYPES.find(x => x.value === t);
  return found ? found.label : 'General';
}

function togglePreviewDirty() {
  // Debounced preview update as the user types.
  clearTimeout(togglePreviewDirty._t);
  togglePreviewDirty._t = setTimeout(updatePreview, 120);
}

function updatePreview() {
  const titleEl = document.getElementById('notif-title');
  const msgEl = document.getElementById('notif-message');
  const title = titleEl ? titleEl.value : '';
  const message = msgEl ? msgEl.value : '';

  const pt = document.getElementById('notif-preview-type');
  const ptt = document.getElementById('notif-preview-title');
  const pm = document.getElementById('notif-preview-message');
  const pa = document.getElementById('notif-preview-audience');

  if (pt) pt.textContent = notifTypeLabel();
  if (pa) pa.innerHTML = '<i class="fas fa-users"></i> ' + escapeHtml(notifAudienceLabel());
  // Preview content is inserted via textContent (never innerHTML) so it is
  // display-only and can never execute — matching the backend storing raw text.
  if (ptt) ptt.textContent = title || 'Notification title';
  if (pm) pm.textContent = message || 'Notification message appears here.';
}

/* --- Validation --- */
function hideNotifErrors() {
  ['notif-title-err', 'notif-message-err', USER_TARGET_PREFIX + 'user-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function validateComposer() {
  hideNotifErrors();
  const title = (document.getElementById('notif-title')?.value || '').trim();
  const message = (document.getElementById('notif-message')?.value || '').trim();
  const type = document.getElementById('notif-type')?.value || '';
  const audience = document.getElementById('notif-audience')?.value || '';

  let ok = true;

  if (!title) { document.getElementById('notif-title-err').textContent = 'Title is required.'; ok = false; }
  else if (title.length > 200) { document.getElementById('notif-title-err').textContent = 'Title must be 200 characters or fewer.'; ok = false; }

  if (!message) { document.getElementById('notif-message-err').textContent = 'Message is required.'; ok = false; }
  else if (message.length > 5000) { document.getElementById('notif-message-err').textContent = 'Message must be 5000 characters or fewer.'; ok = false; }

  const validTypes = NOTIF_TYPES.map(t => t.value);
  if (!validTypes.includes(type)) { document.getElementById('notif-title-err').textContent = 'Please choose a valid notification type.'; ok = false; }

  if (!NOTIF_AUDIENCES[audience]) { document.getElementById('notif-title-err').textContent = 'Please choose a valid audience.'; ok = false; }

  if (audience === 'user') {
    if (!NOTIF.selectedUser) {
      document.getElementById('notif-user-err').textContent = 'Search and select the user you want to notify.';
      ok = false;
    }
  }

  return ok;
}

async function submitNotification() {
  if (NOTIF.sending) return; // duplicate-submit protection
  hideNotifResult();
  if (!validateComposer()) {
    toast('Please fix the highlighted fields.', 'err');
    return;
  }

  const aud = document.getElementById('notif-audience').value;
  const label = NOTIF_AUDIENCES[aud] ? NOTIF_AUDIENCES[aud].label : '';
  const type = notifTypeLabel();

  document.getElementById('notif-confirm-text').innerHTML =
    'You are about to send this notification to <b>' + escapeHtml(label) + '</b>. Continue?';
  document.getElementById('notif-confirm-summary').textContent =
    '[' + type + ']\n' +
    (document.getElementById('notif-title').value.trim()) + '\n\n' +
    (document.getElementById('notif-message').value.trim());

  openModal('notif-confirm-modal');
}

async function confirmSendNotification() {
  if (NOTIF.sending) return;
  NOTIF.sending = true;

  const btn = document.getElementById('notif-confirm-send-btn');
  const mainBtn = document.getElementById('notif-send-btn');
  if (btn) btn.classList.add('notif-sending');
  if (mainBtn) mainBtn.classList.add('notif-sending');

  // Re-validate defensively (user could have changed fields while modal was open).
  if (!validateComposer()) {
    NOTIF.sending = false;
    if (btn) btn.classList.remove('notif-sending');
    if (mainBtn) mainBtn.classList.remove('notif-sending');
    closeModal('notif-confirm-modal');
    toast('Composer validation failed. Please review the form.', 'err');
    return;
  }

  const aud = document.getElementById('notif-audience').value;
  const payload = {
    title: document.getElementById('notif-title').value.trim(),
    message: document.getElementById('notif-message').value.trim(),
    type: document.getElementById('notif-type').value,
    audience: 'all',
    targetRole: null,
    targetUserId: null
  };

  // Translate the friendly audience selection into the Stage 5 API contract.
  if (aud === 'all') { payload.audience = 'all'; }
  else if (aud === 'role_customer')   { payload.audience = 'role'; payload.targetRole = 'customer'; }
  else if (aud === 'role_sponsor')    { payload.audience = 'role'; payload.targetRole = 'sponsor'; }
  else if (aud === 'role_admin')      { payload.audience = 'role'; payload.targetRole = 'admin'; }
  else if (aud === 'role_super_admin'){ payload.audience = 'role'; payload.targetRole = 'super_admin'; }
  else if (aud === 'user')            { payload.audience = 'user'; payload.targetUserId = NOTIF.selectedUser.id; }

  try {
    await api('/notifications/send', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showNotifResult('ok', 'Notification sent successfully.');
    toast('Notification sent!');
    closeModal('notif-confirm-modal');
    resetComposer();
  } catch (err) {
    // Keep the user's entered message; just surface a clear error and allow retry.
    showNotifResult('err', 'Could not send: ' + (err.message || 'Unknown error.'));
    toast((err.message || 'Could not send notification.') + ' Please try again.', 'err');
    closeModal('notif-confirm-modal');
  } finally {
    NOTIF.sending = false;
    if (btn) btn.classList.remove('notif-sending');
    if (mainBtn) mainBtn.classList.remove('notif-sending');
  }
}

function resetComposer() {
  const f = document.getElementById('notif-form');
  if (f) f.reset();
  // Restore sensible defaults that a reset() may not cover.
  const type = document.getElementById('notif-type');
  if (type) type.value = 'general';
  const aud = document.getElementById('notif-audience');
  if (aud) aud.value = 'all';
  clearSelectedUser();
  hideNotifErrors();
  hideNotifResult();
  const userGroup = document.getElementById(USER_TARGET_PREFIX + 'user-group');
  if (userGroup) userGroup.style.display = 'none';
  updatePreview();
}

function showNotifResult(kind, msg) {
  const el = document.getElementById('notif-result');
  if (!el) return;
  el.className = kind;
  el.style.display = 'block';
  el.textContent = msg;
}
function hideNotifResult() {
  const el = document.getElementById('notif-result');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}

/* ════════════════════════════════════════════════════════
   PUSH MESSAGES  (Stage 11 — Native Push Diagnostics)
   Reads firebase-admin status & device-token counts, and sends a
   real or dry-run test push. Authorization is enforced by the
   backend (requireAuth + requireAdmin); this UI only renders it.
   ════════════════════════════════════════════════════════ */
const PUSH = { sending: false };

const PUSH_TARGETS = {
  all: 'Sends to every user account that currently has an active device token registered.',
  role_customer: 'Sends to all customer accounts that currently have an active device token.',
  role_sponsor: 'Sends to all sponsor accounts that currently have an active device token.',
  role_admin: 'Sends to all admin accounts that currently have an active device token.',
  user: 'Sends only to the selected user\'s devices. Choose a user by name or email below.',
  token: 'Sends to one specific device by its FCM registration token.'
};

function initPushPage() {
  setUserTargetPrefix('push-');

  const targetSel = document.getElementById('push-test-target');
  if (targetSel && !targetSel.dataset.wired) {
    targetSel.dataset.wired = '1';
    targetSel.addEventListener('change', onPushTargetChange);
  }

  const searchEl = document.getElementById('push-user-search');
  if (searchEl) searchEl.addEventListener('input', debounce(onUserSearch, 250));

  onPushTargetChange();
  loadPushStatus(true);
}

function onPushTargetChange() {
  const target = document.getElementById('push-test-target')?.value || 'all';
  const descEl = document.getElementById('push-test-target-desc-text');
  const userGroup = document.getElementById('push-user-group');
  const tokenGroup = document.getElementById('push-token-group');
  const sel = document.getElementById('push-selected-user');

  if (descEl && PUSH_TARGETS[target]) descEl.textContent = PUSH_TARGETS[target];

  if (userGroup) userGroup.style.display = target === 'user' ? 'flex' : 'none';
  if (tokenGroup) tokenGroup.style.display = target === 'token' ? 'flex' : 'none';

  if (target !== 'user') {
    NOTIF.selectedUser = null;
    if (sel) sel.style.display = 'none';
    const search = document.getElementById('push-user-search');
    if (search) search.value = '';
    closeUserResults();
  }

  ['push-user-err', 'push-token-err', 'push-test-message-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  hidePushResult();
}

async function loadPushStatus(showSpinner) {
  const body = document.getElementById('push-status-body');
  const badge = document.getElementById('push-delivery-badge');
  if (!body) return;
  if (showSpinner) {
    body.innerHTML = '<p style="color:#555">Loading push diagnostics…</p>';
    if (badge) { badge.textContent = 'Loading…'; badge.className = 'badge badge-info'; }
  }
  try {
    const status = await api('/admin/push/status');
    renderPushStatus(status);
  } catch (err) {
    body.innerHTML =
      '<div class="tg-info" style="border-color:rgba(192,57,43,.4);background:rgba(192,57,43,.08)">' +
      '<i class="fas fa-triangle-exclamation" style="color:#e57368"></i>' +
      '<span style="color:#e57368">' + escapeHtml(err.message || 'Failed to load push status.') + '</span></div>';
    if (badge) { badge.textContent = 'Error'; badge.className = 'badge badge-danger'; }
  }
}

function renderPushStatus(status) {
  const badge = document.getElementById('push-delivery-badge');
  const body = document.getElementById('push-status-body');
  body.innerHTML = '';

  const fb = status.firebase || {};
  const d = status.devices || {};
  const byP = d.byPlatform || {};

  if (badge) {
    const active = status.deliveryMode === 'active';
    badge.textContent = active ? 'Active' : 'Not configured';
    badge.className = 'badge ' + (active ? 'badge-success' : 'badge-warning');
  }

  const viaLabels = {
    'service-account-b64': 'FIREBASE_SERVICE_ACCOUNT_B64',
    'service-account-path': 'FIREBASE_SERVICE_ACCOUNT_PATH',
    'application-default-credentials': 'GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_CONFIG',
    'already-initialized': 'already initialized'
  };
  const via = viaLabels[fb.configuredVia] || fb.configuredVia || '—';

  let html = '';
  html += '<div class="push-dev-counts">' +
    '<div class="push-count"><b>' + escapeHtml(d.active || 0) + '</b><span>Active devices</span></div>' +
    '<div class="push-count"><b>' + escapeHtml(byP.android || 0) + '</b><span>Android</span></div>' +
    '<div class="push-count"><b>' + escapeHtml(byP.ios || 0) + '</b><span>iOS</span></div>' +
    '<div class="push-count"><b>' + escapeHtml(d.activeUsers || 0) + '</b><span>Users reached</span></div>' +
    '<div class="push-count"><b>' + escapeHtml(d.total || 0) + '</b><span>Tokens (all time)</span></div>' +
    '</div>';

  html +=
    '<div class="push-kv"><span>firebase-admin</span><b>' + (fb.installed ? 'Installed' : 'Not installed') + '</b></div>' +
    '<div class="push-kv"><span>Delivery mode</span><b>' +
      (status.deliveryMode === 'active' ? 'ACTIVE (Firebase configured)' : 'Unconfigured — in-app notifications only') +
    '</b></div>' +
    '<div class="push-kv"><span>Configured via</span><b>' + escapeHtml(via) + '</b></div>' +
    '<div class="push-kv"><span>Firebase project</span><b>' + escapeHtml(fb.projectId || '—') + '</b></div>' +
    '<div class="push-kv"><span>Env: ' + escapeHtml('FIREBASE_SERVICE_ACCOUNT_B64') + '</span><b>' + (fb.env && fb.env.serviceAccountB64Set ? 'Set' : 'Not set') + '</b></div>' +
    '<div class="push-kv"><span>Env: ' + escapeHtml('FIREBASE_SERVICE_ACCOUNT_PATH') + '</span><b>' + (fb.env && fb.env.serviceAccountPathSet ? 'Set' : 'Not set') + '</b></div>';

  if (fb.configError) {
    html +=
      '<div class="tg-info" style="margin-top:10px;border-color:rgba(192,57,43,.4);background:rgba(192,57,43,.08)">' +
      '<i class="fas fa-triangle-exclamation" style="color:#e57368"></i>' +
      '<span style="color:#e57368">' + escapeHtml(fb.configError) + '</span></div>';
  }

  html += '<div class="admin-card-title" style="margin:18px 0 6px;font-size:.85rem">' +
    '<i class="fas fa-clock-rotate-left" style="color:var(--gold);margin-right:8px"></i>Last test push</div>';
  html += renderLastTest(status.lastTest);

  body.innerHTML = html;
}

function renderLastTest(lt) {
  if (!lt) return '<p style="color:#6b6b6b;font-size:.84rem">No test push has been run yet.</p>';
  const when = lt.runAt ? new Date(lt.runAt).toLocaleString() : '—';
  const mode = lt.mode === 'real' ? 'Real send' : 'Dry-run — nothing sent';
  let reason = '';
  if (lt.reason === 'firebase-unconfigured') {
    reason = 'Firebase is not configured yet. This run only projected who would receive a real push.';
  } else if (lt.reason === 'no-devices') {
    reason = 'No active devices matched the chosen target, so nothing was sent.';
  }
  return (
    '<div class="push-kv"><span>Mode</span><b>' + escapeHtml(mode) + '</b></div>' +
    '<div class="push-kv"><span>Ran at</span><b>' + escapeHtml(when) + '</b></div>' +
    '<div class="push-kv"><span>Recipients</span><b>' + (lt.recipients || 0) + '</b></div>' +
    '<div class="push-kv"><span>Devices</span><b>' + (lt.devices || 0) + '</b></div>' +
    '<div class="push-kv"><span>Delivered</span><b>' + (lt.sent || 0) + '</b></div>' +
    '<div class="push-kv"><span>Failed / invalid</span><b>' + (lt.failed || 0) + ' / ' + (lt.invalid || 0) + '</b></div>' +
    (reason ? '<p style="color:#C9A84C;font-size:.82rem;margin-top:8px">' + escapeHtml(reason) + '</p>' : '')
  );
}

async function submitPushTest() {
  if (PUSH.sending) return; // duplicate-submit protection
  hidePushResult();
  ['push-test-message-err', 'push-user-err', 'push-token-err'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });

  const title = (document.getElementById('push-test-title')?.value || '').trim();
  const message = (document.getElementById('push-test-message')?.value || '').trim();
  if (!message) {
    const err = document.getElementById('push-test-message-err');
    if (err) err.textContent = 'Message is required.';
    toast('Please enter a test message.', 'err');
    return;
  }
  if (message.length > 300) {
    const err = document.getElementById('push-test-message-err');
    if (err) err.textContent = 'Message must be 300 characters or fewer.';
    toast('Message is too long.', 'err');
    return;
  }

  const target = document.getElementById('push-test-target')?.value || 'all';
  const payload = { title, message };

  if (target === 'user') {
    if (!NOTIF.selectedUser) {
      const err = document.getElementById('push-user-err');
      if (err) err.textContent = 'Search and select the user you want to reach.';
      toast('Select a user first.', 'err');
      return;
    }
    payload.audience = 'user';
    payload.targetUserId = NOTIF.selectedUser.id;
  } else if (target === 'token') {
    const token = (document.getElementById('push-test-token')?.value || '').trim();
    if (!token) {
      const err = document.getElementById('push-token-err');
      if (err) err.textContent = 'Device token is required.';
      toast('Enter a device token.', 'err');
      return;
    }
    payload.token = token;
  } else if (target === 'role_customer' || target === 'role_sponsor' || target === 'role_admin') {
    payload.audience = 'role';
    payload.targetRole = target.replace('role_', '');
  } else {
    payload.audience = 'all';
  }

  PUSH.sending = true;
  const btn = document.getElementById('push-test-btn');
  if (btn) btn.classList.add('notif-sending');

  try {
    const data = await api('/admin/push/test', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showPushResult(data.result);
    toast((data.result && data.result.mode === 'real')
      ? 'Test push sent successfully.'
      : 'Dry-run complete — nothing was sent.');
    // Refresh status: an invalid token test may have deactivated a device.
    await loadPushStatus(false);
  } catch (err) {
    showPushResultError(err.message || 'Could not run the test push.');
    toast(err.message || 'Failed to run test push.', 'err');
  } finally {
    PUSH.sending = false;
    if (btn) btn.classList.remove('notif-sending');
  }
}

function showPushResult(r) {
  const el = document.getElementById('push-test-result');
  if (!el || !r) return;
  const mode = r.mode === 'real' ? 'Real send' : 'Dry-run — nothing sent';
  const rows =
    '<div class="push-kv"><span>Mode</span><b>' + escapeHtml(mode) + '</b></div>' +
    '<div class="push-kv"><span>Recipients</span><b>' + (r.recipients || 0) + '</b></div>' +
    '<div class="push-kv"><span>Devices</span><b>' + (r.devices || 0) + '</b></div>' +
    '<div class="push-kv"><span>Delivered</span><b>' + (r.sent || 0) + '</b></div>' +
    '<div class="push-kv"><span>Failed / invalid</span><b>' + (r.failed || 0) + ' / ' + (r.invalid || 0) + '</b></div>';

  let note = '';
  if (r.mode !== 'real') {
    note = (r.reason === 'firebase-unconfigured')
      ? '<p style="margin-top:8px;font-size:.82rem;color:#C9A84C">Firebase is not configured. Nothing was sent — this shows who would have been reached.</p>'
      : (r.reason === 'no-devices'
        ? '<p style="margin-top:8px;font-size:.82rem;color:#C9A84C">No active devices matched the chosen target.</p>'
        : '');
  }

  el.className = r.mode === 'real' ? 'ok' : 'notify';
  el.style.display = 'block';
  el.innerHTML = rows + note;
}

function showPushResultError(msg) {
  const el = document.getElementById('push-test-result');
  if (!el) return;
  el.className = 'err';
  el.style.display = 'block';
  el.textContent = msg;
}

function hidePushResult() {
  const el = document.getElementById('push-test-result');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

function resetPushComposer() {
  const f = document.getElementById('push-test-form');
  if (f) f.reset();
  const target = document.getElementById('push-test-target');
  if (target) target.value = 'all';
  NOTIF.selectedUser = null;
  const sel = document.getElementById('push-selected-user');
  if (sel) sel.style.display = 'none';
  closeUserResults();
  onPushTargetChange();
  hidePushResult();
}

/* ─── INIT ───────────────────────────────────────────────── */
async function initAdminPanel() {
  await Promise.all([loadCategoriesQuiet(), loadFiltersQuiet()]);
  if (!ADMIN.products || !ADMIN.products.length) {
    try { ADMIN.products = await api('/products'); } catch { ADMIN.products = []; }
  }
  showPage('dashboard');
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkAdminAuth();

  // Admin login form
  document.getElementById('al-form')?.addEventListener('submit', adminLogin);

  // Sidebar links
  document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.page));
  });

  // When sizes change, refresh the per-size stock inputs (if in count mode)
  document.querySelectorAll('.size-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (document.getElementById('p-stock-mode')?.value === 'count') renderSizeStockInputs();
    });
  });

  // Search in products
  document.getElementById('products-search')?.addEventListener('input', e => {
    renderProductsTable(e.target.value);
  });

  // Order status filter tabs
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderOrdersTable(tab.dataset.status || 'all', document.getElementById('orders-search')?.value || '');
      updateClearOrdersLabel();
    });
  });

  // Order search
  document.getElementById('orders-search')?.addEventListener('input', e => {
    const activeTab = document.querySelector('.status-tab.active');
    renderOrdersTable(activeTab?.dataset.status || 'all', e.target.value);
  });

  // Storage items search
  document.getElementById('storage-items-search')?.addEventListener('input', e => {
    renderStorageItemsTable(e.target.value);
  });

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  // Modal overlay clicks (but not the login overlay — that shouldn't be dismissible)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    if (overlay.id === 'admin-login-overlay') return;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Image upload listeners
  document.getElementById('cat-image-file')?.addEventListener('change', e => {
    handleImageUpload(e.target.files[0], 'cat-image-url', 'cat-img-preview', 'cat-upload-status');
  });
  document.getElementById('filter-image-file')?.addEventListener('change', e => {
    handleImageUpload(e.target.files[0], 'filter-image-url', 'filter-img-preview', 'filter-upload-status');
  });
  document.getElementById('color-image-file')?.addEventListener('change', async e => {
    if (!e.target.files[0]) return;
    document.getElementById('color-image-label').textContent = 'Uploading…';
    await handleImageUpload(e.target.files[0], 'color-image-url', null, null);
    document.getElementById('color-image-label').textContent =
      document.getElementById('color-image-url').value ? 'Image ✓' : 'Upload';
  });

  // Mobile sidebar toggle
  document.getElementById('mobile-sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('admin-sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-backdrop')?.classList.toggle('open');
  });
  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    document.getElementById('admin-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('open');
  });

  if (ok) initAdminPanel();
});
