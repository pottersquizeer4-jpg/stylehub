// ============================================
// SUPABASE INIT
// ============================================
const SUPABASE_URL = 'https://edehiyvudkxywgthctsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ECtBnc4abhU1vGoVJtISTg_S2_-wgHY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('🛍️ StyleHub started');

let allProducts = [];
let allCategories = [];
let cart = [];
let activeCategory = '';
let currentProduct = null;
let selectedSize = '';
let selectedColor = '';
let currentUser = null;
let authMode = 'signin';

// ============================================
// HELPERS
// ============================================
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function esc(s) {
  return s ? String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) : '';
}

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('en-US') + ' TZS';
}

// ============================================
// LOAD DATA
// ============================================
async function loadData() {
  try {
    const { data: cats } = await db.from('categories').select('*').order('name');
    allCategories = cats || [];
    renderCategories();

    const { data: prods, error } = await db.from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    allProducts = prods || [];
    renderProducts();
    console.log('✅ Loaded', allProducts.length, 'products');
  } catch (err) {
    console.error('Load error:', err);
    document.getElementById('productsGrid').innerHTML =
      '<div class="loading" style="color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Error: ' + esc(err.message) + '</div>';
  }
}

function renderCategories() {
  const f = document.getElementById('filters');
  f.innerHTML = '<button class="filter-btn active" data-cat="">All</button>' +
    allCategories.map(c => '<button class="filter-btn" data-cat="' + c.id + '">' + esc(c.name) + '</button>').join('');

  f.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      f.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      renderProducts();
    };
  });
}

