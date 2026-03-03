/**
 * Cart Drawer module
 * Slide-out cart panel from the right side
 */

function formatPrice(cents) {
  if (!cents && cents !== 0) return '0 ₽';
  const rub = cents / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(rub);
}

function createDrawerHTML() {
  const div = document.createElement('div');
  div.id = 'cart-drawer-root';
  div.innerHTML = `
    <div id="cart-drawer-backdrop" class="cart-drawer-backdrop" style="display:none;"></div>
    <div id="cart-drawer" class="cart-drawer" style="transform: translateX(100%);">
      <div class="cart-drawer-header">
        <h2 class="cart-drawer-title">Корзина</h2>
        <button id="cart-drawer-close" class="cart-drawer-close" aria-label="Закрыть корзину">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div id="cart-drawer-items" class="cart-drawer-items"></div>
      <div id="cart-drawer-footer" class="cart-drawer-footer" style="display:none;">
        <div class="cart-drawer-subtotal">
          <span>Итого</span>
          <span id="cart-drawer-total" class="cart-drawer-total-value">0 ₽</span>
        </div>
        <a href="/checkout" id="cart-drawer-checkout" class="cart-drawer-checkout-btn">Оформить заказ</a>
        <a href="/catalog" class="cart-drawer-continue">Продолжить покупки</a>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .cart-drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 998;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .cart-drawer-backdrop.open {
      opacity: 1;
    }
    .cart-drawer {
      position: fixed;
      top: 0;
      right: 0;
      width: 100%;
      max-width: 420px;
      height: 100%;
      background: #fff;
      z-index: 999;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -4px 0 24px rgba(0,0,0,0.1);
    }
    .cart-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #f3f4f6;
    }
    .cart-drawer-title {
      font-family: 'Comfortaa', sans-serif;
      font-size: 20px;
      font-weight: 500;
      margin: 0;
    }
    .cart-drawer-close {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: 8px;
      color: #374151;
    }
    .cart-drawer-close:hover {
      background: #f3f4f6;
    }
    .cart-drawer-items {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }
    .cart-drawer-empty {
      text-align: center;
      padding: 48px 0;
      color: #9ca3af;
      font-family: 'Manrope', sans-serif;
    }
    .cart-drawer-empty p {
      margin-bottom: 16px;
      font-size: 16px;
    }
    .cart-drawer-empty a {
      color: #e11d48;
      text-decoration: none;
      font-weight: 500;
    }
    .cart-drawer-empty a:hover {
      text-decoration: underline;
    }
    .cart-drawer-item {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #f3f4f6;
      font-family: 'Manrope', sans-serif;
    }
    .cart-drawer-item:last-child {
      border-bottom: none;
    }
    .cart-drawer-item-img {
      width: 72px;
      height: 72px;
      border-radius: 8px;
      object-fit: cover;
      background: #f3f4f6;
      flex-shrink: 0;
    }
    .cart-drawer-item-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .cart-drawer-item-name {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cart-drawer-item-price {
      font-size: 14px;
      font-weight: 600;
      color: #e11d48;
    }
    .cart-drawer-item-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }
    .cart-drawer-qty-btn {
      width: 28px;
      height: 28px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 16px;
      color: #374151;
      line-height: 1;
    }
    .cart-drawer-qty-btn:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }
    .cart-drawer-qty-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .cart-drawer-qty-val {
      min-width: 28px;
      text-align: center;
      font-size: 14px;
      font-weight: 500;
    }
    .cart-drawer-item-remove {
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      padding: 4px;
      align-self: flex-start;
      flex-shrink: 0;
    }
    .cart-drawer-item-remove:hover {
      color: #ef4444;
    }
    .cart-drawer-footer {
      padding: 16px 24px 24px;
      border-top: 1px solid #f3f4f6;
    }
    .cart-drawer-subtotal {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      font-family: 'Manrope', sans-serif;
      font-size: 16px;
    }
    .cart-drawer-total-value {
      font-weight: 700;
      font-size: 18px;
      color: #111827;
    }
    .cart-drawer-checkout-btn {
      display: block;
      width: 100%;
      padding: 14px;
      background: #e11d48;
      color: #fff;
      text-align: center;
      border-radius: 12px;
      font-family: 'Manrope', sans-serif;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
    }
    .cart-drawer-checkout-btn:hover {
      background: #be123c;
      color: #fff;
    }
    .cart-drawer-continue {
      display: block;
      text-align: center;
      margin-top: 12px;
      color: #6b7280;
      font-family: 'Manrope', sans-serif;
      font-size: 14px;
      text-decoration: none;
    }
    .cart-drawer-continue:hover {
      color: #e11d48;
    }
    body.cart-drawer-open {
      overflow: hidden;
    }
  `;
  document.head.appendChild(style);
}

