/**
 * Checkout page logic
 * Управление шагами оформления заказа
 * Поддерживает два режима:
 *   1. Корзина (cartId из localStorage) — multi-item
 *   2. Одиночный товар (?productId из URL) — backward compat
 */

import { CheckoutAPI } from './checkout-api.js';

class CheckoutFlow {
  constructor() {
    this.cartId = null;
    this.orderId = null;
    this.items = []; // [{name, imageUrl, unitPriceCents, quantity, id, productId}]
    this.cart = null;
    this.currentStep = 1;

    this.init();
  }

  async init() {
    try {
      // Режим 1: Существующая корзина из localStorage
      const savedCartId = this.getSavedCartId();
      if (savedCartId) {
        const cartRes = await CheckoutAPI.getCart(savedCartId);
        if (cartRes.success && cartRes.data && cartRes.data.items && cartRes.data.items.length > 0) {
          this.cartId = savedCartId;
          this.cart = cartRes.data;
          this.items = cartRes.data.items.map(item => ({
            id: item.id,
            productId: item.productId,
            name: item.name || item.productName || 'Товар',
            imageUrl: item.imageUrl || (item.images && item.images[0]) || item.image || '',
            unitPriceCents: item.unitPriceCents || item.priceCents || item.price || 0,
            quantity: item.quantity || 1,
          }));
          this.renderProductSummary();
          this.bindEvents();
          // Установить доставку по умолчанию
          await CheckoutAPI.setDelivery(this.cartId, 'pickup', 0);
          return;
        }
      }

      // Режим 2: Одиночный товар из URL
      const params = new URLSearchParams(window.location.search);
      const productId = params.get('productId');

      if (!productId) {
        this.showError('Корзина пуста', 'Добавьте товары в корзину или выберите товар в каталоге');
        return;
      }

      // Загрузить данные товара из products.json
      const productsRes = await fetch('/data/products.json');
      const products = await productsRes.json();
      const product = products.find(
        (p) => p.id === productId || p.slug === productId
      );

      if (!product) {
        this.showError('Товар не найден', 'Возможно, товар больше не доступен');
        return;
      }

      // Создать корзину и добавить товар
      const cartRes = await CheckoutAPI.createCart();
      if (!cartRes.success) {
        throw new Error(cartRes.message || 'Не удалось создать корзину');
      }
      this.cartId = cartRes.data.id;

      const addRes = await CheckoutAPI.addItem(this.cartId, product.id, 1);
      if (!addRes.success) {
        throw new Error(addRes.message || 'Не удалось добавить товар');
      }
      this.cart = addRes.data;

      this.items = [{
        id: null,
        productId: product.id,
        name: product.name,
        imageUrl: product.images?.[0] || '',
        unitPriceCents: product.price * 100,
        quantity: 1,
      }];

      // Установить доставку по умолчанию
      await CheckoutAPI.setDelivery(this.cartId, 'pickup', 0);

      this.renderProductSummary();
      this.bindEvents();
    } catch (e) {
      console.error('Checkout init error:', e);
      this.showError('Ошибка загрузки', e.message || 'Попробуйте обновить страницу');
    }
  }

  getSavedCartId() {
    try {
      return localStorage.getItem('merfy_cart_id') || null;
    } catch (e) {
      return null;
    }
  }