// ============================================
// RENDER PRODUCTS
// ============================================
function renderProducts() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const minP = parseFloat(document.getElementById('minPrice').value) || 0;
  const maxP = parseFloat(document.getElementById('maxPrice').value) || Infinity;
  const sortBy = document.getElementById('sortBy').value;
  const minR = parseFloat(document.getElementById('minRating').value) || 0;
  const grid = document.getElementById('productsGrid');

  let list = allProducts.filter(p => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (activeCategory && String(p.category_id) !== activeCategory) return false;
    if (p.price < minP) return false;
    if (p.price > maxP) return false;
    if ((p.rating || 0) < minR) return false;
    return true;
  });

  if (sortBy === 'price-low') list.sort((a, b) => a.price - b.price);
  else if (sortBy === 'price-high') list.sort((a, b) => b.price - a.price);
  else if (sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('resultCount').textContent = list.length + ' products';

  if (list.length === 0) {
    grid.innerHTML = '<div class="loading"><i class="fas fa-search"></i> No products found</div>';
    return;
  }

  grid.innerHTML = list.map(p => `
    <div class="product-card" onclick="openProduct(${p.id})">
      ${p.is_featured ? '<span class="product-badge">Featured</span>' : ''}
      <img src="${esc(p.image_url || 'https://via.placeholder.com/400')}" alt="${esc(p.name)}" class="product-img" onerror="this.src='https://via.placeholder.com/400?text=No+Image'">
      <div class="product-info">
        <div class="product-name">${esc(p.name)}</div>
        <div class="product-desc">${esc(p.description || '')}</div>
        <div class="product-rating">
          ${'★'.repeat(Math.floor(p.rating || 0))}${'☆'.repeat(5 - Math.floor(p.rating || 0))}
          <span>${(p.rating || 0).toFixed(1)}</span>
        </div>
        <div class="product-footer">
          <div class="product-price">${fmtPrice(p.price)}</div>
          <button class="add-btn" onclick="event.stopPropagation(); addToCart(${p.id})" ${p.stock === 0 ? 'disabled' : ''} title="${p.stock === 0 ? 'Out of stock' : 'Add to cart'}">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('minPrice').value = '';
  document.getElementById('maxPrice').value = '';
  document.getElementById('sortBy').value = 'newest';
  document.getElementById('minRating').value = '0';
  document.getElementById('filters').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('filters').querySelector('[data-cat=""]').classList.add('active');
  activeCategory = '';
  renderProducts();
}

// ============================================
// PRODUCT DETAILS
// ============================================
function openProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;

  currentProduct = p;
  selectedSize = p.sizes && p.sizes[0] ? p.sizes[0] : '';
  selectedColor = p.colors && p.colors[0] ? p.colors[0] : '';

  const sizesHTML = (p.sizes || []).map(s =>
    `<button class="option-btn ${s === selectedSize ? 'active' : ''}" onclick="selectSize('${s}', this)">${esc(s)}</button>`
  ).join('');

  const colorsHTML = (p.colors || []).map(c =>
    `<button class="option-btn ${c === selectedColor ? 'active' : ''}" onclick="selectColor('${c}', this)">${esc(c)}</button>`
  ).join('');

  const stockClass = p.stock > 0 ? 'stock-in' : 'stock-out';
  const stockText = p.stock > 0 ? `✓ In Stock (${p.stock})` : '✗ Out of Stock';

  document.getElementById('productDetailContent').innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
      <button class="close-cart" onclick="closeProduct()" style="font-size:1.5rem; background:none; border:none; color:#94a3b8; cursor:pointer;">&times;</button>
    </div>
    <div class="product-detail">
      <img src="${esc(p.image_url || 'https://via.placeholder.com/500')}" alt="${esc(p.name)}" class="product-detail-img" onerror="this.src='https://via.placeholder.com/500?text=No+Image'">
      <div class="product-detail-info">
        <h2>${esc(p.name)}</h2>
        <div class="product-rating" style="font-size:1rem;">
          ${'★'.repeat(Math.floor(p.rating || 0))}${'☆'.repeat(5 - Math.floor(p.rating || 0))}
          <span>${(p.rating || 0).toFixed(1)}</span>
        </div>
        <div class="product-detail-price">${fmtPrice(p.price)}</div>
        <p class="product-detail-desc">${esc(p.description || 'No description available.')}</p>

        <div class="product-detail-section">
          <span class="stock-info ${stockClass}">${stockText}</span>
        </div>

        ${sizesHTML ? `
          <div class="product-detail-section">
            <h4>Select Size</h4>
            <div class="option-btns">${sizesHTML}</div>
          </div>
        ` : ''}

        ${colorsHTML ? `
          <div class="product-detail-section">
            <h4>Select Color</h4>
            <div class="option-btns">${colorsHTML}</div>
          </div>
        ` : ''}

        <button class="add-detail-btn" onclick="addFromDetail()" ${p.stock === 0 ? 'disabled' : ''}>
          <i class="fas fa-shopping-cart"></i> ${p.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('productModal').classList.add('show');
}

function selectSize(size, btn) {
  selectedSize = size;
  btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function selectColor(color, btn) {
  selectedColor = color;
  btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function addFromDetail() {
  if (!currentProduct) return;
  const p = currentProduct;
  const existing = cart.find(x => x.id === p.id);
  if (existing) {
    if (existing.qty >= p.stock) { toast('Not enough stock', 'error'); return; }
    existing.qty++;
  } else {
    cart.push({ id: p.id, name: p.name, price: p.price, image_url: p.image_url, qty: 1, size: selectedSize, color: selectedColor });
  }
  toast(p.name + ' added to cart', 'success');
  renderCart();
  closeProduct();
}

function closeProduct() {
  document.getElementById('productModal').classList.remove('show');
  currentProduct = null;
}

// ============================================
// CART
// ============================================
function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  if (p.stock === 0) { toast('Out of stock', 'error'); return; }

  const existing = cart.find(x => x.id === productId);
  if (existing) {
    if (existing.qty >= p.stock) { toast('Not enough stock', 'error'); return; }
    existing.qty++;
  } else {
    cart.push({ id: p.id, name: p.name, price: p.price, image_url: p.image_url, qty: 1 });
  }
  toast(p.name + ' added to cart', 'success');
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(x => x.id !== id);
  renderCart();
}

function updateQty(id, delta) {
  const item = cart.find(x => x.id === id);
  if (!item) return;
  const p = allProducts.find(x => x.id === id);
  const newQty = item.qty + delta;
  if (newQty <= 0) { removeFromCart(id); return; }
  if (p && newQty > p.stock) { toast('Not enough stock', 'error'); return; }
  item.qty = newQty;
  renderCart();
}

function renderCart() {
  const items = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const count = document.getElementById('cartCount');

  const totalQty = cart.reduce((s, x) => s + x.qty, 0);
  count.textContent = totalQty;

  if (cart.length === 0) {
    items.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Your cart is empty</p></div>';
    footer.style.display = 'none';
    return;
  }

  items.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${esc(item.image_url || 'https://via.placeholder.com/100')}" alt="${esc(item.name)}" onerror="this.src='https://via.placeholder.com/100'">
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(item.name)}</div>
        ${item.size ? '<div style="font-size:0.75rem;color:#a3a3a3;">Size: ' + esc(item.size) + (item.color ? ' · ' + esc(item.color) : '') + '</div>' : ''}
        <div class="cart-item-price">${fmtPrice(item.price)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
          <span style="font-weight:700;">${item.qty}</span>
          <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
          <button class="qty-btn" onclick="removeFromCart(${item.id})" style="margin-left:0.5rem;background:#fee2e2;color:#dc2626;"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `).join('');

  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
  document.getElementById('cartTotal').textContent = fmtPrice(total);
  footer.style.display = 'block';
}

