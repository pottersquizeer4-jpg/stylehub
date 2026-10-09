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
let wishlist = [];
let activeCategory = '';
let currentProduct = null;
let selectedSize = '';
let selectedColor = '';
let currentUser = null;
let authMode = 'signin';
let isAdmin = false;
let selectedRating = 5;

// AWAMU 2: Coupon + Shipping state
let appliedCoupon = null;
let shippingZones = [];
let selectedShipping = null;

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

function closeM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
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
      <button class="product-wishlist-btn ${wishlist.includes(p.id) ? 'active' : ''}" 
        onclick="event.stopPropagation(); toggleWishlist(${p.id})" 
        title="Wishlist">
        <i class="fas fa-heart"></i>
      </button>
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
// AWAMU 1: SEARCH AUTOCOMPLETE
// ============================================
function handleSearchInput() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const box = document.getElementById('searchSuggestions');
  if (!box) return;
  
  if (query.length < 2) {
    box.classList.remove('show');
    renderProducts();
    return;
  }
  
  const matches = allProducts
    .filter(p => p.name.toLowerCase().includes(query))
    .slice(0, 8);
  
  if (matches.length === 0) {
    box.innerHTML = '<div class="suggestion-empty"><i class="fas fa-search"></i> Hakuna bidhaa iliyopatikana</div>';
  } else {
    box.innerHTML = matches.map(p => `
      <div class="suggestion-item" onclick="selectSuggestion(${p.id})">
        <img src="${esc(p.image_url || 'https://via.placeholder.com/44')}" onerror="this.src='https://via.placeholder.com/44'">
        <div class="suggestion-info">
          <div class="suggestion-name">${esc(p.name)}</div>
          <div class="suggestion-price">${fmtPrice(p.price)}</div>
        </div>
      </div>
    `).join('');
  }
  box.classList.add('show');
  renderProducts();
}

function selectSuggestion(productId) {
  document.getElementById('searchSuggestions').classList.remove('show');
  document.getElementById('searchInput').value = '';
  renderProducts();
  openProduct(productId);
}

document.addEventListener('click', (e) => {
  const box = document.getElementById('searchSuggestions');
  const searchBar = document.querySelector('.search-bar');
  if (box && searchBar && !searchBar.contains(e.target)) {
    box.classList.remove('show');
  }
});

// ============================================
// AWAMU 1: WISHLIST
// ============================================
async function loadWishlist() {
  if (!currentUser) { wishlist = []; updateWishlistCount(); return; }
  const { data } = await db.from('wishlists').select('product_id').eq('user_id', currentUser.id);
  wishlist = (data || []).map(w => w.product_id);
  updateWishlistCount();
  renderProducts();
}

function updateWishlistCount() {
  const el = document.getElementById('wishlistCount');
  if (el) el.textContent = wishlist.length;
}

