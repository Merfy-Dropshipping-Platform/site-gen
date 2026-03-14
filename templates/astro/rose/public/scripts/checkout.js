/**
 * Checkout page logic — Single-page two-column form
 * Replaces old 4-step wizard with Figma-aligned single page
 */

import { CheckoutAPI } from './checkout-api.js';

class CheckoutFlow {
  constructor() {
    this.cartId = null;
    this.orderId = null;
    this.items = [];
    this.cart = null;
    this.deliveryType = 'economy';
    this.deliveryCostCents = 0;
    this.discountCents = 0;
    this.subtotalCents = 0;
    this.submitting = false;

    this.init();
  }

  async init() {
    try {
      // Read cart from localStorage
      const savedCartId = this.getSavedCartId();
      const savedItems = this.getSavedCartItems();

      if (savedCartId) {
        const cartRes = await CheckoutAPI.getCart(savedCartId);
        const cartData = cartRes.data?.cart || cartRes.data;
        const cartItems = cartRes.data?.items || cartData?.items || [];

        if (cartRes.success && cartItems.length > 0) {
          this.cartId = savedCartId;
          this.cart = cartData;
          this.items = cartItems.map(item => ({
            id: item.id,
            productId: item.productId,
            name: item.name || item.productName || 'Товар',
            imageUrl: item.imageUrl || (item.images && item.images[0]) || item.image || '',
            unitPriceCents: item.unitPriceCents || item.priceCents || item.price || 0,
            compareAtPriceCents: item.compareAtPriceCents || 0,
            quantity: item.quantity || 1,
            variants: item.variants || {},
          }));
          this.discountCents = cartData?.discountCents || 0;
          this.deliveryCostCents = cartData?.deliveryCostCents || 0;
          this.renderProducts();
          this.recalcTotals();
          this.bindEvents();
          // Set default delivery
          await CheckoutAPI.setDelivery(this.cartId, 'economy', 0).catch(() => {});
          return;
        }
      }

      // Fallback: try localStorage items
      if (savedItems && savedItems.length > 0) {
        const cartRes = await CheckoutAPI.createCart();
        if (!cartRes.success) throw new Error('Не удалось создать корзину');
        this.cartId = cartRes.data.id;

        for (const item of savedItems) {
          await CheckoutAPI.addItem(this.cartId, item.productId || item.id, item.quantity || 1);
        }
        // Re-fetch cart to get server items
        const refreshed = await CheckoutAPI.getCart(this.cartId);
        if (refreshed.success) {
          const cartData = refreshed.data?.cart || refreshed.data;
          const cartItems = refreshed.data?.items || cartData?.items || [];
          this.cart = cartData;
          this.items = cartItems.map(item => ({
            id: item.id,
            productId: item.productId,
            name: item.name || item.productName || 'Товар',
            imageUrl: item.imageUrl || (item.images && item.images[0]) || item.image || '',
            unitPriceCents: item.unitPriceCents || item.priceCents || item.price || 0,
            compareAtPriceCents: item.compareAtPriceCents || 0,
            quantity: item.quantity || 1,
            variants: item.variants || {},
          }));
        }
        this.renderProducts();
        this.recalcTotals();
        this.bindEvents();
        await CheckoutAPI.setDelivery(this.cartId, 'economy', 0).catch(() => {});
        return;
      }

      // No cart — redirect to cart page
      window.location.href = '/cart';
    } catch (e) {
      console.error('Checkout init error:', e);
      this.showError(e.message || 'Не удалось загрузить корзину');
    }
  }

  getSavedCartId() {
    try { return localStorage.getItem('merfy_cart_id') || null; } catch { return null; }
  }