  clearSavedCart() {
    try {
      localStorage.removeItem('merfy_cart_id');
      localStorage.removeItem('merfy_cart_items');
    } catch (e) {
      // ignore
    }
    // Notify cart components
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: [] } }));
  }

  renderProductSummary() {
    const container = document.getElementById('product-summary');

    if (this.items.length === 0) {
      container.innerHTML = '<p class="text-gray-500">Корзина пуста</p>';
      return;
    }

    const itemsHtml = this.items.map(item => {
      const imgHtml = item.imageUrl
        ? `<img src="${item.imageUrl}" alt="${item.name}" class="product-summary-image">`
        : `<div class="product-summary-image" style="display: flex; align-items: center; justify-content: center; color: var(--rose-300);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21,15 16,10 5,21"/>
            </svg>
          </div>`;

      const qtyLabel = item.quantity > 1 ? ` × ${item.quantity}` : '';
      const lineTotal = item.unitPriceCents * item.quantity;

      return `
        <div class="product-summary-item" style="margin-bottom: 12px;">
          ${imgHtml}
          <div class="product-summary-info" style="flex: 1;">
            <h3>${item.name}${qtyLabel}</h3>
            <div class="product-summary-price">${this.formatPrice(lineTotal / 100)}</div>
          </div>
        </div>`;
    }).join('');

    const subtotal = this.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

    container.innerHTML = `
      ${itemsHtml}
      ${this.items.length > 1 ? `
        <div style="border-top: 1px solid #f3f4f6; margin-top: 8px; padding-top: 12px; display: flex; justify-content: space-between; font-weight: 600;">
          <span>Подытог (${this.items.reduce((s, i) => s + i.quantity, 0)} шт.)</span>
          <span>${this.formatPrice(subtotal / 100)}</span>
        </div>` : ''}
    `;
  }

  bindEvents() {
    // Шаг 1 -> 2
    document.getElementById('btn-to-contacts').addEventListener('click', () => {
      this.goToStep(2);
    });

    // Шаг 2 -> 1
    document.getElementById('btn-back-to-product').addEventListener('click', () => {
      this.goToStep(1);
    });

    // Шаг 2: Контакты
    document.getElementById('customer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('button[type="submit"]');
      const errorEl = document.getElementById('customer-error');

      btn.disabled = true;
      errorEl.textContent = '';

      try {
        const res = await CheckoutAPI.setCustomer(this.cartId, {
          email: form.email.value.trim(),
          phone: form.phone.value.trim(),
          name: form.name.value.trim() || undefined,
        });

        if (!res.success) {
          throw new Error(res.message || 'Ошибка сохранения');
        }

        this.cart = res.data;
        this.goToStep(3);
      } catch (e) {
        errorEl.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });

    // Шаг 3 -> 2
    document.getElementById('btn-back-to-contacts').addEventListener('click', () => {
      this.goToStep(2);
    });

    // Шаг 3: Адрес
    document.getElementById('address-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('button[type="submit"]');
      const errorEl = document.getElementById('address-error');

      btn.disabled = true;
      errorEl.textContent = '';

      try {
        const res = await CheckoutAPI.setAddress(this.cartId, {
          city: form.city.value.trim(),
          street: form.street.value.trim(),
          building: form.building.value.trim(),
          apartment: form.apartment.value.trim() || undefined,
          postalCode: form.postalCode.value.trim() || undefined,
        });

        if (!res.success) {
          throw new Error(res.message || 'Ошибка сохранения');
        }

        this.cart = res.data;
        this.renderOrderSummary();
        this.goToStep(4);
      } catch (e) {
        errorEl.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });

    // Шаг 4 -> 3
    document.getElementById('btn-back-to-address').addEventListener('click', () => {
      this.goToStep(3);
    });

    // Шаг 4: Оплата
    document.getElementById('btn-pay').addEventListener('click', async () => {
      await this.processPayment();
    });

    // Промокод
    document.getElementById('btn-apply-promo').addEventListener('click', () => {
      this.applyPromo();
    });

    document.getElementById('promo-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyPromo();
      }
    });

    document.getElementById('btn-remove-promo').addEventListener('click', () => {
      this.removePromo();
    });
  }

  async processPayment() {
    const btn = document.getElementById('btn-pay');
    const loadingEl = btn.querySelector('.loading');
    const textEl = btn.querySelector('.text');
    const errorEl = document.getElementById('payment-error');

    btn.disabled = true;
    loadingEl.style.display = 'flex';
    textEl.style.display = 'none';
    errorEl.textContent = '';

    try {
      // 1. Оформить заказ
      const checkoutRes = await CheckoutAPI.checkout(this.cartId);
      if (!checkoutRes.success) {
        throw new Error(checkoutRes.message || 'Не удалось оформить заказ');
      }
      this.orderId = checkoutRes.data.id;

      // 2. Очистить корзину в localStorage (заказ уже создан)
      this.clearSavedCart();

      // 3. Создать платёж
      const returnUrl = `${window.location.origin}/checkout/result?orderId=${this.orderId}`;
      const paymentRes = await CheckoutAPI.createPayment(this.orderId, returnUrl);

      if (!paymentRes.success) {
        throw new Error(paymentRes.message || 'Не удалось создать платёж');
      }

      // 4. Редирект на ЮKassa
      window.location.href = paymentRes.data.confirmationUrl;
    } catch (e) {
      errorEl.textContent = e.message;
      btn.disabled = false;
      loadingEl.style.display = 'none';
      textEl.style.display = 'inline';
    }
  }

  async applyPromo() {
    const input = document.getElementById('promo-input');
    const errorEl = document.getElementById('promo-error');
    const btn = document.getElementById('btn-apply-promo');
    const code = input.value.trim();

    if (!code) return;
    if (!this.cartId) {
      errorEl.textContent = 'Корзина ещё не создана';
      errorEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    errorEl.classList.add('hidden');

    try {
      const res = await CheckoutAPI.applyPromo(this.cartId, code);
      if (!res.success) {
        throw new Error(res.message || 'Промокод недействителен');
      }
      this.cart = res.data;
      this.updatePromoUI();
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  }

  async removePromo() {
    if (!this.cartId) return;

    const btn = document.getElementById('btn-remove-promo');
    btn.disabled = true;

    try {
      const res = await CheckoutAPI.removePromo(this.cartId);
      if (!res.success) {
        throw new Error(res.message || 'Не удалось убрать промокод');
      }
      this.cart = res.data;
      this.updatePromoUI();
    } catch (e) {
      const errorEl = document.getElementById('promo-error');
      errorEl.textContent = e.message;
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  }

  updatePromoUI() {
    const inputRow = document.getElementById('promo-input-row');
    const appliedEl = document.getElementById('promo-applied');
    const errorEl = document.getElementById('promo-error');
    const input = document.getElementById('promo-input');

    errorEl.classList.add('hidden');

    if (this.cart?.promoCode) {
      inputRow.classList.add('hidden');
      appliedEl.classList.remove('hidden');
      document.getElementById('promo-applied-code').textContent = this.cart.promoCode;
      const discount = this.cart.discountCents ?? 0;
      document.getElementById('promo-applied-discount').textContent =
        discount > 0 ? `Скидка: -${this.formatPrice(discount / 100)}` : 'Скидка применена';
    } else {
      inputRow.classList.remove('hidden');
      appliedEl.classList.add('hidden');
      input.value = '';
    }
  }

  renderOrderSummary() {
    const container = document.getElementById('order-summary');
    const subtotal = this.cart?.subtotalCents ?? this.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    const delivery = this.cart?.deliveryCostCents ?? 0;
    const discount = this.cart?.discountCents ?? 0;
    const total = this.cart?.totalCents ?? subtotal + delivery - discount;

    const itemsHtml = this.items.map(item => {
      const lineTotal = item.unitPriceCents * item.quantity;
      const imgHtml = item.imageUrl
        ? `<img src="${item.imageUrl}" alt="${item.name}" class="product-summary-image" style="width: 60px; height: 60px;">`
        : '';
      const qtyLabel = item.quantity > 1 ? ` × ${item.quantity}` : '';

      return `
        <div class="product-summary-item" style="margin-bottom: 12px;">
          ${imgHtml}
          <div class="product-summary-info">
            <h3 style="font-size: 1rem;">${item.name}${qtyLabel}</h3>
            <div style="font-size: 0.875rem; color: #e11d48; font-weight: 600;">${this.formatPrice(lineTotal / 100)}</div>
          </div>
        </div>`;
    }).join('');

    const discountRow = discount > 0
      ? `<div class="order-summary-row" style="color: #16a34a;">
          <span>Скидка${this.cart?.promoCode ? ` (${this.cart.promoCode})` : ''}</span>
          <span>-${this.formatPrice(discount / 100)}</span>
        </div>`
      : '';

    container.innerHTML = `
      ${itemsHtml}
      <div style="border-top: 1px solid #f3f4f6; margin-top: 8px; padding-top: 12px;">
        <div class="order-summary-row">
          <span>Товары (${this.items.reduce((s, i) => s + i.quantity, 0)} шт.)</span>
          <span>${this.formatPrice(subtotal / 100)}</span>
        </div>
        <div class="order-summary-row">
          <span>Доставка</span>
          <span>${delivery > 0 ? this.formatPrice(delivery / 100) : 'Бесплатно'}</span>
        </div>
        ${discountRow}
        <div class="order-summary-row total">
          <span>Итого</span>
          <span class="price">${this.formatPrice(total / 100)}</span>
        </div>
      </div>
    `;
  }

  goToStep(step) {
    // Скрыть все шаги
    document.querySelectorAll('.checkout-step').forEach((el) => {
      el.classList.remove('active');
    });

    // Показать нужный шаг
    const stepEl = document.querySelector(`.checkout-step[data-step="${step}"]`);
    if (stepEl) {
      stepEl.classList.add('active');
    }

    // Обновить индикатор
    document.querySelectorAll('.step-dot').forEach((el) => {
      const s = parseInt(el.dataset.step, 10);
      el.classList.remove('active', 'completed');
      if (s < step) el.classList.add('completed');
      if (s === step) el.classList.add('active');
    });

    this.currentStep = step;

    // Прокрутить вверх
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showError(title, message) {
    document.getElementById('error-title').textContent = title;
    document.getElementById('error-text').textContent = message;

    // Скрыть все шаги
    document.querySelectorAll('.checkout-step').forEach((el) => {
      el.classList.remove('active');
    });

    // Показать страницу ошибки
    document.querySelector('.checkout-step[data-step="error"]').classList.add('active');

    // Скрыть индикатор шагов
    document.querySelector('.step-indicator').style.display = 'none';
  }

  formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
    }).format(price);
  }
}

// Запуск
new CheckoutFlow();