function toggleCart() {
  document.getElementById('cartSidebar').classList.toggle('show');
  document.getElementById('cartOverlay').classList.toggle('show');
}

// ============================================
// CHECKOUT
// ============================================
function openCheckout() {
  if (cart.length === 0) { toast('Cart is empty', 'error'); return; }
  if (currentUser) {
    document.getElementById('c_email').value = currentUser.email;
  }
  document.getElementById('checkoutModal').classList.add('show');
}

function closeCheckout() {
  document.getElementById('checkoutModal').classList.remove('show');
}

async function placeOrder() {
  const name = document.getElementById('c_name').value.trim();
  const email = document.getElementById('c_email').value.trim();
  const phone = document.getElementById('c_phone').value.trim();
  const address = document.getElementById('c_address').value.trim();

  if (!name || !email || !phone || !address) {
    toast('Please fill all fields', 'error');
    return;
  }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing order...';

  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);

  try {
    const orderPayload = {
      customer_name: name, customer_email: email, customer_phone: phone,
      shipping_address: address, total_amount: total, status: 'pending'
    };
    if (currentUser) orderPayload.user_id = currentUser.id;

    const { data: orderData, error: orderErr } = await db.from('orders').insert([orderPayload]).select();
    if (orderErr) throw orderErr;
    const orderId = orderData[0].id;

    const items = cart.map(x => ({
      order_id: orderId, product_id: x.id, product_name: x.name,
      quantity: x.qty, price: x.price, size: x.size || null, color: x.color || null
    }));

    const { error: itemsErr } = await db.from('order_items').insert(items);
    if (itemsErr) throw itemsErr;

    toast('✅ Order placed! Order #' + orderId, 'success');
    cart = [];
    renderCart();
    closeCheckout();
    toggleCart();
    document.getElementById('c_name').value = '';
    document.getElementById('c_email').value = '';
    document.getElementById('c_phone').value = '';
    document.getElementById('c_address').value = '';
  } catch (err) {
    console.error('Order error:', err);
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Place Order';
  }
}

// ============================================
// USER AUTHENTICATION
// ============================================
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  currentUser = session ? session.user : null;
  updateUserUI();

  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    updateUserUI();
  });
}

function updateUserUI() {
  const icon = document.getElementById('userIcon');
  const label = document.getElementById('userLabel');
  const email = document.getElementById('userMenuEmail');
  if (currentUser) {
    icon.className = 'fas fa-user-check';
    label.textContent = currentUser.email.split('@')[0];
    email.textContent = currentUser.email;
  } else {
    icon.className = 'fas fa-user';
    label.textContent = 'Sign In';
    email.textContent = '';
  }
}

