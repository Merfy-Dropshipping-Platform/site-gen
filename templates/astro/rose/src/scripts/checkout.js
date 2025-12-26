/**
 * Checkout page logic
 * Управление шагами оформления заказа
 */

import { CheckoutAPI } from './checkout-api.js';

class CheckoutFlow {
  constructor() {
    this.cartId = null;
    this.orderId = null;
    this.productId = null;
    this.product = null;
    this.cart = null;
    this.currentStep = 1;

    this.init();
  }

  async init() {
    // Получить productId из URL
    const params = new URLSearchParams(window.location.search);
    this.productId = params.get('productId');

    if (!this.productId) {
      this.showError('Товар не выбран', 'Вернитесь в каталог и выберите товар');
      return;
    }

    try {
      // Загрузить данные товара из products.json
      const productsRes = await fetch('/data/products.json');
      const products = await productsRes.json();
      this.product = products.find(
        (p) => p.id === this.productId || p.slug === this.productId
      );

      if (!this.product) {
        this.showError('Товар не найден', 'Возможно, товар больше не доступен');
        return;
      }

      // Показать информацию о товаре
      this.renderProductSummary();

      // Создать корзину и добавить товар
      await this.initCart();

      // Привязать обработчики
      this.bindEvents();
    } catch (e) {
      console.error('Checkout init error:', e);
      this.showError('Ошибка загрузки', e.message || 'Попробуйте обновить страницу');
    }
  }

  async initCart() {
    // Создать корзину
    const cartRes = await CheckoutAPI.createCart();
    if (!cartRes.success) {
      throw new Error(cartRes.message || 'Не удалось создать корзину');
    }
    this.cartId = cartRes.data.id;

    // Добавить товар
    const addRes = await CheckoutAPI.addItem(this.cartId, this.product.id, 1);
    if (!addRes.success) {
      throw new Error(addRes.message || 'Не удалось добавить товар');
    }
    this.cart = addRes.data;

    // Установить доставку по умолчанию (самовывоз, 0 руб)
    await CheckoutAPI.setDelivery(this.cartId, 'pickup', 0);
  }

  renderProductSummary() {
    const container = document.getElementById('product-summary');
    const image = this.product.images?.[0];

    container.innerHTML = `
      <div class="product-summary-item">
        ${
          image
            ? `<img src="${image}" alt="${this.product.name}" class="product-summary-image">`
            : `<div class="product-summary-image" style="display: flex; align-items: center; justify-content: center; color: var(--rose-300);">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21,15 16,10 5,21"/>
                </svg>
              </div>`
        }
        <div class="product-summary-info">
          <h3>${this.product.name}</h3>
          <div class="product-summary-price">${this.formatPrice(this.product.price)}</div>
        </div>
      </div>
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

      // 2. Создать платёж
      const returnUrl = `${window.location.origin}/checkout/result?orderId=${this.orderId}`;
      const paymentRes = await CheckoutAPI.createPayment(this.orderId, returnUrl);

      if (!paymentRes.success) {
        throw new Error(paymentRes.message || 'Не удалось создать платёж');
      }

      // 3. Редирект на ЮKassa
      window.location.href = paymentRes.data.confirmationUrl;
    } catch (e) {
      errorEl.textContent = e.message;
      btn.disabled = false;
      loadingEl.style.display = 'none';
      textEl.style.display = 'inline';
    }
  }

  renderOrderSummary() {
    const container = document.getElementById('order-summary');
    const subtotal = this.cart?.subtotalCents ?? this.product.price * 100;
    const delivery = this.cart?.deliveryCostCents ?? 0;
    const total = this.cart?.totalCents ?? subtotal + delivery;

    container.innerHTML = `
      <div class="product-summary-item" style="margin-bottom: 20px;">
        ${
          this.product.images?.[0]
            ? `<img src="${this.product.images[0]}" alt="${this.product.name}" class="product-summary-image" style="width: 60px; height: 60px;">`
            : ''
        }
        <div class="product-summary-info">
          <h3 style="font-size: 1rem;">${this.product.name}</h3>
        </div>
      </div>
      <div class="order-summary-row">
        <span>Товар</span>
        <span>${this.formatPrice(subtotal / 100)}</span>
      </div>
      <div class="order-summary-row">
        <span>Доставка</span>
        <span>${delivery > 0 ? this.formatPrice(delivery / 100) : 'Бесплатно'}</span>
      </div>
      <div class="order-summary-row total">
        <span>Итого</span>
        <span class="price">${this.formatPrice(total / 100)}</span>
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