async function toggleWishlist(productId) {
  if (!currentUser) {
    toast('Sign in ili kuweka wishlist', 'error');
    openAuth();
    return;
  }
  
  const isWishlisted = wishlist.includes(productId);
  
  try {
    if (isWishlisted) {
      await db.from('wishlists').delete().eq('user_id', currentUser.id).eq('product_id', productId);
      wishlist = wishlist.filter(id => id !== productId);
      toast('Imetolewa kwenye wishlist', 'info');
    } else {
      await db.from('wishlists').insert([{ user_id: currentUser.id, product_id: productId }]);
      wishlist.push(productId);
      toast('❤️ Imeongezwa kwenye wishlist', 'success');
    }
    updateWishlistCount();
    renderProducts();
    const detailBtn = document.getElementById('detailWishlistBtn');
    if (detailBtn && currentProduct && currentProduct.id === productId) {
      const nowWishlisted = wishlist.includes(productId);
      detailBtn.classList.toggle('active', nowWishlisted);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openWishlist() {
  if (!currentUser) {
    toast('Sign in ili kuona wishlist', 'error');
    openAuth();
    return;
  }
  
  const userMenu = document.getElementById('userMenu');
  if (userMenu) userMenu.classList.remove('show');
  
  document.getElementById('wishlistModal').classList.add('show');
  const content = document.getElementById('wishlistContent');
  content.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading wishlist...</div>';
  
  await loadWishlist();
  
  if (wishlist.length === 0) {
    content.innerHTML = `
      <div style="text-align:center; padding:3rem; color:var(--gray-400);">
        <i class="fas fa-heart-broken" style="font-size:3rem; margin-bottom:1rem;"></i>
        <p>Wishlist yako ni tupu</p>
        <p style="font-size:0.85rem; margin-top:0.5rem;">Bonyeza ❤️ kwenye bidhaa kuongeza</p>
      </div>
    `;
    return;
  }
  
  const items = allProducts.filter(p => wishlist.includes(p.id));
  
  content.innerHTML = items.map(p => `
    <div style="display:flex; gap:1rem; padding:1rem; border-bottom:1px solid var(--gray-100); align-items:center;">
      <img src="${esc(p.image_url || 'https://via.placeholder.com/80')}" style="width:80px; height:80px; object-fit:cover; border-radius:10px; cursor:pointer;" onclick="closeM('wishlistModal'); openProduct(${p.id})" onerror="this.src='https://via.placeholder.com/80'">
      <div style="flex:1;">
        <div style="font-weight:700; cursor:pointer;" onclick="closeM('wishlistModal'); openProduct(${p.id})">${esc(p.name)}</div>
        <div style="color:var(--primary); font-weight:800; margin-top:0.25rem;">${fmtPrice(p.price)}</div>
        <div style="font-size:0.75rem; color:var(--gray-400); margin-top:0.25rem;">${p.stock > 0 ? '✓ In stock' : '✗ Out of stock'}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <button onclick="addToCart(${p.id})" style="background:var(--secondary); color:white; border:none; padding:0.5rem 0.9rem; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.8rem;" ${p.stock === 0 ? 'disabled' : ''}>
          <i class="fas fa-cart-plus"></i> Add
        </button>
        <button onclick="toggleWishlist(${p.id}); setTimeout(openWishlist, 200);" style="background:#fee2e2; color:#dc2626; border:none; padding:0.5rem 0.9rem; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.8rem;">
          <i class="fas fa-trash"></i> Remove
        </button>
      </div>
    </div>
  `).join('');
}

// ============================================
// AWAMU 1: DARK MODE
// ============================================
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('darkMode', isDark ? '1' : '0');
  
  const icon = document.querySelector('#darkToggle i');
  if (icon) {
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  }
}

function loadDarkMode() {
  const isDark = localStorage.getItem('darkMode') === '1';
  if (isDark) {
    document.body.classList.add('dark');
    const icon = document.querySelector('#darkToggle i');
    if (icon) icon.className = 'fas fa-sun';
  }
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
  selectedRating = 5;

  const sizesHTML = (p.sizes || []).map(s =>
    `<button class="option-btn ${s === selectedSize ? 'active' : ''}" onclick="selectSize('${s}', this)">${esc(s)}</button>`
  ).join('');

  const colorsHTML = (p.colors || []).map(c =>
    `<button class="option-btn ${c === selectedColor ? 'active' : ''}" onclick="selectColor('${c}', this)">${esc(c)}</button>`
  ).join('');

  const stockClass = p.stock > 0 ? 'stock-in' : 'stock-out';
  const stockText = p.stock > 0 ? `✓ In Stock (${p.stock})` : '✗ Out of Stock';
  const isWishlisted = wishlist.includes(p.id);

  document.getElementById('productDetailContent').innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
      <button class="close-cart" onclick="closeProduct()" style="font-size:1.5rem; background:none; border:none; color:#94a3b8; cursor:pointer;">&times;</button>
    </div>
    <div class="product-detail">
      <img src="${esc(p.image_url || 'https://via.placeholder.com/500')}" alt="${esc(p.name)}" class="product-detail-img" onerror="this.src='https://via.placeholder.com/500?text=No+Image'">
      <div class="product-detail-info">
        <button class="product-wishlist-btn ${isWishlisted ? 'active' : ''}" 
          id="detailWishlistBtn"
          onclick="toggleWishlist(${p.id})" 
          style="position:relative; top:auto; right:auto; margin-bottom:1rem; float:right;"
          title="Wishlist">
          <i class="fas fa-heart"></i>
        </button>
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

        <div class="reviews-section" id="reviewsSection">
          <div class="loading"><i class="fas fa-spinner"></i> Loading reviews...</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('productModal').classList.add('show');
  loadReviews(p.id);
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
// REVIEWS
// ============================================
async function loadReviews(productId) {
  const section = document.getElementById('reviewsSection');
  if (!section) return;

  section.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading reviews...</div>';

  try {
    const { data: reviews } = await db
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    const avgRating = reviews && reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : '0.0';

    const reviewsList = reviews && reviews.length > 0
      ? reviews.map(r => `
          <div class="review-item">
            <div class="review-top">
              <span class="review-user">${esc(r.user_name)}</span>
              <span class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
            </div>
            <div class="review-comment">${esc(r.comment || '')}</div>
            <div class="review-date">${new Date(r.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</div>
          </div>
        `).join('')
      : '<p style="color:#a3a3a3; font-size:0.9rem; padding:1rem 0;">No reviews yet. Be the first to review!</p>';

    const reviewForm = currentUser
      ? `
          <div class="review-form">
            <div class="star-selector" id="starSelector">
              <span data-star="1" class="active">★</span>
              <span data-star="2" class="active">★</span>
              <span data-star="3" class="active">★</span>
              <span data-star="4" class="active">★</span>
              <span data-star="5" class="active">★</span>
            </div>
            <textarea id="reviewComment" placeholder="Share your experience with this product..."></textarea>
            <div class="review-form-actions">
              <button class="add-review-btn" onclick="submitReview(${productId})">
                <i class="fas fa-paper-plane"></i> Submit Review
              </button>
            </div>
          </div>
        `
      : '<p style="color:#a3a3a3; font-size:0.85rem; text-align:center; padding:1rem; background:#f7f7f5; border-radius:8px;">Sign in to write a review</p>';

    section.innerHTML = `
      <div class="reviews-header">
        <h4>⭐ Reviews (${reviews ? reviews.length : 0})</h4>
        <span style="font-weight:700; color:var(--primary);">${avgRating} / 5</span>
      </div>
      ${reviewForm}
      <div style="margin-top:1.5rem;">${reviewsList}</div>
    `;

    const starSelector = document.getElementById('starSelector');
    if (starSelector) {
      starSelector.querySelectorAll('span').forEach(star => {
        star.onclick = () => {
          selectedRating = parseInt(star.dataset.star);
          starSelector.querySelectorAll('span').forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.star) <= selectedRating);
          });
        };
      });
    }
  } catch (err) {
    console.error('Reviews error:', err);
    section.innerHTML = '<p style="color:#ef4444;">Error loading reviews</p>';
  }
}