function handleUserClick() {
  if (currentUser) {
    document.getElementById('userMenu').classList.toggle('show');
  } else {
    openAuth();
  }
}

function openAuth() {
  document.getElementById('authModal').classList.add('show');
  switchAuthTab('signin');
}

function closeAuth() {
  document.getElementById('authModal').classList.remove('show');
  document.getElementById('a_name').value = '';
  document.getElementById('a_email').value = '';
  document.getElementById('a_password').value = '';
}

function switchAuthTab(mode) {
  authMode = mode;
  const isSignIn = mode === 'signin';
  document.getElementById('tabSignIn').classList.toggle('active', isSignIn);
  document.getElementById('tabSignUp').classList.toggle('active', !isSignIn);
  document.getElementById('signupFields').style.display = isSignIn ? 'none' : 'block';
  document.getElementById('authTitle').textContent = isSignIn ? 'Welcome Back' : 'Create Account';
  document.getElementById('authSub').textContent = isSignIn ? 'Sign in to your StyleHub account' : 'Join StyleHub and start shopping';
  document.getElementById('authSubmitBtn').textContent = isSignIn ? 'Sign In' : 'Create Account';
}

async function submitAuth() {
  const email = document.getElementById('a_email').value.trim();
  const password = document.getElementById('a_password').value;
  const name = document.getElementById('a_name').value.trim();

  if (!email || !password) { toast('Fill email and password', 'error'); return; }
  if (password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  if (authMode === 'signup' && !name) { toast('Enter your full name', 'error'); return; }

  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait...';

  try {
    if (authMode === 'signup') {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        await db.from('user_profiles').insert([{ id: data.user.id, full_name: name }]);
      }
      toast('Account created! Welcome!', 'success');
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast('Welcome back!', 'success');
    }
    closeAuth();
  } catch (err) {
    console.error('Auth error:', err);
    let msg = err.message;
    if (msg.includes('Invalid login')) msg = 'Invalid email or password';
    if (msg.includes('already registered')) msg = 'Email already registered';
    toast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
  }
}

async function signOut() {
  if (!confirm('Sign out?')) return;
  await db.auth.signOut();
  document.getElementById('userMenu').classList.remove('show');
  toast('Signed out', 'info');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  const btn = document.getElementById('userBtn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('show');
  }
});

// ============================================
// MY ORDERS
// ============================================
async function openMyOrders() {
  document.getElementById('userMenu').classList.remove('show');
  document.getElementById('ordersModal').classList.add('show');
  const content = document.getElementById('ordersContent');
  content.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading orders...</div>';

  try {
    const { data: orders, error } = await db
      .from('orders')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      content.innerHTML = '<div style="text-align:center;padding:3rem;color:#a3a3a3;"><i class="fas fa-box-open" style="font-size:3rem;margin-bottom:1rem;"></i><p>You have no orders yet</p></div>';
      return;
    }

    content.innerHTML = orders.map(o => `
      <div style="background:#f7f7f5; border-radius:12px; padding:1rem; margin-bottom:1rem; border:1px solid #e5e5e3;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
          <strong>Order #${o.id}</strong>
          <span style="background:#fef3c7; color:#92400e; padding:0.25rem 0.6rem; border-radius:20px; font-size:0.7rem; font-weight:700; text-transform:uppercase;">${o.status}</span>
        </div>
        <div style="font-size:0.85rem; color:#525252; margin-bottom:0.4rem;">
          <div><i class="fas fa-calendar"></i> ${new Date(o.created_at).toLocaleString('en-GB')}</div>
          <div><i class="fas fa-map-marker-alt"></i> ${esc(o.shipping_address)}</div>
        </div>
        <div style="font-size:1.1rem; font-weight:800; color:#c9a227; text-align:right;">${fmtPrice(o.total_amount)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</div>';
  }
}

function closeMyOrders() {
  document.getElementById('ordersModal').classList.remove('show');
}

// ============================================
// INIT
// ============================================
initAuth();
loadData();