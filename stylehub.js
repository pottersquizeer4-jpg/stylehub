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

// AWAMU 2: Product Images state
let editingProductImages = [];

// AWAMU 3: Product Variants state (Admin)
let editingVariants = [];

// HERO SLIDER STATE
let currentSlide = 0;
let slideInterval = null;

// ✅ AWAMU 6: PAGINATION STATE
let currentPage = 1;
const itemsPerPage = 12;

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

function requireAdmin() {
  if (!isAdmin) {
    toast('⛔ Huna ruhusa ya kufanya hivi', 'error');
    console.warn('🚫 Admin access denied for:', currentUser ? currentUser.email : 'guest');
    return false;
  }
  return true;
}

// AWAMU 4: Helper — Initials (Avatar)
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

// ============================================
// HERO SLIDER (Carousel)
// ============================================
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dots .dot');
  
  if (!slides || slides.length === 0) return;
  
  slides[0].classList.add('active');
  if (dots.length > 0) dots[0].classList.add('active');
  
  resetSlideTimer();
}

function goToSlide(index) {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dots .dot');
  
  if (!slides || slides.length === 0) return;
  
  slides.forEach(slide => slide.classList.remove('active'));
  dots.forEach(dot => dot.classList.remove('active'));
  
  currentSlide = index;
  slides[currentSlide].classList.add('active');
  if (dots[currentSlide]) dots[currentSlide].classList.add('active');
  
  resetSlideTimer();
}

function nextSlide() {
  const slides = document.querySelectorAll('.hero-slide');
  if (!slides || slides.length === 0) return;
  
  let nextIndex = (currentSlide + 1) % slides.length;
  goToSlide(nextIndex);
}

function resetSlideTimer() {
  if (slideInterval) clearInterval(slideInterval);
  slideInterval = setInterval(nextSlide, 5000);
}