async function submitReview(productId) {
  if (!currentUser) { toast('Sign in to review', 'error'); return; }

  const comment = document.getElementById('reviewComment').value.trim();
  if (!comment) { toast('Write your review first', 'error'); return; }

  const userName = currentUser.email.split('@')[0];

  try {
    const { error } = await db.from('reviews').insert([{
      product_id: productId,
      user_id: currentUser.id,
      user_name: userName,
      rating: selectedRating,
      comment: comment
    }]);

    if (error) throw error;

    toast('✅ Review submitted! Thanks!', 'success');
    loadReviews(productId);
  } catch (err) {
    toast(err.message, 'error');
  }
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
  
  // AWAMU 2: Update breakdown kama checkout modal ipo wazi
  const checkoutModal = document.getElementById('checkoutModal');
  if (checkoutModal && checkoutModal.classList.contains('show')) {
    updatePriceBreakdown();
  }
}

function toggleCart() {
  document.getElementById('cartSidebar').classList.toggle('show');
  document.getElementById('cartOverlay').classList.toggle('show');
}

// ============================================
// AWAMU 2: SHIPPING ZONES
// ============================================
async function loadShippingZones() {
  try {
    const { data, error } = await db
      .from('shipping_zones')
      .select('*')
      .eq('is_active', true)
      .order('fee');
    if (error) throw error;
    shippingZones = data || [];
    const select = document.getElementById('c_shipping');
    if (select) {
      select.innerHTML = '<option value="">— Select region —</option>' +
        shippingZones.map(z => `<option value="${z.id}">${esc(z.name)} (${z.fee.toLocaleString()} TZS · ${esc(z.eta_days || '')})</option>`).join('');
    }
    console.log('✅ Loaded', shippingZones.length, 'shipping zones');
  } catch (err) {
    console.error('Load shipping error:', err);
  }
}

function updateShippingZone() {
  const select = document.getElementById('c_shipping');
  if (!select) return;
  const zoneId = select.value;
  selectedShipping = shippingZones.find(z => String(z.id) === String(zoneId)) || null;
  updatePriceBreakdown();
}