  getSavedCartItems() {
    try {
      const raw = localStorage.getItem('merfy_cart_items');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  clearSavedCart() {
    try {
      localStorage.removeItem('merfy_cart_id');
      localStorage.removeItem('merfy_cart_items');
    } catch {}
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: [] } }));
  }

  // ---- Render products in right panel ----
  renderProducts() {
    const container = document.getElementById('co-product-list');
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = '<p class="font-body" style="color: rgb(var(--color-muted));">Корзина пуста</p>';
      return;
    }

    container.innerHTML = this.items.map(item => {
      const imgSrc = item.imageUrl || '';
      const imgHtml = imgSrc
        ? `<img src="${this.esc(imgSrc)}" alt="${this.esc(item.name)}" class="checkout-product-img">`
        : `<div class="checkout-product-img" style="display:flex;align-items:center;justify-content:center;color:rgb(var(--color-muted));"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg></div>`;

      const variantsHtml = Object.entries(item.variants || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `<div class="checkout-product-variant"><span class="checkout-product-variant-label font-body">${this.esc(k)}:</span> <span class="checkout-product-variant-value font-body">${this.esc(String(v))}</span></div>`)
        .join('');

      const oldPriceHtml = item.compareAtPriceCents && item.compareAtPriceCents > item.unitPriceCents
        ? `<span class="checkout-product-price-old font-body">${this.formatPrice(item.compareAtPriceCents)}</span>`
        : '';

      return `
        <div class="checkout-product-item">
          <div class="checkout-product-img-wrap">
            ${imgHtml}
            ${item.quantity > 1 ? `<div class="checkout-product-counter font-body">${item.quantity}</div>` : ''}
          </div>
          <div class="checkout-product-info">
            <div>
              <div class="checkout-product-name font-body">${this.esc(item.name)}</div>
              ${variantsHtml ? `<div class="checkout-product-variants">${variantsHtml}</div>` : ''}
            </div>
            <div class="checkout-product-price">
              <span class="checkout-product-price-current font-body">${this.formatPrice(item.unitPriceCents * item.quantity)}</span>
              ${oldPriceHtml}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ---- Totals ----
  recalcTotals() {
    this.subtotalCents = this.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    const total = this.subtotalCents - this.discountCents + this.deliveryCostCents;

    const deliveryEl = document.getElementById('co-delivery-cost');
    if (deliveryEl) {
      deliveryEl.textContent = this.deliveryCostCents > 0 ? this.formatPrice(this.deliveryCostCents) : 'Бесплатно';
    }

    const discountRow = document.getElementById('co-discount-row');
    const discountVal = document.getElementById('co-discount-value');
    if (discountRow && discountVal) {
      if (this.discountCents > 0) {
        discountRow.style.display = 'flex';
        discountVal.textContent = `-${this.formatPrice(this.discountCents)}`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    const totalEl = document.getElementById('co-total');
    if (totalEl) totalEl.textContent = this.formatPrice(Math.max(0, total));
  }

  // ---- Events ----
  bindEvents() {
    // Delivery option selection
    const deliveryOptions = document.querySelectorAll('.checkout-shipping-option');
    deliveryOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        deliveryOptions.forEach(o => o.classList.remove('checkout-shipping-option--selected'));
        opt.classList.add('checkout-shipping-option--selected');
        const radio = opt.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        this.deliveryType = opt.dataset.delivery || 'economy';
        this.deliveryCostCents = parseInt(opt.dataset.cost || '0', 10);
        this.recalcTotals();
      });
    });

    // Promo code
    const applyBtn = document.getElementById('co-btn-apply-promo');
    if (applyBtn) applyBtn.addEventListener('click', () => this.applyPromo());

    const promoInput = document.getElementById('co-promo-input');
    if (promoInput) promoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.applyPromo(); }
    });

    const removeBtn = document.getElementById('co-btn-remove-promo');
    if (removeBtn) removeBtn.addEventListener('click', () => this.removePromo());

    // Submit
    const submitBtn = document.getElementById('co-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', () => this.handleSubmit());
  }

  // ---- Promo ----
  async applyPromo() {
    const input = document.getElementById('co-promo-input');
    const errorEl = document.getElementById('co-promo-error');
    const code = input?.value?.trim();
    if (!code || !this.cartId) return;

    try {
      const res = await CheckoutAPI.applyPromo(this.cartId, code);
      if (!res.success) throw new Error(res.message || 'Промокод недействителен');
      this.cart = res.data;
      this.discountCents = res.data?.discountCents || 0;
      this.updatePromoUI();
      this.recalcTotals();
    } catch (e) {
      if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
    }
  }

  async removePromo() {
    if (!this.cartId) return;
    try {
      const res = await CheckoutAPI.removePromo(this.cartId);
      if (res.success) {
        this.cart = res.data;
        this.discountCents = 0;
        this.updatePromoUI();
        this.recalcTotals();
      }
    } catch {}
  }

  updatePromoUI() {
    const inputRow = document.getElementById('co-promo-input-row');
    const applied = document.getElementById('co-promo-applied');
    const errorEl = document.getElementById('co-promo-error');
    const codeEl = document.getElementById('co-promo-code');
    const input = document.getElementById('co-promo-input');

    if (errorEl) errorEl.style.display = 'none';

    if (this.cart?.promoCode && this.discountCents > 0) {
      if (inputRow) inputRow.style.display = 'none';
      if (applied) applied.style.display = 'flex';
      if (codeEl) codeEl.textContent = `${this.cart.promoCode} — скидка ${this.formatPrice(this.discountCents)}`;
    } else {
      if (inputRow) inputRow.style.display = 'flex';
      if (applied) applied.style.display = 'none';
      if (input) input.value = '';
    }
  }

  // ---- Submit (single page) ----
  async handleSubmit() {
    if (this.submitting) return;

    const errorEl = document.getElementById('co-error');
    const btn = document.getElementById('co-submit-btn');
    const btnText = btn?.querySelector('.co-btn-text');
    const btnLoading = btn?.querySelector('.co-btn-loading');

    // Validate
    const fields = {
      email: document.getElementById('co-email'),
      phone: document.getElementById('co-phone'),
      firstName: document.getElementById('co-firstName'),
      lastName: document.getElementById('co-lastName'),
      address: document.getElementById('co-address'),
      city: document.getElementById('co-city'),
    };

    // Clear errors
    Object.values(fields).forEach(f => f?.classList?.remove('checkout-input--error'));
    if (errorEl) errorEl.style.display = 'none';

    // Check required
    const missing = [];
    for (const [name, el] of Object.entries(fields)) {
      if (!el?.value?.trim()) {
        el?.classList?.add('checkout-input--error');
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      if (errorEl) { errorEl.textContent = 'Заполните обязательные поля'; errorEl.style.display = 'block'; }
      return;
    }

    // Email format
    const emailVal = fields.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      fields.email.classList.add('checkout-input--error');
      if (errorEl) { errorEl.textContent = 'Введите корректный email'; errorEl.style.display = 'block'; }
      return;
    }

    // Start submit
    this.submitting = true;
    if (btn) btn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoading) btnLoading.style.display = 'inline';

    try {
      const customerName = `${fields.firstName.value.trim()} ${fields.lastName.value.trim()}`.trim();
      const country = document.getElementById('co-country')?.value?.trim() || 'Россия';
      const postalCode = document.getElementById('co-postalCode')?.value?.trim() || '';

      // 1. Set customer
      const custRes = await CheckoutAPI.setCustomer(this.cartId, {
        email: emailVal,
        phone: fields.phone.value.trim(),
        name: customerName,
      });
      if (!custRes.success) throw new Error(custRes.message || 'Ошибка сохранения контактов');

      // 2. Set address
      const addrRes = await CheckoutAPI.setAddress(this.cartId, {
        country,
        city: fields.city.value.trim(),
        street: fields.address.value.trim(),
        building: '',
        postalCode,
      });
      if (!addrRes.success) throw new Error(addrRes.message || 'Ошибка сохранения адреса');

      // 3. Set delivery
      const delRes = await CheckoutAPI.setDelivery(this.cartId, this.deliveryType, this.deliveryCostCents);
      if (!delRes.success) throw new Error(delRes.message || 'Ошибка установки доставки');

      // 4. Checkout
      const checkoutRes = await CheckoutAPI.checkout(this.cartId);
      if (!checkoutRes.success) throw new Error(checkoutRes.message || 'Не удалось оформить заказ');
      this.orderId = checkoutRes.data.id;

      // 5. Clear cart
      this.clearSavedCart();

      // 6. Create payment
      const returnUrl = `${window.location.origin}/checkout/result?orderId=${this.orderId}`;
      const paymentRes = await CheckoutAPI.createPayment(this.orderId, returnUrl);
      if (!paymentRes.success) throw new Error(paymentRes.message || 'Сервис оплаты временно недоступен');

      // 7. Redirect to YooKassa
      window.location.href = paymentRes.data.confirmationUrl;
    } catch (e) {
      if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
      this.submitting = false;
      if (btn) btn.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (btnLoading) btnLoading.style.display = 'none';
    }
  }

  showError(msg) {
    const errorEl = document.getElementById('co-error');
    if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
  }

  formatPrice(cents) {
    const rub = Math.round(cents / 100);
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 }).format(rub);
  }

  esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

// Init
new CheckoutFlow();