// ============================================
// LOAD DATA
// ============================================
async function loadData() {
  try {
    const { data: cats } = await db.from('categories').select('*').order('name');
    allCategories = cats || [];
    renderCategories();

    const { data: prods, error } = await db.from('products')
      .select(`
        *,
        product_variants (*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    allProducts = prods || [];
    renderProducts();
    
    // ✅ AWAMU 7: Jaza dropdown za Size na Color
    populateFilterDropdowns();
    
    console.log('✅ Loaded', allProducts.length, 'products with variants');
  } catch (err) {
    console.error('Load error:', err);
    document.getElementById('productsGrid').innerHTML =
      '<div class="loading" style="color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Error: ' + esc(err.message) + '</div>';
  }
}

// ✅ AWAMU 7: Jaza Dropdown za Size na Color
function populateFilterDropdowns() {
  const sizes = new Set();
  const colors = new Set();

  allProducts.forEach(p => {
    (p.product_variants || []).forEach(v => {
      if (v.size) sizes.add(v.size);
      if (v.color) colors.add(v.color);
    });
  });

  const sizeSelect = document.getElementById('filterSize');
  const colorSelect = document.getElementById('filterColor');

  sizeSelect.innerHTML = '<option value="">All Sizes</option>' + 
    [...sizes].sort().map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

  colorSelect.innerHTML = '<option value="">All Colors</option>' + 
    [...colors].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
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
      currentPage = 1; // Reset to page 1 on filter
      renderProducts();
    };
  });
}

// ============================================
// RENDER PRODUCTS (NA PAGINATION & FILTERS)
// ============================================
function renderProducts() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const minP = parseFloat(document.getElementById('minPrice').value) || 0;
  const maxP = parseFloat(document.getElementById('maxPrice').value) || Infinity;
  const sortBy = document.getElementById('sortBy').value;
  const minR = parseFloat(document.getElementById('minRating').value) || 0;
  
  // ✅ AWAMU 7: Soma Filters mpya
  const filterSize = document.getElementById('filterSize').value;
  const filterColor = document.getElementById('filterColor').value;

  const grid = document.getElementById('productsGrid');

  // 1. Pata bidhaa zote kulingana na filter
  let list = allProducts.filter(p => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (activeCategory && String(p.category_id) !== activeCategory) return false;
    if (p.price < minP) return false;
    if (p.price > maxP) return false;
    if ((p.rating || 0) < minR) return false;
    
    // ✅ AWAMU 7: Logic ya Size & Color
    if (filterSize || filterColor) {
      const variants = p.product_variants || [];
      const hasMatchingVariant = variants.some(v => 
        (!filterSize || v.size === filterSize) && 
        (!filterColor || v.color === filterColor) &&
        v.stock > 0 // Lazima iwe iko stock
      );
      
      // Kama haina variant inayolingana, usionyeshe
      if (!hasMatchingVariant) return false;
    }

    return true;
  });

  // 2. Panga (Sort)
  if (sortBy === 'price-low') list.sort((a, b) => a.price - b.price);
  else if (sortBy === 'price-high') list.sort((a, b) => b.price - a.price);
  else if (sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('resultCount').textContent = list.length + ' products';

  // 3. ✅ AWAMU 6: Hesabu Kurasa (Pagination logic)
  const totalPages = Math.ceil(list.length / itemsPerPage);
  
  // Hakikisha currentPage haizidi totalPages
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  // Chukua bidhaa za ukurasa huu tu
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedList = list.slice(startIndex, endIndex);

  // 4. Onyesha bidhaa
  if (list.length === 0) {
    grid.innerHTML = '<div class="loading"><i class="fas fa-search"></i> No products found</div>';
    document.getElementById('paginationContainer').style.display = 'none';
    return;
  }

  grid.innerHTML = paginatedList.map(p => {
    let totalStock = p.stock;
    if (p.product_variants && p.product_variants.length > 0) {
      totalStock = p.product_variants.reduce((sum, v) => sum + v.stock, 0);
    }

    return `
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
          <button class="add-btn" onclick="event.stopPropagation(); addToCart(${p.id})" ${totalStock === 0 ? 'disabled' : ''} title="${totalStock === 0 ? 'Out of stock' : 'Add to cart'}">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  `}).join('');

  // 5. ✅ AWAMU 6: Update Vitufe vya Kurasa
  updatePaginationUI(totalPages, list.length);
}

// ✅ AWAMU 6: Function ya Kubadilisha Ukurasa
function changePage(direction) {
  currentPage += direction;
  renderProducts();
  // Scrolling kwenda juu kidogo ili mteja aanze kuona bidhaa mpya
  document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

// ✅ AWAMU 6: Function ya Ku-update UI ya Kurasa
function updatePaginationUI(totalPages, totalItems) {
  const container = document.getElementById('paginationContainer');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');

  if (totalItems <= itemsPerPage) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  // Weka maandishi (Mfano: Ukurasa 1 kati ya 3)
  pageInfo.textContent = `Ukurasa ${currentPage} kati ya ${totalPages}`;

  // Zima/kufungua vitufe
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('minPrice').value = '';
  document.getElementById('maxPrice').value = '';
  document.getElementById('sortBy').value = 'newest';
  document.getElementById('minRating').value = '0';
  
  // ✅ AWAMU 7: Reset Size na Color
  document.getElementById('filterSize').value = '';
  document.getElementById('filterColor').value = '';

  document.getElementById('filters').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('filters').querySelector('[data-cat=""]').classList.add('active');
  activeCategory = '';
  currentPage = 1; // Reset page
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
  currentPage = 1; // Reset page
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
// PRODUCT DETAILS (Na Variants)
// ============================================
function openProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;

  currentProduct = p;

  const sizes = [...new Set((p.product_variants || []).map(v => v.size).filter(Boolean))];
  const colors = [...new Set((p.product_variants || []).map(v => v.color).filter(Boolean))];

  selectedSize = sizes.length > 0 ? sizes[0] : '';
  selectedColor = colors.length > 0 ? colors[0] : '';
  selectedRating = 5;

  const sizesHTML = sizes.map(s => {
    const variant = p.product_variants.find(v => v.size === s && (!selectedColor || v.color === selectedColor));
    const isOut = variant ? variant.stock === 0 : false;
    return `<button class="option-btn ${s === selectedSize ? 'active' : ''}" 
              onclick="selectSize('${s}', this)" 
              ${isOut ? 'disabled' : ''}>
              ${esc(s)} ${isOut ? '(Imeisha)' : ''}
            </button>`;
  }).join('');

  const colorsHTML = colors.map(c => {
    const variant = p.product_variants.find(v => v.color === c && (!selectedSize || v.size === selectedSize));
    const isOut = variant ? variant.stock === 0 : false;
    return `<button class="option-btn ${c === selectedColor ? 'active' : ''}" 
              onclick="selectColor('${c}', this)"
              ${isOut ? 'disabled' : ''}>
              ${esc(c)} ${isOut ? '(Imeisha)' : ''}
            </button>`;
  }).join('');

  const activeVariant = p.product_variants.find(v => v.size === selectedSize && v.color === selectedColor);
  const currentStock = activeVariant ? activeVariant.stock : (p.product_variants.length === 0 ? p.stock : 0);
  
  const stockClass = currentStock > 0 ? 'stock-in' : 'stock-out';
  const stockText = currentStock > 0 ? `✓ In Stock (${currentStock})` : '✗ Out of Stock';
  const isWishlisted = wishlist.includes(p.id);

  document.getElementById('productDetailContent').innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
      <button class="close-cart" onclick="closeProduct()" style="font-size:1.5rem; background:none; border:none; color:#94a3b8; cursor:pointer;">&times;</button>
    </div>
    <div class="product-detail">
      <div>
        <img src="${esc(p.image_url || 'https://via.placeholder.com/500')}" alt="${esc(p.name)}" class="product-detail-img" id="mainProductImage" onerror="this.src='https://via.placeholder.com/500?text=No+Image'">
        <div class="product-thumbnails" id="productThumbnails"></div>
      </div>
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
          <span class="stock-info ${stockClass}" id="variantStockBadge">${stockText}</span>
        </div>

        ${sizesHTML ? `
          <div class="product-detail-section">
            <h4>Select Size</h4>
            <div class="option-btns" id="sizeOptions">${sizesHTML}</div>
          </div>
        ` : ''}

        ${colorsHTML ? `
          <div class="product-detail-section">
            <h4>Select Color</h4>
            <div class="option-btns" id="colorOptions">${colorsHTML}</div>
          </div>
        ` : ''}

        <button class="add-detail-btn" id="addToCartBtn" onclick="addFromDetail()" ${currentStock === 0 ? 'disabled' : ''}>
          <i class="fas fa-shopping-cart"></i> ${currentStock === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>

        <div class="reviews-section" id="reviewsSection">
          <div class="loading"><i class="fas fa-spinner"></i> Loading reviews...</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('productModal').classList.add('show');
  loadReviews(p.id);
  loadProductGallery(p.id, p.image_url);
  
  // ✅ AWAMU 11: Pakia Recommendations
  loadRecommendations(p);
}

function selectSize(size, btn) {
  selectedSize = size;
  btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateVariantUI();
}

function selectColor(color, btn) {
  selectedColor = color;
  btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateVariantUI();
}

function updateVariantUI() {
  if (!currentProduct) return;
  const p = currentProduct;

  const activeVariant = p.product_variants.find(v => 
    (v.size === selectedSize || !v.size) && 
    (v.color === selectedColor || !v.color)
  );
  
  const currentStock = activeVariant ? activeVariant.stock : (p.product_variants.length === 0 ? p.stock : 0);

  const stockBadge = document.getElementById('variantStockBadge');
  if (stockBadge) {
    if (currentStock > 0) {
      stockBadge.className = 'stock-info stock-in';
      stockBadge.textContent = `✓ In Stock (${currentStock})`;
    } else {
      stockBadge.className = 'stock-info stock-out';
      stockBadge.textContent = '✗ Out of Stock';
    }
  }

  const addBtn = document.getElementById('addToCartBtn');
  if (addBtn) {
    addBtn.disabled = currentStock === 0;
    addBtn.innerHTML = `<i class="fas fa-shopping-cart"></i> ${currentStock === 0 ? 'Out of Stock' : 'Add to Cart'}`;
  }

  if (selectedColor) {
    document.querySelectorAll('#sizeOptions .option-btn').forEach(btn => {
      const size = btn.textContent.replace(' (Imeisha)', '').trim();
      const variant = p.product_variants.find(v => v.size === size && v.color === selectedColor);
      if (variant && variant.stock === 0) {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    });
  }

  if (selectedSize) {
    document.querySelectorAll('#colorOptions .option-btn').forEach(btn => {
      const color = btn.textContent.replace(' (Imeisha)', '').trim();
      const variant = p.product_variants.find(v => v.color === color && v.size === selectedSize);
      if (variant && variant.stock === 0) {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    });
  }
}

function addFromDetail() {
  if (!currentProduct) return;
  const p = currentProduct;

  const activeVariant = p.product_variants.find(v => 
    (v.size === selectedSize || !v.size) && 
    (v.color === selectedColor || !v.color)
  );
  const currentStock = activeVariant ? activeVariant.stock : (p.product_variants.length === 0 ? p.stock : 0);

  if (currentStock === 0) {
    toast('Bidhaa hii imeisha kwenye stock', 'error');
    return;
  }

  const existing = cart.find(x => x.id === p.id && x.size === selectedSize && x.color === selectedColor);
  
  if (existing) {
    if (existing.qty >= currentStock) { 
      toast('Hunaweza kuongeza zaidi ya stock iliyopo', 'error'); 
      return; 
    }
    existing.qty++;
  } else {
    cart.push({ 
      id: p.id, 
      name: p.name, 
      price: p.price, 
      image_url: p.image_url, 
      qty: 1, 
      size: selectedSize, 
      color: selectedColor 
    });
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
// AWAMU 11: PRODUCT RECOMMENDATIONS
// ============================================
function loadRecommendations(currentProd) {
  const container = document.getElementById('recommendationsSection');
  if (!container) return;
  
  // 1. Tafuta bidhaa zinazofanana (Category moja, isiyo ni hii ya sasa)
  let related = allProducts.filter(p => 
    p.id !== currentProd.id && 
    p.category_id === currentProd.category_id
  );
  
  // 2. Kama hazitoshi (chini ya 4), ongeza nyingine yoyote
  if (related.length < 4) {
    const others = allProducts.filter(p => 
      p.id !== currentProd.id && 
      !related.includes(p)
    );
    related = [...related, ...others];
  }
  
  // 3. Panga kwa Rating (juu hadi chini) na chukua 4 tu
  related = related.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
  
  if (related.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  // 4. Onyesha Recommendations
  container.innerHTML = `
    <h4 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
      <i class="fas fa-thumbs-up" style="color: var(--primary);"></i> You May Also Like
    </h4>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem;">
      ${related.map(p => `
        <div onclick="closeProduct(); setTimeout(() => openProduct(${p.id}), 300);" 
             style="background: white; border: 1px solid var(--gray-200); border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s;"
             onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.1)';"
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
          <img src="${esc(p.image_url || 'https://via.placeholder.com/200')}" 
               style="width: 100%; aspect-ratio: 1; object-fit: cover;"
               onerror="this.src='https://via.placeholder.com/200'">
          <div style="padding: 0.75rem;">
            <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${esc(p.name)}
            </div>
            <div style="color: var(--primary); font-weight: 800; font-size: 0.95rem;">${fmtPrice(p.price)}</div>
            <div style="color: var(--primary); font-size: 0.75rem; margin-top: 0.25rem;">
              ${'★'.repeat(Math.floor(p.rating || 0))}${'☆'.repeat(5 - Math.floor(p.rating || 0))}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// AWAMU 2: PRODUCT GALLERY
// ============================================
async function loadProductGallery(productId, mainImageUrl) {
  const container = document.getElementById('productThumbnails');
  if (!container) return;
  
  try {
    const { data: images } = await db
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    
    if (!images || images.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    const allImages = [
      { image_url: mainImageUrl, is_main: true },
      ...images.map(img => ({ image_url: img.image_url, is_main: false }))
    ].filter(img => img.image_url);
    
    container.innerHTML = allImages.map((img, i) => `
      <img 
        src="${esc(img.image_url)}" 
        class="product-thumbnail ${i === 0 ? 'active' : ''}"
        onclick="switchMainImage('${esc(img.image_url)}', this)"
        onerror="this.src='https://via.placeholder.com/70'"
        title="${img.is_main ? 'Picha kuu' : 'Picha ya ziada ' + i}"
      >
    `).join('');
    
    container.style.display = 'flex';
    
  } catch (err) {
    console.error('Load gallery error:', err);
    container.style.display = 'none';
  }
}

function switchMainImage(imageUrl, thumbEl) {
  const mainImg = document.getElementById('mainProductImage');
  if (!mainImg) return;
  
  mainImg.src = imageUrl;
  
  document.querySelectorAll('.product-thumbnail').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
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
  
  if (p.product_variants && p.product_variants.length > 0) {
    openProduct(p.id);
    return;
  }

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
  let maxStock = p ? p.stock : 0;
  if (p && p.product_variants && p.product_variants.length > 0) {
     const variant = p.product_variants.find(v => v.size === item.size && v.color === item.color);
     maxStock = variant ? variant.stock : 0;
  }

  const newQty = item.qty + delta;
  if (newQty <= 0) { removeFromCart(id); return; }
  if (maxStock && newQty > maxStock) { toast('Not enough stock', 'error'); return; }
  item.qty = newQty;
  renderCart();
}

function renderCart() {
  const items = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const count = document.getElementById('cartCount');

  // ✅ ANIMATION: Cart Bump
  const cartBtn = document.querySelector('.cart-btn');
  if (cartBtn) {
    cartBtn.classList.remove('bump');
    void cartBtn.offsetWidth; // Trigger reflow to restart animation
    cartBtn.classList.add('bump');
  }

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
        ${item.size || item.color ? `<div style="font-size:0.75rem;color:#a3a3a3;">${item.size ? 'Size: ' + esc(item.size) : ''} ${item.color ? ' · Color: ' + esc(item.color) : ''}</div>` : ''}
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
// AWAMU 2: SHIPPING ZONES (Checkout)
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
// AWAMU 2: COUPONS (Checkout)
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
    
    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      throw new Error('Coupon imeisha muda wake');
    }
    
    if (data.max_uses && data.used_count >= data.max_uses) {
      throw new Error('Coupon imetumika mara zote');
    }
    
    const subtotal = cart.reduce((s, x) => s + x.price * x.qty, 0);
    if (data.min_order && subtotal < data.min_order) {
      throw new Error(`Coupon inahitaji order ya angalau ${data.min_order.toLocaleString()} TZS`);
    }
    
    appliedCoupon = {
      code: data.code,
      type: data.discount_type,
      value: parseFloat(data.discount_value),
      description: data.description || '',
      minOrder: data.min_order
    };
    
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

    for (const item of cart) {
       const p = allProducts.find(x => x.id === item.id);
       if (p && p.product_variants && p.product_variants.length > 0) {
           const variant = p.product_variants.find(v => v.size === item.size && v.color === item.color);
           if (variant) {
             await db.from('product_variants').update({ stock: Math.max(0, variant.stock - item.qty) }).eq('id', variant.id);
           }
       } else if (p) {
           await db.from('products').update({ stock: Math.max(0, p.stock - item.qty) }).eq('id', p.id);
       }
    }

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

  db.auth.onAuthStateChange((event, session) => {
    console.log('🔐 Auth event:', event);
    currentUser = session ? session.user : null;
    updateUserUI();
    
    if (event === 'PASSWORD_RECOVERY') {
      console.log('🔑 PASSWORD_RECOVERY detected');
      setTimeout(() => {
        openSetPasswordModal();
      }, 500);
    }
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
    const adminPage = document.getElementById('page-admin');
    if (adminPage) adminPage.style.display = 'none';
    const productsContainer = document.getElementById('products');
    if (productsContainer) productsContainer.style.display = 'block';
    const hero = document.querySelector('.hero');
    if (hero) hero.style.display = 'block';
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
        await db.from('user_profiles').insert([{ 
          id: data.user.id, 
          full_name: name 
        }]);
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
// AWAMU 1: SET NEW PASSWORD (Recovery Flow)
// ============================================
function openSetPasswordModal() {
  const modal = document.getElementById('setPasswordModal');
  if (!modal) return;
  
  const content = document.getElementById('setPasswordContent');
  content.innerHTML = `
    <h2>Set New Password</h2>
    <p class="sub">Weka password mpya kwa akaunti yako.</p>
    
    <div class="form-group">
      <label>New Password *</label>
      <input type="password" id="new_password" placeholder="At least 6 characters" oninput="checkPasswordStrength()">
      <div class="password-strength">
        <div class="password-strength-fill" id="passwordStrengthBar"></div>
      </div>
      <div class="password-hint" id="passwordHint">Angalau herufi 6</div>
    </div>
    
    <div class="form-group">
      <label>Confirm Password *</label>
      <input type="password" id="confirm_password" placeholder="Rudia password" oninput="checkPasswordMatch()">
      <div class="password-hint" id="confirmHint"></div>
    </div>
    
    <div class="modal-actions">
      <button class="btn-confirm" id="setPasswordBtn" onclick="updatePassword()">
        <i class="fas fa-save"></i> Save Password
      </button>
    </div>
  `;
  
  modal.classList.add('show');
}

function checkPasswordStrength() {
  const pw = document.getElementById('new_password').value;
  const bar = document.getElementById('passwordStrengthBar');
  const hint = document.getElementById('passwordHint');
  
  if (!pw) {
    bar.className = 'password-strength-fill';
    hint.textContent = 'Angalau herufi 6';
    hint.className = 'password-hint';
    return;
  }
  
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  
  if (score <= 2) {
    bar.className = 'password-strength-fill weak';
    hint.textContent = 'Dhaifu — ongeza herufi, namba, au alama';
    hint.className = 'password-hint error';
  } else if (score <= 3) {
    bar.className = 'password-strength-fill medium';
    hint.textContent = 'Nzuri — lakini inaweza kuwa na nguvu zaidi';
    hint.className = 'password-hint';
  } else {
    bar.className = 'password-strength-fill strong';
    hint.textContent = 'Nguvu sana! 💪';
    hint.className = 'password-hint success';
  }
}

function checkPasswordMatch() {
  const pw = document.getElementById('new_password').value;
  const cpw = document.getElementById('confirm_password').value;
  const hint = document.getElementById('confirmHint');
  
  if (!cpw) {
    hint.textContent = '';
    hint.className = 'password-hint';
    return;
  }
  
  if (pw === cpw) {
    hint.textContent = '✓ Password zinalingana';
    hint.className = 'password-hint success';
  } else {
    hint.textContent = '✗ Password hazilingana';
    hint.className = 'password-hint error';
  }
}

async function updatePassword() {
  const pw = document.getElementById('new_password').value;
  const cpw = document.getElementById('confirm_password').value;
  
  if (!pw || pw.length < 6) {
    toast('Password iwe angalau herufi 6', 'error');
    return;
  }
  
  if (pw !== cpw) {
    toast('Password hazilingani', 'error');
    return;
  }
  
  const btn = document.getElementById('setPasswordBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  
  try {
    const { data, error } = await db.auth.updateUser({ password: pw });
    if (error) throw error;
    
    toast('✅ Password imebadilishwa!', 'success');
    
    document.getElementById('setPasswordContent').innerHTML = `
      <div class="recovery-success">
        <i class="fas fa-check-circle"></i>
        <h2>Password Imebadilishwa!</h2>
        <p class="sub">Sasa unaweza kuingia kwa password yako mpya.</p>
        <button class="btn-confirm" onclick="closeM('setPasswordModal'); openAuth();" style="width:100%; padding:1rem; margin-top:1rem;">
          <i class="fas fa-sign-in-alt"></i> Sign In Sasa
        </button>
      </div>
    `;
    
    setTimeout(() => {
      closeM('setPasswordModal');
    }, 5000);
    
  } catch (err) {
    console.error('Update password error:', err);
    toast('Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Password';
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
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
            <div style="font-size:1.1rem; font-weight:800; color:var(--primary);">${fmtPrice(o.total_amount)}</div>
            <button onclick="openReceipt(${o.id})" style="background:#c9a227; color:#0f0f0f; border:none; padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.8rem;">
              <i class="fas fa-receipt"></i> Receipt
            </button>
          </div>
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
// AWAMU 9: RECEIPT / PRINT
// ============================================
async function openReceipt(orderId) {
  if (!currentUser) return;
  
  document.getElementById('receiptModal').classList.add('show');
  const content = document.getElementById('receiptContent');
  content.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading receipt...</div>';

  try {
    // 1. Pata Oda
    const { data: order, error } = await db
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error) throw error;

    // 2. Pata Items za Oda
    const { data: items } = await db
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    // 3. Tengeneza Risiti
    const itemsHTML = (items || []).map(item => `
      <tr>
        <td style="padding:0.5rem 0; border-bottom:1px solid #e5e5e3;">${esc(item.product_name)}<br><span style="font-size:0.75rem; color:#888;">${item.size ? 'Size: ' + esc(item.size) : ''} ${item.color ? ' | Color: ' + esc(item.color) : ''}</span></td>
        <td style="padding:0.5rem 0; border-bottom:1px solid #e5e5e3; text-align:center;">${item.quantity}</td>
        <td style="padding:0.5rem 0; border-bottom:1px solid #e5e5e3; text-align:right;">${fmtPrice(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const discountRow = order.discount_amount > 0 ? `
      <tr>
        <td colspan="2" style="padding:0.5rem 0; text-align:right; color:#065f46;">Discount ${order.coupon_code ? '(' + order.coupon_code + ')' : ''}:</td>
        <td style="padding:0.5rem 0; text-align:right; color:#065f46;">-${fmtPrice(order.discount_amount)}</td>
      </tr>
    ` : '';

    content.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; color: #171717; padding: 1rem;" id="receiptPrintArea">
        <!-- Header -->
        <div style="text-align:center; border-bottom: 2px dashed #ccc; padding-bottom: 1rem; margin-bottom: 1rem;">
          <div style="font-size: 1.5rem; font-weight: 800; color: #c9a227;">
            <i class="fas fa-shopping-bag"></i> StyleHub
          </div>
          <div style="font-size: 0.85rem; color: #666;">Fashion Store · Dar es Salaam</div>
          <div style="font-size: 0.85rem; color: #666;">Simu: +255 700 000 000</div>
        </div>

        <!-- Order Info -->
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom: 1rem;">
          <div>
            <strong>Order #${order.id}</strong><br>
            ${new Date(order.created_at).toLocaleString('en-GB')}
          </div>
          <div style="text-align:right;">
            <strong>${esc(order.customer_name)}</strong><br>
            ${esc(order.customer_phone)}<br>
            ${esc(order.customer_email)}
          </div>
        </div>

        <!-- Address -->
        <div style="font-size: 0.85rem; margin-bottom: 1rem; padding: 0.5rem; background:#f7f7f5; border-radius: 6px;">
          <strong>Anwani:</strong> ${esc(order.shipping_address)}<br>
          <strong>Shipping:</strong> ${esc(order.shipping_zone || '—')}
        </div>

        <!-- Items -->
        <table style="width:100%; font-size:0.85rem; border-collapse: collapse; margin-bottom: 1rem;">
          <thead>
            <tr style="border-bottom: 2px solid #c9a227;">
              <th style="text-align:left; padding:0.5rem 0;">Bidhaa</th>
              <th style="text-align:center; padding:0.5rem 0;">Idadi</th>
              <th style="text-align:right; padding:0.5rem 0;">Bei</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <!-- Totals -->
        <table style="width:100%; font-size:0.9rem; margin-top:1rem;">
          <tr>
            <td style="text-align:right; padding:0.25rem 0;">Subtotal:</td>
            <td style="text-align:right; padding:0.25rem 0; width:100px;">${fmtPrice(order.total_amount + (order.discount_amount || 0) - (order.shipping_fee || 0))}</td>
          </tr>
          ${discountRow}
          <tr>
            <td style="text-align:right; padding:0.25rem 0;">Shipping:</td>
            <td style="text-align:right; padding:0.25rem 0;">${fmtPrice(order.shipping_fee)}</td>
          </tr>
          <tr style="border-top: 2px solid #171717;">
            <td style="text-align:right; padding:0.5rem 0; font-weight:800; font-size:1.1rem;">TOTAL:</td>
            <td style="text-align:right; padding:0.5rem 0; font-weight:800; font-size:1.1rem; color:#c9a227;">${fmtPrice(order.total_amount)}</td>
          </tr>
        </table>

        <!-- Footer -->
        <div style="text-align:center; font-size:0.75rem; color:#888; margin-top: 2rem; border-top: 2px dashed #ccc; padding-top: 1rem;">
          Asante kwa kununua StyleHub!<br>
          Bidhaa zote zinaweza kurudishwa ndani ya siku 7.<br>
          <strong>Payment: ${order.payment_method === 'cod' ? 'Cash on Delivery' : 'M-Pesa'}</strong>
        </div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    content.innerHTML = '<p style="color:#ef4444;">Error loading receipt: ' + err.message + '</p>';
  }
}

function printReceipt() {
  const printContents = document.getElementById('receiptPrintArea').innerHTML;
  const originalContents = document.body.innerHTML;

  // CSS maalum kwa ajili ya kuchapisha
  const printStyles = `
    <style>
      @media print {
        body * { visibility: hidden; }
        #receiptPrintArea, #receiptPrintArea * { visibility: visible; }
        #receiptPrintArea { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
        .no-print { display: none !important; }
      }
    </style>
  `;

  document.body.innerHTML = printStyles + '<div id="receiptPrintArea">' + printContents + '</div>';
  window.print();
  document.body.innerHTML = originalContents;
  window.location.reload(); // Reload ili kurudisha JS na CSS
}

// ============================================
// ADMIN: ROLE CHECK
// ============================================
async function checkAdminRole() {
  if (!currentUser) { 
    isAdmin = false; 
    updateAdminUI();
    return; 
  }
  
  try {
    const { data, error } = await db
      .from('user_profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single();
    
    console.log('🔍 Admin check for', currentUser.email, ':', data);
    isAdmin = data && data.role === 'admin';
    console.log('🔍 isAdmin:', isAdmin);
    
  } catch (err) {
    console.error('Admin check error:', err);
    isAdmin = false;
  }
  
  updateAdminUI();
}

function updateAdminUI() {
  const adminBtn = document.getElementById('adminMenuBtn');
  const adminPage = document.getElementById('page-admin');
  
  if (isAdmin) {
    if (adminBtn) adminBtn.style.display = 'flex';
  } else {
    if (adminBtn) adminBtn.style.display = 'none';
    if (adminPage) {
      adminPage.style.display = 'none';
      const productsContainer = document.getElementById('products');
      if (productsContainer) productsContainer.style.display = 'block';
      const hero = document.querySelector('.hero');
      if (hero) hero.style.display = 'block';
    }
  }
}

// ============================================
// ADMIN: OPEN / CLOSE
// ============================================
function openAdmin() {
  if (!requireAdmin()) return;
  
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
  if (!requireAdmin()) return;
  document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('admin-' + tab).classList.add('active');
  
  if (tab === 'orders') loadAdminOrders();
  else if (tab === 'analytics') loadAnalytics();
  else if (tab === 'coupons') loadAdminCoupons();
  else if (tab === 'shipping') loadAdminShipping();
  else if (tab === 'reports') loadAdminReports();
  else if (tab === 'customers') loadAdminCustomers();
  else loadAdminProducts();
}

async function loadAdminData() {
  if (!requireAdmin()) return;
  await Promise.all([loadAdminProducts(), loadAdminOrders()]);
}

// ============================================
// ADMIN: PRODUCTS (NA LOW STOCK ALERT)
// ============================================
async function loadAdminProducts() {
  if (!requireAdmin()) return;
  
  const tbody = document.getElementById('adminProductsTable');
  try {
    const { data } = await db.from('products').select(`
        *,
        product_variants (stock)
      `).order('created_at', { ascending: false });
      
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#a3a3a3;">No products</td></tr>';
      return;
    }

    let lowStockCount = 0;

    tbody.innerHTML = data.map(p => {
      let totalStock = p.stock;
      if (p.product_variants && p.product_variants.length > 0) {
        totalStock = p.product_variants.reduce((sum, v) => sum + v.stock, 0);
      }

      // ✅ AWAMU 5: Hesabu bidhaa zenye stock chini ya 5
      if (totalStock > 0 && totalStock < 5) {
        lowStockCount++;
      }

      // ✅ AWAMU 5: Badilisha rangi kuwa nyekundu kama stock < 5
      const stockStyle = (totalStock > 0 && totalStock < 5) 
        ? 'color: #ef4444; font-weight: 800; background: #fee2e2; padding: 0.2rem 0.5rem; border-radius: 6px; display: inline-block;' 
        : '';
        
      // ✅ Ikiwa imeisha kabisa
      const isOut = totalStock === 0;

      return `
      <tr>
        <td><img src="${esc(p.image_url || 'https://via.placeholder.com/40')}" onerror="this.src='https://via.placeholder.com/40'"></td>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${fmtPrice(p.price)}</td>
        <td>
          <span style="${stockStyle}">
            ${totalStock} ${isOut ? '❌' : ''}
          </span>
        </td>
        <td>${(p.rating || 0).toFixed(1)} ⭐</td>
        <td>
          <button onclick="editAdminProduct(${p.id})" style="background:#3b82f6;color:white;border:none;padding:0.35rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-right:0.3rem;"><i class="fas fa-pen"></i></button>
          <button onclick="deleteAdminProduct(${p.id})" style="background:#ef4444;color:white;border:none;padding:0.35rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `}).join('');

    // ✅ AWAMU 5: Onyesha Alert juu ya table kama kuna bidhaa zinazoisha
    const alertBox = document.getElementById('lowStockAlert');
    if (alertBox) {
      if (lowStockCount > 0) {
        alertBox.style.display = 'flex';
        document.getElementById('lowStockCount').textContent = lowStockCount;
      } else {
        alertBox.style.display = 'none';
      }
    }

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</td></tr>';
  }
}

// ============================================
// ADMIN: ORDERS
// ============================================
async function loadAdminOrders() {
  if (!requireAdmin()) return;
  
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
// ADMIN: ANALYTICS (NA LOW STOCK)
// ============================================
async function loadAnalytics() {
  if (!requireAdmin()) return;
  
  const content = document.getElementById('analyticsContent');
  if (!content) return;

  content.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading analytics...</div>';

  try {
    const { data: orders } = await db.from('orders').select('*');
    const { data: products } = await db.from('products').select(`*, product_variants(stock)`);
    const { data: orderItems } = await db.from('order_items').select('*');
    const { data: users } = await db.from('user_profiles').select('*');

    const totalOrders = orders ? orders.length : 0;
    const totalRevenue = orders ? orders.reduce((s, o) => s + (o.total_amount || 0), 0) : 0;
    const pendingOrders = orders ? orders.filter(o => o.status === 'pending').length : 0;
    const paidOrders = orders ? orders.filter(o => o.status === 'paid').length : 0;
    const totalProducts = products ? products.length : 0;
    const totalUsers = users ? users.length : 0;
    const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // ✅ AWAMU 5: Hesabu bidhaa zenye stock chini ya 5
    let lowStockCount = 0;
    (products || []).forEach(p => {
      let totalStock = p.stock;
      if (p.product_variants && p.product_variants.length > 0) {
        totalStock = p.product_variants.reduce((sum, v) => sum + v.stock, 0);
      }
      if (totalStock > 0 && totalStock < 5) {
        lowStockCount++;
      }
    });

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
        <div class="analytics-card" style="border-left: 4px solid #ef4444;">
          <div class="label" style="color:#ef4444;">Low Stock ⚠️</div>
          <div class="value" id="analyticsLowStock" style="color:#ef4444;">${lowStockCount}</div>
          <div class="sub">Bidhaa zinazokaribia kuisha</div>
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
  if (!requireAdmin()) return;
  
  const { data } = await db.from('order_items').select('*').eq('order_id', orderId);
  if (!data || data.length === 0) { toast('No items found', 'info'); return; }
  const list = data.map(i => `• ${i.product_name} ${i.size ? `(${i.size}${i.color ? '/'+i.color : ''})` : ''} × ${i.quantity} = ${fmtPrice(i.price * i.quantity)}`).join('\n');
  alert(`Order #${orderId} items:\n\n${list}`);
}

// ============================================
// ADMIN: PRODUCT MODAL & VARIANTS UI
// ============================================
function addVariantRow(data = { size: '', color: '', stock: 0, id: null, isNew: true }) {
  const container = document.getElementById('variantsContainer');
  if (!container) return;

  const index = editingVariants.length;
  editingVariants.push(data);

  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input type="text" placeholder="Size (e.g., M)" value="${esc(data.size)}" oninput="editingVariants[${index}].size = this.value">
    <input type="text" placeholder="Color (e.g., Red)" value="${esc(data.color)}" oninput="editingVariants[${index}].color = this.value">
    <input type="number" placeholder="Stock" min="0" value="${data.stock}" oninput="editingVariants[${index}].stock = parseInt(this.value) || 0">
    <button type="button" class="variant-remove" onclick="removeVariantRow(this, ${index})" title="Remove">
      <i class="fas fa-times"></i>
    </button>
  `;
  container.appendChild(row);
}

function removeVariantRow(btn, index) {
  btn.parentElement.remove();
  if (editingVariants[index]) {
    editingVariants[index].deleted = true;
  }
}

function openAdminProduct() {
  if (!requireAdmin()) return;
  
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
  
  const multiInput = document.getElementById('ap_multi_images');
  if (multiInput) multiInput.value = '';
  editingProductImages = [];
  renderEditingProductImages();

  editingVariants = [];
  document.getElementById('variantsContainer').innerHTML = '';

  const catSelect = document.getElementById('ap_category');
  catSelect.innerHTML = '<option value="">Select category</option>' +
    allCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  document.getElementById('adminProductTitle').textContent = 'Add Product';
  document.getElementById('adminProductModal').classList.add('show');
}

async function editAdminProduct(id) {
  if (!requireAdmin()) return;
  
  const { data: p } = await db.from('products').select(`
      *,
      product_variants (*)
    `).eq('id', id).single();
    
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
  const multiInput = document.getElementById('ap_multi_images');
  if (multiInput) multiInput.value = '';

  const catSelect = document.getElementById('ap_category');
  catSelect.innerHTML = '<option value="">Select category</option>' +
    allCategories.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  editingVariants = [];
  document.getElementById('variantsContainer').innerHTML = '';
  if (p.product_variants && p.product_variants.length > 0) {
    p.product_variants.forEach(v => {
      addVariantRow({ id: v.id, size: v.size, color: v.color, stock: v.stock, isNew: false });
    });
  }

  await loadEditingProductImages(id);

  document.getElementById('adminProductTitle').textContent = 'Edit Product';
  document.getElementById('adminProductModal').classList.add('show');
}

async function saveAdminProduct() {
  if (!requireAdmin()) return;
  
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
    toast('Picha kuu imepakiwa!', 'success');
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
    let productId = id;
    
    if (id) {
      const { error } = await db.from('products').update(payload).eq('id', id);
      if (error) throw error;
      await deleteOldImages(id);
    } else {
      const { data: inserted, error } = await db.from('products').insert([payload]).select();
      if (error) throw error;
      productId = inserted[0].id;
    }

    const { error: delVarErr } = await db.from('product_variants').delete().eq('product_id', productId);
    if (delVarErr) console.error('Delete variants error:', delVarErr);

    const validVariants = editingVariants.filter(v => !v.deleted && (v.size || v.color));
    if (validVariants.length > 0) {
      const variantsToInsert = validVariants.map(v => ({
        product_id: productId,
        size: v.size || null,
        color: v.color || null,
        stock: v.stock || 0
      }));
      const { error: varErr } = await db.from('product_variants').insert(variantsToInsert);
      if (varErr) throw varErr;
    }

    await uploadNewImages(productId);

    toast(id ? 'Product updated' : 'Product added', 'success');
    document.getElementById('adminProductModal').classList.remove('show');
    await loadAdminProducts();
    await loadData();
  } catch (err) {
    console.error('Save error:', err);
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Product';
  }
}

async function deleteAdminProduct(id) {
  if (!requireAdmin()) return;
  
  if (!confirm('Delete this product?')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Product deleted', 'success');
  await loadAdminProducts();
  await loadData();
}

// ============================================
// AWAMU 2: PRODUCT IMAGES ADMIN
// ============================================
async function loadEditingProductImages(productId) {
  editingProductImages = [];
  
  if (!productId) {
    renderEditingProductImages();
    return;
  }
  
  try {
    const { data } = await db
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    
    editingProductImages = (data || []).map(img => ({
      id: img.id,
      image_url: img.image_url,
      isNew: false
    }));
    
    renderEditingProductImages();
  } catch (err) {
    console.error('Load editing images error:', err);
  }
}

function renderEditingProductImages() {
  const container = document.getElementById('imagePreviewGrid');
  if (!container) return;
  
  if (editingProductImages.length === 0) {
    container.innerHTML = '<p style="color:#a3a3a3; font-size:0.8rem; grid-column:1/-1;">Hakuna picha za ziada bado</p>';
    return;
  }
  
  container.innerHTML = editingProductImages.map((img, i) => `
    <div class="image-preview-item">
      <img src="${esc(img.image_url)}" onerror="this.src='https://via.placeholder.com/90'">
      <button type="button" class="image-preview-remove" onclick="removeEditingImage(${i})" title="Ondoa">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function removeEditingImage(index) {
  editingProductImages.splice(index, 1);
  renderEditingProductImages();
}

function handleImageFiles(files) {
  if (!files || files.length === 0) return;
  
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      toast(`${file.name} ni kubwa mno (max 5MB)`, 'error');
      continue;
    }
    
    const objectUrl = URL.createObjectURL(file);
    editingProductImages.push({
      image_url: objectUrl,
      file: file,
      isNew: true
    });
  }
  
  renderEditingProductImages();
  const multiInput = document.getElementById('ap_multi_images');
  if (multiInput) multiInput.value = '';
}

async function uploadNewImages(productId) {
  const newImages = editingProductImages.filter(img => img.isNew && img.file);
  
  for (let i = 0; i < newImages.length; i++) {
    const img = newImages[i];
    
    try {
      const fileName = `${Date.now()}-${i}-${img.file.name.replace(/\s/g, '-')}`;
      const { data: uploadData, error: uploadError } = await db.storage
        .from('product-images')
        .upload(fileName, img.file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = db.storage
        .from('product-images')
        .getPublicUrl(fileName);
      
      await db.from('product_images').insert([{
        product_id: productId,
        image_url: urlData.publicUrl,
        sort_order: i
      }]);
      
    } catch (err) {
      console.error('Upload error:', err);
      toast(`Picha ${i + 1} haikupakiwa: ${err.message}`, 'error');
    }
  }
}

async function deleteOldImages(productId) {
  const { data: dbImages } = await db
    .from('product_images')
    .select('id')
    .eq('product_id', productId);
  
  const keptIds = editingProductImages
    .filter(img => !img.isNew && img.id)
    .map(img => img.id);
  
  const toDelete = (dbImages || [])
    .filter(img => !keptIds.includes(img.id))
    .map(img => img.id);
  
  if (toDelete.length > 0) {
    await db.from('product_images').delete().in('id', toDelete);
  }
}

// ============================================
// ADMIN: UPDATE ORDER STATUS
// ============================================
async function updateOrderStatus(orderId, status) {
  if (!requireAdmin()) return;
  
  const { error } = await db.from('orders').update({ status }).eq('id', orderId);
  if (error) return toast(error.message, 'error');
  toast('Order updated', 'success');
}

// ============================================
// AWAMU 3: ADMIN MANAGEMENT (Coupons & Shipping)
// ============================================

// --------------------------------------------------
// COUPONS
// --------------------------------------------------
async function loadAdminCoupons() {
  if (!requireAdmin()) return;
  
  const tbody = document.getElementById('adminCouponsTable');
  try {
    const { data, error } = await db
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#a3a3a3;">No coupons</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(c => `
      <tr>
        <td><strong>${esc(c.code)}</strong><br><span style="font-size:0.7rem;color:#a3a3a3;">${esc(c.description || '')}</span></td>
        <td>${c.discount_type === 'percent' ? c.discount_value + '%' : fmtPrice(c.discount_value)}</td>
        <td>${c.min_order > 0 ? fmtPrice(c.min_order) : '—'}</td>
        <td>${c.used_count || 0} ${c.max_uses ? '/ ' + c.max_uses : ''}</td>
        <td><span class="status-badge ${c.is_active ? 'status-active' : 'status-inactive'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn-action edit" onclick="editAdminCoupon(${c.id})" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="btn-action delete" onclick="deleteAdminCoupon(${c.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Load coupons error:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</td></tr>';
  }
}

function openAdminCoupon() {
  if (!requireAdmin()) return;
  
  document.getElementById('ac_id').value = '';
  document.getElementById('ac_code').value = '';
  document.getElementById('ac_desc').value = '';
  document.getElementById('ac_type').value = 'percent';
  document.getElementById('ac_value').value = '';
  document.getElementById('ac_min_order').value = '0';
  document.getElementById('ac_max_uses').value = '';
  document.getElementById('ac_active').checked = true;
  
  document.getElementById('adminCouponTitle').textContent = 'Add Coupon';
  document.getElementById('adminCouponModal').classList.add('show');
}

async function editAdminCoupon(id) {
  if (!requireAdmin()) return;
  
  const { data: c, error } = await db.from('coupons').select('*').eq('id', id).single();
  if (error) return toast(error.message, 'error');
  if (!c) return;
  
  document.getElementById('ac_id').value = c.id;
  document.getElementById('ac_code').value = c.code || '';
  document.getElementById('ac_desc').value = c.description || '';
  document.getElementById('ac_type').value = c.discount_type || 'percent';
  document.getElementById('ac_value').value = c.discount_value || '';
  document.getElementById('ac_min_order').value = c.min_order || '0';
  document.getElementById('ac_max_uses').value = c.max_uses || '';
  document.getElementById('ac_active').checked = c.is_active !== false;
  
  document.getElementById('adminCouponTitle').textContent = 'Edit Coupon ' + c.code;
  document.getElementById('adminCouponModal').classList.add('show');
}

async function saveAdminCoupon() {
  if (!requireAdmin()) return;
  
  const id = document.getElementById('ac_id').value;
  const code = document.getElementById('ac_code').value.trim().toUpperCase();
  const type = document.getElementById('ac_type').value;
  const value = parseFloat(document.getElementById('ac_value').value) || 0;
  
  if (!code) { toast('Jaza coupon code', 'error'); return; }
  if (value <= 0) { toast('Discount value lazima iwe zaidi ya 0', 'error'); return; }
  
  const payload = {
    code: code,
    description: document.getElementById('ac_desc').value.trim() || null,
    discount_type: type,
    discount_value: value,
    min_order: parseFloat(document.getElementById('ac_min_order').value) || 0,
    max_uses: parseInt(document.getElementById('ac_max_uses').value) || null,
    is_active: document.getElementById('ac_active').checked
  };
  
  try {
    let error;
    if (id) {
      const { error: err } = await db.from('coupons').update(payload).eq('id', id);
      error = err;
    } else {
      const { error: err } = await db.from('coupons').insert([payload]);
      error = err;
    }
    if (error) throw error;
    
    toast(id ? 'Coupon updated' : 'Coupon added', 'success');
    closeM('adminCouponModal');
    loadAdminCoupons();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAdminCoupon(id) {
  if (!requireAdmin()) return;
  if (!confirm('Delete this coupon?')) return;
  
  const { error } = await db.from('coupons').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Coupon deleted', 'success');
  loadAdminCoupons();
}


// --------------------------------------------------
// SHIPPING ZONES
// --------------------------------------------------
async function loadAdminShipping() {
  if (!requireAdmin()) return;
  
  const tbody = document.getElementById('adminShippingTable');
  try {
    const { data, error } = await db
      .from('shipping_zones')
      .select('*')
      .order('fee', { ascending: true });
      
    if (error) throw error;
    
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#a3a3a3;">No shipping zones</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(z => `
      <tr>
        <td><strong>${esc(z.name)}</strong></td>
        <td>${fmtPrice(z.fee)}</td>
        <td>${esc(z.eta_days || '—')}</td>
        <td><span class="status-badge ${z.is_active ? 'status-active' : 'status-inactive'}">${z.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn-action edit" onclick="editAdminShipping(${z.id})" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="btn-action delete" onclick="deleteAdminShipping(${z.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Load shipping error:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</td></tr>';
  }
}

function openAdminShipping() {
  if (!requireAdmin()) return;
  
  document.getElementById('as_id').value = '';
  document.getElementById('as_name').value = '';
  document.getElementById('as_fee').value = '0';
  document.getElementById('as_eta').value = '';
  document.getElementById('as_active').checked = true;
  
  document.getElementById('adminShippingTitle').textContent = 'Add Shipping Zone';
  document.getElementById('adminShippingModal').classList.add('show');
}

async function editAdminShipping(id) {
  if (!requireAdmin()) return;
  
  const { data: z, error } = await db.from('shipping_zones').select('*').eq('id', id).single();
  if (error) return toast(error.message, 'error');
  if (!z) return;
  
  document.getElementById('as_id').value = z.id;
  document.getElementById('as_name').value = z.name || '';
  document.getElementById('as_fee').value = z.fee || 0;
  document.getElementById('as_eta').value = z.eta_days || '';
  document.getElementById('as_active').checked = z.is_active !== false;
  
  document.getElementById('adminShippingTitle').textContent = 'Edit Shipping Zone';
  document.getElementById('adminShippingModal').classList.add('show');
}

async function saveAdminShipping() {
  if (!requireAdmin()) return;
  
  const id = document.getElementById('as_id').value;
  const name = document.getElementById('as_name').value.trim();
  const fee = parseFloat(document.getElementById('as_fee').value) || 0;
  
  if (!name) { toast('Jaza jina la eneo', 'error'); return; }
  
  const payload = {
    name: name,
    fee: fee,
    eta_days: document.getElementById('as_eta').value.trim() || null,
    is_active: document.getElementById('as_active').checked
  };
  
  try {
    let error;
    if (id) {
      const { error: err } = await db.from('shipping_zones').update(payload).eq('id', id);
      error = err;
    } else {
      const { error: err } = await db.from('shipping_zones').insert([payload]);
      error = err;
    }
    if (error) throw error;
    
    toast(id ? 'Shipping zone updated' : 'Shipping zone added', 'success');
    closeM('adminShippingModal');
    loadAdminShipping();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAdminShipping(id) {
  if (!requireAdmin()) return;
  if (!confirm('Delete this shipping zone?')) return;
  
  const { error } = await db.from('shipping_zones').delete().eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Shipping zone deleted', 'success');
  loadAdminShipping();
}

// ============================================
// AWAMU 4: ADMIN REPORTS & CUSTOMERS
// ============================================

// --------------------------------------------------
// REPORTS (Monthly)
// --------------------------------------------------
async function loadAdminReports() {
  if (!requireAdmin()) return;
  
  const monthInput = document.getElementById('reportMonth');
  if (!monthInput.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    monthInput.value = `${y}-${m}`;
  }
  
  const monthStr = monthInput.value;
  const start = new Date(monthStr + '-01T00:00:00');
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  
  try {
    const { data: orders, error } = await db
      .from('orders')
      .select('*')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
      
    if (error) throw error;
    
    const revenue = (orders || [])
      .filter(o => o.status === 'paid' || o.status === 'shipped' || o.status === 'delivered')
      .reduce((s, o) => s + (o.total_amount || 0), 0);
      
    const paidOrders = (orders || []).filter(o => ['paid', 'shipped', 'delivered'].includes(o.status));
    const avg = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
    
    document.getElementById('rpRevenue').textContent = fmtPrice(revenue);
    document.getElementById('rpOrders').textContent = paidOrders.length;
    document.getElementById('rpAvg').textContent = fmtPrice(avg);
    
    // Top Selling Products
    if (paidOrders.length > 0) {
      const orderIds = paidOrders.map(o => o.id);
      const { data: items } = await db.from('order_items').select('*').in('order_id', orderIds);
      
      const prodMap = {};
      (items || []).forEach(i => {
        if (!prodMap[i.product_name]) prodMap[i.product_name] = { qty: 0, revenue: 0 };
        prodMap[i.product_name].qty += i.quantity;
        prodMap[i.product_name].revenue += i.quantity * i.price;
      });
      
      const top = Object.entries(prodMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);
      const tbody = document.getElementById('tTopSellingProducts');
      
      tbody.innerHTML = top.length === 0 
        ? '<tr><td colspan="4" style="text-align:center;padding:2rem;color:#a3a3a3;">No sales</td></tr>'
        : top.map(([name, d], i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(name)}</td>
              <td>${d.qty}</td>
              <td>${fmtPrice(d.revenue)}</td>
            </tr>
          `).join('');
    } else {
      document.getElementById('tTopSellingProducts').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:#a3a3a3;">No sales</td></tr>';
    }
    
    // Top Customers
    const custMap = {};
    paidOrders.forEach(o => {
      if (!custMap[o.customer_email]) custMap[o.customer_email] = { name: o.customer_name, orders: 0, total: 0 };
      custMap[o.customer_email].orders++;
      custMap[o.customer_email].total += o.total_amount || 0;
    });
    
    const topCust = Object.entries(custMap).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
    const custTbody = document.getElementById('tTopCustomers');
    
    custTbody.innerHTML = topCust.length === 0
      ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#a3a3a3;">No customers</td></tr>'
      : topCust.map(([email, d], i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(d.name)}</td>
            <td>${esc(email)}</td>
            <td>${d.orders}</td>
            <td>${fmtPrice(d.total)}</td>
          </tr>
        `).join('');
        
  } catch (err) {
    console.error('Load reports error:', err);
    toast(err.message, 'error');
  }
}

// --------------------------------------------------
// CUSTOMERS
// --------------------------------------------------
async function loadAdminCustomers() {
  if (!requireAdmin()) return;
  
  const tbody = document.getElementById('adminCustomersTable');
  try {
    const { data: profiles, error } = await db
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    // Chukua orders za kila mteja
    const { data: orders } = await db.from('orders').select('user_id, customer_email, total_amount, status');
    
    const orderStats = {};
    (orders || []).forEach(o => {
      const key = o.user_id || o.customer_email;
      if (!key) return;
      if (!orderStats[key]) orderStats[key] = { count: 0, spent: 0 };
      orderStats[key].count++;
      if (['paid', 'shipped', 'delivered'].includes(o.status)) {
        orderStats[key].spent += o.total_amount || 0;
      }
    });
    
    if (!profiles || profiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#a3a3a3;">No customers yet</td></tr>';
      return;
    }
    
    tbody.innerHTML = profiles.map((u, i) => {
      const stats = orderStats[u.id] || { count: 0, spent: 0 };
      return `
        <tr>
          <td>${i + 1}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div class="avatar">${initials(u.full_name || u.email || '?')}</div>
              <strong>${esc(u.full_name || 'Guest')}</strong>
            </div>
          </td>
          <td>${esc(u.email || '—')}</td>
          <td><span class="status-badge ${u.role === 'admin' ? 'status-active' : 'status-inactive'}">${u.role || 'customer'}</span></td>
          <td>${stats.count}</td>
          <td>${fmtPrice(stats.spent)}</td>
        </tr>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Load customers error:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#ef4444;">Error: ' + esc(err.message) + '</td></tr>';
  }
}

// ============================================
// AWAMU 8: EXPORT CSV
// ============================================
function exportReportToCSV() {
  if (!requireAdmin()) return;
  
  const monthInput = document.getElementById('reportMonth');
  const month = monthInput.value || 'report';
  
  const revenue = document.getElementById('rpRevenue').textContent;
  const orders = document.getElementById('rpOrders').textContent;
  const avg = document.getElementById('rpAvg').textContent;
  
  const topProducts = [];
  document.querySelectorAll('#tTopSellingProducts tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 4 && cells[0].textContent !== '#') {
      topProducts.push([
        cells[0].textContent,
        cells[1].textContent,
        cells[2].textContent,
        cells[3].textContent
      ]);
    }
  });
  
  const topCustomers = [];
  document.querySelectorAll('#tTopCustomers tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 5 && cells[0].textContent !== '#') {
      topCustomers.push([
        cells[0].textContent,
        cells[1].textContent,
        cells[2].textContent,
        cells[3].textContent,
        cells[4].textContent
      ]);
    }
  });
  
  const lines = [];
  lines.push(`Ripoti ya Mauzo - ${month}`);
  lines.push('');
  lines.push(`Mapato,${revenue}`);
  lines.push(`Oda,${orders}`);
  lines.push(`Wastani,${avg}`);
  lines.push('');
  lines.push('BIDHAA ZINAZOUZA ZAIDI');
  lines.push('#,Bidhaa,Idadi,Mapato');
  topProducts.forEach(row => lines.push(row.join(',')));
  lines.push('');
  lines.push('WATEJA WANAONUNUA ZAIDI');
  lines.push('#,Mteja,Email,Oda,Jumla');
  topCustomers.forEach(row => lines.push(row.join(',')));
  
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stylehub-report-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  toast('CSV imepakuliwa!', 'success');
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initHeroSlider();
  loadDarkMode();
  initAuth();
  loadData();
  console.log('✅ StyleHub loaded successfully');
});