// ============================================
// AWAMU 2: COUPONS
// ============================================
async function applyCoupon() {
  const input = document.getElementById('couponInput');
  const btn = document.getElementById('couponApplyBtn');
  const code = input.value.trim().toUpperCase();
  
  if (!code) { toast('Weka coupon code', 'error'); return; }
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  
  try {
    const { data, error } = await db
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();
    
    if (error || !data) throw new Error('Coupon haipo au imeisha');
    
    // Check expiry
    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      throw new Error('Coupon imeisha muda wake');
    }
    
    // Check max uses
    if (data.max_uses && data.used_count >= data.max_uses) {
      throw new Error('Coupon imetumika mara zote');
    }
    
    // Check min order
    const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
    if (data.min_order && subtotal < data.min_order) {
      throw new Error(`Coupon inahitaji order ya angalau ${data.min_order.toLocaleString()} TZS`);
    }
    
    // Success
    appliedCoupon = {
      code: data.code,
      type: data.discount_type,
      value: parseFloat(data.discount_value),
      description: data.description || '',
      minOrder: data.min_order
    };
    
    // Show success UI
    const box = document.getElementById('couponBox');
    box.classList.add('coupon-applied');
    document.getElementById('couponInputRow').style.display = 'none';
    document.getElementById('couponSuccess').style.display = 'block';
    document.getElementById('couponSuccess').innerHTML = `
      <div class="coupon-success">
        <div>
          <div class="coupon-success-code">🎟️ ${esc(appliedCoupon.code)}</div>
          <div class="coupon-success-desc">${esc(appliedCoupon.description)}</div>
        </div>
        <button class="coupon-remove-btn" onclick="removeCoupon()" title="Remove">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    toast('✅ Coupon imetumika!', 'success');
    updatePriceBreakdown();
    
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apply';
  }
}

function removeCoupon() {
  appliedCoupon = null;
  const box = document.getElementById('couponBox');
  box.classList.remove('coupon-applied');
  document.getElementById('couponInputRow').style.display = 'flex';
  document.getElementById('couponSuccess').style.display = 'none';
  document.getElementById('couponInput').value = '';
  updatePriceBreakdown();
  toast('Coupon imeondolewa', 'info');
}

function calculateDiscount(subtotal) {
  if (!appliedCoupon) return 0;
  if (appliedCoupon.type === 'percent') {
    return Math.round(subtotal * (appliedCoupon.value / 100));
  }
  return Math.min(appliedCoupon.value, subtotal);
}

function calculateShipping(subtotalAfterDiscount) {
  if (!selectedShipping) return 0;
  if (selectedShipping.free_above && subtotalAfterDiscount >= selectedShipping.free_above) {
    return 0;
  }
  return parseFloat(selectedShipping.fee) || 0;
}

function updatePriceBreakdown() {
  const el = document.getElementById('pbSubtotal');
  if (!el) return;
  
  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const discount = calculateDiscount(subtotal);
  const subtotalAfterDiscount = subtotal - discount;
  const shipping = calculateShipping(subtotalAfterDiscount);
  const total = subtotalAfterDiscount + shipping;
  
  document.getElementById('pbSubtotal').textContent = fmtPrice(subtotal);
  
  // Discount row
  const discountRow = document.getElementById('pbDiscountRow');
  if (discount > 0) {
    discountRow.style.display = 'flex';
    let label = 'Discount';
    if (appliedCoupon) {
      if (appliedCoupon.type === 'percent') {
        label = `Discount (${appliedCoupon.value}%)`;
      } else {
        label = 'Discount';
      }
    }
    document.getElementById('pbDiscountLabel').textContent = label;
    document.getElementById('pbDiscount').textContent = '-' + fmtPrice(discount);
  } else {
    discountRow.style.display = 'none';
  }
  
  // Shipping row
  const shippingRow = document.getElementById('pbShippingRow');
  if (shippingRow) {
    shippingRow.style.display = 'flex';
    if (selectedShipping) {
      if (shipping === 0) {
        document.getElementById('pbShipping').textContent = 'FREE 🎉';
      } else {
        document.getElementById('pbShipping').textContent = fmtPrice(shipping);
      }
    } else {
      document.getElementById('pbShipping').textContent = '—';
    }
  }
  
  // Total
  document.getElementById('pbTotal').textContent = fmtPrice(total);
}

// ============================================
// CHECKOUT
// ============================================
function openCheckout() {
  if (cart.length === 0) { toast('Cart is empty', 'error'); return; }
  if (currentUser) {
    document.getElementById('c_email').value = currentUser.email;
  }
  
  // AWAMU 2: Reset coupon + shipping
  loadShippingZones();
  appliedCoupon = null;
  selectedShipping = null;
  const box = document.getElementById('couponBox');
  if (box) {
    box.classList.remove('coupon-applied');
    document.getElementById('couponInputRow').style.display = 'flex';
    document.getElementById('couponSuccess').style.display = 'none';
    document.getElementById('couponInput').value = '';
  }
  const shipSelect = document.getElementById('c_shipping');
  if (shipSelect) shipSelect.value = '';
  setTimeout(updatePriceBreakdown, 100);
  
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

  // AWAMU 2: Check shipping zone
  if (!selectedShipping) {
    toast('Chagua shipping zone kwanza', 'error');
    return;
  }

  const paymentRadios = document.querySelectorAll('input[name="payment"]');
  const paymentMethod = paymentRadios.length > 0 
    ? document.querySelector('input[name="payment"]:checked').value 
    : 'cod';

  if (paymentMethod === 'mpesa') {
    toast('M-Pesa inakuja hivi karibuni! Tumia Cash on Delivery kwa sasa.', 'info');
    return;
  }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing order...';

  // AWAMU 2: Hesabu subtotal, discount, shipping, total
  const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const discount = calculateDiscount(subtotal);
  const subtotalAfterDiscount = subtotal - discount;
  const shipping = calculateShipping(subtotalAfterDiscount);
  const total = subtotalAfterDiscount + shipping;

  try {
    const orderPayload = {
      customer_name: name, customer_email: email, customer_phone: phone,
      shipping_address: address, total_amount: total, status: 'pending',
      payment_method: paymentMethod,
      coupon_code: appliedCoupon ? appliedCoupon.code : null,
      discount_amount: discount,
      shipping_fee: shipping,
      shipping_zone: selectedShipping.name
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

    if (!currentUser) {
      window.pendingEmail = email;
      window.pendingName = name;
      setTimeout(() => {
        document.getElementById('accountSuggestionModal').classList.add('show');
      }, 500);
    }

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
// CREATE ACCOUNT FROM ORDER MODAL
// ============================================
function createAccountFromOrder() {
  document.getElementById('accountSuggestionModal').classList.remove('show');
  openAuth();
  switchAuthTab('signup');
  
  setTimeout(() => {
    if (window.pendingEmail) {
      document.getElementById('a_email').value = window.pendingEmail;
      window.pendingEmail = null;
    }
    if (window.pendingName) {
      document.getElementById('a_name').value = window.pendingName;
      window.pendingName = null;
    }
  }, 200);
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
    checkAdminRole();
    loadWishlist();
  } else {
    icon.className = 'fas fa-user';
    label.textContent = 'Sign In';
    email.textContent = '';
    wishlist = [];
    updateWishlistCount();
    renderProducts();
    const adminBtn = document.getElementById('adminMenuBtn');
    if (adminBtn) adminBtn.style.display = 'none';
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
      const { error } = await db.signInWithPassword({ email, password });
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
// AWAMU 1: PASSWORD RESET
// ============================================
function handleForgotPassword() {
  const emailInput = document.getElementById('a_email').value.trim();
  closeAuth();
  document.getElementById('resetPasswordModal').classList.add('show');
  if (emailInput) {
    document.getElementById('reset_email').value = emailInput;
  }
}

async function sendPasswordReset() {
  const email = document.getElementById('reset_email').value.trim();
  if (!email) { toast('Weka email yako', 'error'); return; }
  
  const btn = document.getElementById('resetPasswordBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  
  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    toast('✅ Link imetumwa! Angalia email yako.', 'success');
    closeM('resetPasswordModal');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
  }
}

// ============================================
// AWAMU 1: ORDER TRACKING TIMELINE
// ============================================
function getOrderTimeline(status) {
  const steps = [
    { key: 'pending', label: 'Pending', icon: 'fa-clock' },
    { key: 'paid', label: 'Paid', icon: 'fa-check' },
    { key: 'shipped', label: 'Shipped', icon: 'fa-truck' },
    { key: 'delivered', label: 'Delivered', icon: 'fa-home' }
  ];
  
  if (status === 'cancelled') {
    return steps.map(s => ({ ...s, status: 'cancelled' }));
  }
  
  const currentIndex = steps.findIndex(s => s.key === status);
  return steps.map((s, i) => ({
    ...s,
    status: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending'
  }));
}

// ============================================
// MY ORDERS (Na Timeline)
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

    content.innerHTML = orders.map(o => {
      const timeline = getOrderTimeline(o.status);
      return `
        <div style="background:var(--gray-100); border-radius:12px; padding:1rem; margin-bottom:1rem; border:1px solid var(--gray-200);">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
            <strong>Order #${o.id}</strong>
            <span class="status-${o.status}" style="padding:0.25rem 0.6rem; border-radius:20px; font-size:0.7rem; font-weight:700; text-transform:uppercase;">${o.status}</span>
          </div>
          <div style="font-size:0.85rem; color:var(--gray-600); margin-bottom:0.75rem;">
            <div><i class="fas fa-calendar"></i> ${new Date(o.created_at).toLocaleString('en-GB')}</div>
            <div><i class="fas fa-map-marker-alt"></i> ${esc(o.shipping_address)}</div>
          </div>
          ${o.status !== 'cancelled' ? `
            <div class="order-timeline">
              ${timeline.map(step => `
                <div class="timeline-step ${step.status}">
                  <div class="timeline-icon"><i class="fas ${step.icon}"></i></div>
                  <div class="timeline-label">${step.label}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="font-size:1.1rem; font-weight:800; color:var(--primary); text-align:right; margin-top:0.5rem;">${fmtPrice(o.total_amount)}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</div>';
  }
}