function renderDrawerItems() {
  const container = document.getElementById('cart-drawer-items');
  const footer = document.getElementById('cart-drawer-footer');
  const totalEl = document.getElementById('cart-drawer-total');
  if (!container) return;

  const items = window.cartStore ? window.cartStore.getItems() : [];

  if (items.length === 0) {
    container.innerHTML = '<div class="cart-drawer-empty"><p>Корзина пуста</p><a href="/catalog">Перейти в каталог</a></div>';
    if (footer) footer.style.display = 'none';
    return;
  }

  container.innerHTML = items.map(function(item) {
    var img = item.imageUrl || (item.images && item.images[0]) || item.image || '';
    var name = item.name || item.productName || 'Товар';
    var price = item.unitPriceCents || item.priceCents || item.price || 0;
    var qty = item.quantity || 1;
    var imgHtml = img
      ? '<img src="' + img + '" alt="' + name + '" class="cart-drawer-item-img" />'
      : '<div class="cart-drawer-item-img" style="display:flex;align-items:center;justify-content:center;color:#d1d5db;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>';

    return '<div class="cart-drawer-item" data-item-id="' + item.id + '">' +
      imgHtml +
      '<div class="cart-drawer-item-info">' +
        '<div class="cart-drawer-item-name">' + name + '</div>' +
        '<div class="cart-drawer-item-price">' + formatPrice(price) + '</div>' +
        '<div class="cart-drawer-item-controls">' +
          '<button class="cart-drawer-qty-btn" data-action="decrease" data-item-id="' + item.id + '"' + (qty <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span class="cart-drawer-qty-val">' + qty + '</span>' +
          '<button class="cart-drawer-qty-btn" data-action="increase" data-item-id="' + item.id + '">+</button>' +
        '</div>' +
      '</div>' +
      '<button class="cart-drawer-item-remove" data-action="remove" data-item-id="' + item.id + '" aria-label="Удалить">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
      '</button>' +
    '</div>';
  }).join('');

  if (footer) footer.style.display = '';
  if (totalEl) {
    var total = window.cartStore ? window.cartStore.getTotal() : 0;
    totalEl.textContent = formatPrice(total);
  }
}

function openDrawer() {
  var backdrop = document.getElementById('cart-drawer-backdrop');
  var drawer = document.getElementById('cart-drawer');
  if (!backdrop || !drawer) return;

  renderDrawerItems();
  backdrop.style.display = 'block';
  // Force reflow for transition
  backdrop.offsetHeight;
  backdrop.classList.add('open');
  drawer.style.transform = 'translateX(0)';
  document.body.classList.add('cart-drawer-open');
}

function closeDrawer() {
  var backdrop = document.getElementById('cart-drawer-backdrop');
  var drawer = document.getElementById('cart-drawer');
  if (!backdrop || !drawer) return;

  backdrop.classList.remove('open');
  drawer.style.transform = 'translateX(100%)';
  document.body.classList.remove('cart-drawer-open');
  setTimeout(function() {
    backdrop.style.display = 'none';
  }, 300);
}

function initDrawer() {
  createDrawerHTML();

  // Close button
  document.getElementById('cart-drawer-close').addEventListener('click', closeDrawer);

  // Backdrop click closes
  document.getElementById('cart-drawer-backdrop').addEventListener('click', closeDrawer);

  // Quantity and remove controls (delegated)
  document.getElementById('cart-drawer-items').addEventListener('click', async function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || !window.cartStore) return;

    var action = btn.getAttribute('data-action');
    var itemId = btn.getAttribute('data-item-id');
    if (!itemId) return;

    btn.disabled = true;

    if (action === 'remove') {
      await window.cartStore.removeItem(itemId);
    } else if (action === 'decrease') {
      var items = window.cartStore.getItems();
      var item = items.find(function(i) { return i.id === itemId; });
      if (item && item.quantity > 1) {
        await window.cartStore.updateQuantity(itemId, item.quantity - 1);
      }
    } else if (action === 'increase') {
      var items = window.cartStore.getItems();
      var item = items.find(function(i) { return i.id === itemId; });
      if (item) {
        await window.cartStore.updateQuantity(itemId, item.quantity + 1);
      }
    }

    btn.disabled = false;
  });

  // ESC key closes
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDrawer();
  });

  // Re-render on cart updates
  document.addEventListener('cart:updated', function() {
    var drawer = document.getElementById('cart-drawer');
    if (drawer && drawer.style.transform === 'translateX(0px)') {
      renderDrawerItems();
    }
  });

  // Cart icon click toggles drawer (intercept header cart link)
  document.addEventListener('click', function(e) {
    var cartLink = e.target.closest('#header-cart-link');
    if (cartLink) {
      e.preventDefault();
      openDrawer();
    }
  });
}

// Init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDrawer);
} else {
  initDrawer();
}

// Export for page-level use
window.cartDrawer = { open: openDrawer, close: closeDrawer };