function closeMyOrders() {
  document.getElementById('ordersModal').classList.remove('show');
}

// ============================================
// ADMIN PANEL
// ============================================
async function checkAdminRole() {
  if (!currentUser) { isAdmin = false; return; }
  const { data, error } = await db.from('user_profiles').select('role').eq('id', currentUser.id).single();
  console.log('🔍 Admin check:', data, error);
  isAdmin = data && data.role === 'admin';
  console.log('🔍 isAdmin:', isAdmin);
  const adminBtn = document.getElementById('adminMenuBtn');
  if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
}

function openAdmin() {
  document.getElementById('userMenu').classList.remove('show');
  document.getElementById('page-admin').style.display = 'block';
  const productsContainer = document.getElementById('products');
  if (productsContainer) productsContainer.style.display = 'none';
  const hero = document.querySelector('.hero');
  if (hero) hero.style.display = 'none';
  loadAdminData();
  window.scrollTo(0, 0);
}

function closeAdmin() {
  document.getElementById('page-admin').style.display = 'none';
  const productsContainer = document.getElementById('products');
  if (productsContainer) productsContainer.style.display = 'block';
  const hero = document.querySelector('.hero');
  if (hero) hero.style.display = 'block';
}

function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('admin-' + tab).classList.add('active');
  if (tab === 'orders') loadAdminOrders();
  else if (tab === 'analytics') loadAnalytics();
  else loadAdminProducts();
}

async function loadAdminData() {
  await Promise.all([loadAdminProducts(), loadAdminOrders()]);
}

async function loadAdminProducts() {
  const tbody = document.getElementById('adminProductsTable');
  try {
    const { data } = await db.from('products').select('*').order('created_at', { ascending: false });
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#a3a3a3;">No products</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(p => `
      <tr>
        <td><img src="${esc(p.image_url || 'https://via.placeholder.com/40')}" onerror="this.src='https://via.placeholder.com/40'"></td>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${fmtPrice(p.price)}</td>
        <td>${p.stock}</td>
        <td>${(p.rating || 0).toFixed(1)} ⭐</td>
        <td>
          <button onclick="editAdminProduct(${p.id})" style="background:#3b82f6;color:white;border:none;padding:0.35rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-right:0.3rem;"><i class="fas fa-pen"></i></button>
          <button onclick="deleteAdminProduct(${p.id})" style="background:#ef4444;color:white;border:none;padding:0.35rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</td></tr>';
  }
}

async function loadAdminOrders() {
  const tbody = document.getElementById('adminOrdersTable');
  try {
    const { data } = await db.from('orders').select('*').order('created_at', { ascending: false });
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#a3a3a3;">No orders</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(o => `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>${esc(o.customer_name)}<br><span style="color:#a3a3a3;font-size:0.75rem;">${esc(o.customer_email)}</span></td>
        <td>${new Date(o.created_at).toLocaleDateString('en-GB')}</td>
        <td><strong>${fmtPrice(o.total_amount)}</strong><br><span style="font-size:0.7rem; color:#a3a3a3;">${o.payment_method === 'cod' ? '💵 COD' : '📱 M-Pesa'}</span></td>
        <td>
          <select onchange="updateOrderStatus(${o.id}, this.value)" style="padding:0.3rem; border-radius:6px; border:1.5px solid #e5e5e3; font-family:inherit; font-size:0.75rem; font-weight:700;">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>PENDING</option>
            <option value="paid" ${o.status === 'paid' ? 'selected' : ''}>PAID</option>
            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>SHIPPED</option>
            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>DELIVERED</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>CANCELLED</option>
          </select>
        </td>
        <td>
          <button onclick="viewOrderItems(${o.id})" style="background:#3b82f6;color:white;border:none;padding:0.35rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-eye"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</td></tr>';
  }
}

// ============================================
// ANALYTICS
// ============================================
async function loadAnalytics() {
  const content = document.getElementById('analyticsContent');
  if (!content) return;

  content.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading analytics...</div>';

  try {
    const { data: orders } = await db.from('orders').select('*');
    const { data: products } = await db.from('products').select('*');
    const { data: orderItems } = await db.from('order_items').select('*');
    const { data: users } = await db.from('user_profiles').select('*');

    const totalOrders = orders ? orders.length : 0;
    const totalRevenue = orders ? orders.reduce((s, o) => s + (o.total_amount || 0), 0) : 0;
    const pendingOrders = orders ? orders.filter(o => o.status === 'pending').length : 0;
    const paidOrders = orders ? orders.filter(o => o.status === 'paid').length : 0;
    const totalProducts = products ? products.length : 0;
    const totalUsers = users ? users.length : 0;
    const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const productSales = {};
    (orderItems || []).forEach(item => {
      if (!productSales[item.product_name]) productSales[item.product_name] = { qty: 0, revenue: 0 };
      productSales[item.product_name].qty += item.quantity;
      productSales[item.product_name].revenue += item.quantity * item.price;
    });

    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    const recentOrders = (orders || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

    content.innerHTML = `
      <div class="analytics-grid">
        <div class="analytics-card">
          <div class="label">Total Revenue</div>
          <div class="value">${fmtPrice(totalRevenue)}</div>
          <div class="sub">Kutoka oda ${totalOrders}</div>
        </div>
        <div class="analytics-card">
          <div class="label">Total Orders</div>
          <div class="value">${totalOrders}</div>
          <div class="sub">${pendingOrders} pending · ${paidOrders} paid</div>
        </div>
        <div class="analytics-card">
          <div class="label">Average Order</div>
          <div class="value">${fmtPrice(avgOrder)}</div>
          <div class="sub">Kwa oda</div>
        </div>
        <div class="analytics-card">
          <div class="label">Products</div>
          <div class="value">${totalProducts}</div>
          <div class="sub">Kwenye duka</div>
        </div>
        <div class="analytics-card">
          <div class="label">Customers</div>
          <div class="value">${totalUsers}</div>
          <div class="sub">Waliojisajili</div>
        </div>
      </div>

      <div class="analytics-section">
        <h4>🏆 Top Selling Products</h4>
        ${topProducts.length === 0
          ? '<p style="color:#a3a3a3; font-size:0.9rem;">No sales yet</p>'
          : topProducts.map(([name, data]) => `
              <div class="top-product">
                <div>
                  <div class="top-product-name">${esc(name)}</div>
                  <div style="font-size:0.75rem; color:#a3a3a3;">${data.qty} units sold</div>
                </div>
                <div class="top-product-sales">${fmtPrice(data.revenue)}</div>
              </div>
            `).join('')
        }
      </div>

      <div class="analytics-section">
        <h4>📦 Recent Orders</h4>
        ${recentOrders.length === 0
          ? '<p style="color:#a3a3a3; font-size:0.9rem;">No orders yet</p>'
          : recentOrders.map(o => `
              <div class="top-product">
                <div>
                  <div class="top-product-name">#${o.id} - ${esc(o.customer_name)}</div>
                  <div style="font-size:0.75rem; color:#a3a3a3;">${new Date(o.created_at).toLocaleString('en-GB')}</div>
                </div>
                <div class="top-product-sales">${fmtPrice(o.total_amount)}</div>
              </div>
            `).join('')
        }
      </div>
    `;
  } catch (err) {
    console.error('Analytics error:', err);
    content.innerHTML = '<p style="color:#ef4444;">Error: ' + esc(err.message) + '</p>';
  }
}

async function viewOrderItems(orderId) {
  const { data } = await db.from('order_items').select('*').eq('order_id', orderId);
  if (!data || data.length === 0) { toast('No items found', 'info'); return; }
  const list = data.map(i => `• ${i.product_name} × ${i.quantity} = ${fmtPrice(i.price * i.quantity)}`).join('\n');
  alert(`Order #${orderId} items:\n\n${list}`);
}

function openAdminProduct() {
  document.getElementById('ap_id').value = '';
  document.getElementById('ap_name').value = '';
  document.getElementById('ap_desc').value = '';
  document.getElementById('ap_price').value = '';
  document.getElementById('ap_image').value = '';
  document.getElementById('ap_stock').value = '0';
  document.getElementById('ap_rating').value = '4.5';
  document.getElementById('ap_featured').checked = false;
  const fileInput = document.getElementById('ap_image_file');
  if (fileInput) fileInput.value = '';

  const catSelect = document.getElementById('ap_category');
  catSelect.innerHTML = '<option value="">Select category</option>' +
    allCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  document.getElementById('adminProductTitle').textContent = 'Add Product';
  document.getElementById('adminProductModal').classList.add('show');
}

async function editAdminProduct(id) {
  const { data: p } = await db.from('products').select('*').eq('id', id).single();
  if (!p) return;

  document.getElementById('ap_id').value = p.id;
  document.getElementById('ap_name').value = p.name || '';
  document.getElementById('ap_desc').value = p.description || '';
  document.getElementById('ap_price').value = p.price || '';
  document.getElementById('ap_image').value = p.image_url || '';
  document.getElementById('ap_stock').value = p.stock || 0;
  document.getElementById('ap_rating').value = p.rating || 4.5;
  document.getElementById('ap_featured').checked = p.is_featured || false;
  const fileInput = document.getElementById('ap_image_file');
  if (fileInput) fileInput.value = '';

  const catSelect = document.getElementById('ap_category');
  catSelect.innerHTML = '<option value="">Select category</option>' +
    allCategories.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  document.getElementById('adminProductTitle').textContent = 'Edit Product';
  document.getElementById('adminProductModal').classList.add('show');
}

async function saveAdminProduct() {
  const id = document.getElementById('ap_id').value;
  let imageUrl = document.getElementById('ap_image').value.trim() || null;

  const fileInput = document.getElementById('ap_image_file');
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast('Picha ni kubwa mno (max 5MB)', 'error');
      return;
    }

    const fileName = `${Date.now()}-${file.name.replace(/\s/g, '-')}`;
    const { data: uploadData, error: uploadError } = await db.storage
      .from('product-images')
      .upload(fileName, file);

    if (uploadError) {
      toast('Upload failed: ' + uploadError.message, 'error');
      return;
    }

    const { data: urlData } = db.storage
      .from('product-images')
      .getPublicUrl(fileName);

    imageUrl = urlData.publicUrl;
    toast('Picha imepakiwa!', 'success');
  }

  const payload = {
    name: document.getElementById('ap_name').value.trim(),
    description: document.getElementById('ap_desc').value.trim() || null,
    price: parseFloat(document.getElementById('ap_price').value) || 0,
    image_url: imageUrl,
    category_id: parseInt(document.getElementById('ap_category').value) || null,
    stock: parseInt(document.getElementById('ap_stock').value) || 0,
    rating: parseFloat(document.getElementById('ap_rating').value) || 4.5,
    is_featured: document.getElementById('ap_featured').checked
  };

  if (!payload.name || !payload.price) { toast('Fill name and price', 'error'); return; }

  const btn = document.getElementById('saveAdminProductBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const { error } = id
      ? await db.from('products').update(payload).eq('id', id)
      : await db.from('products').insert([payload]);
    if (error) throw error;

    toast(id ? 'Product updated' : 'Product added', 'success');
    document.getElementById('adminProductModal').classList.remove('show');
    await loadAdminProducts();
    await loadData();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Product';
  }
}

async function deleteAdminProduct(id) {
  if (!confirm('Delete this product?')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Product deleted', 'success');
  await loadAdminProducts();
  await loadData();
}

async function updateOrderStatus(orderId, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', orderId);
  if (error) return toast(error.message, 'error');
  toast('Order updated', 'success');
}

// ============================================
// INIT
// ============================================
initAuth();
loadData();
loadDarkMode();
loadShippingZones();
