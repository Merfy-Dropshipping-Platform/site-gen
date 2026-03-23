/**
 * Checkout page logic
 * Управление шагами оформления заказа
 * Поддерживает два режима:
 *   1. Корзина (cartId из localStorage) — multi-item
 *   2. Одиночный товар (?productId из URL) — backward compat
 */

import { CheckoutAPI } from './checkout-api.js';
import { fetchAddressSuggestionsDebounced } from './dadata.js';

class CheckoutFlow {
  constructor() {
    this.cartId = null;
    this.orderId = null;
    this.items = []; // [{name, imageUrl, unitPriceCents, quantity, id, productId}]
    this.cart = null;
    this.currentStep = 1;
    this.dadataToken = null;
    this.selectedAddress = null; // Stores full DaData suggestion data
    this.deliveryTariffs = []; // CDEK tariffs from calculation
    this.selectedDelivery = null; // { type, tariffCode, deliveryCostCents }
    this.deliveryCostCents = 0; // Current delivery cost for totals

    this.init();
  }

  async init() {
    try {
      // Режим 1: Существующая корзина из localStorage
      const savedCartId = this.getSavedCartId();
      if (savedCartId) {
        const cartRes = await CheckoutAPI.getCart(savedCartId);
        // API returns { success, data: { cart: {...}, items: [...] } }
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
            quantity: item.quantity || 1,
            options: item.options || null,
          }));
          this.renderProductSummary();
          this.bindEvents();
          this.initDaData();
          // Analytics: track checkout_start
          if (window._mfy && window._mfy.trackCheckout) {
            window._mfy.trackCheckout();
          }
          // Delivery will be calculated dynamically after address selection
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

      // Delivery will be calculated dynamically after address selection

      this.renderProductSummary();
      this.bindEvents();
      this.initDaData();
      // Analytics: track checkout_start (single product mode)
      if (window._mfy && window._mfy.trackCheckout) {
        window._mfy.trackCheckout();
      }
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
            ${item.options ? `<div style="font-size: 12px; color: rgb(var(--color-muted));">${Object.entries(item.options).map(([k,v]) => k + ': ' + v).join(', ')}</div>` : ''}
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
    const addressForm = document.getElementById('address-form');
    if (addressForm) {
      addressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const errorEl = document.getElementById('address-error');

        btn.disabled = true;
        errorEl.textContent = '';

        try {
          const addressData = this.getAddressData();

          // Validate that at least city is filled
          if (!addressData.city) {
            throw new Error('Укажите город доставки');
          }

          const res = await CheckoutAPI.setAddress(this.cartId, {
            city: addressData.city,
            street: addressData.street,
            building: addressData.building,
            apartment: addressData.apartment || undefined,
            postalCode: addressData.postalCode || undefined,
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
    }

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

  // --- DaData Address Autocomplete ---

  initDaData() {
    this.dadataToken = window.__DADATA_TOKEN__
      || document.querySelector('[data-dadata-token]')?.dataset?.dadataToken
      || null;

    const searchInput = document.getElementById('co-address-search');
    const suggestionsEl = document.getElementById('dadata-suggestions');
    const manualEl = document.getElementById('co-address-manual');
    const addressWrap = document.getElementById('co-address-wrap');

    if (!searchInput || !suggestionsEl) return;

    // If no DaData token available, show manual fields as fallback
    if (!this.dadataToken) {
      if (addressWrap) addressWrap.classList.add('hidden');
      if (manualEl) manualEl.classList.remove('hidden');
      return;
    }

    // Input handler with debounce
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      if (query.length < 3) {
        this.hideDadataSuggestions();
        return;
      }
      fetchAddressSuggestionsDebounced(query, this.dadataToken, (suggestions) => {
        this.renderDadataSuggestions(suggestions);
      });
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
        this.hideDadataSuggestions();
      }
    });

    // Close dropdown on Escape
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideDadataSuggestions();
      }
    });

    // "Change" button to re-enter address
    const changeBtn = document.getElementById('co-address-change');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        this.resetDadataAddress();
      });
    }
  }

  renderDadataSuggestions(suggestions) {
    const suggestionsEl = document.getElementById('dadata-suggestions');
    if (!suggestionsEl) return;

    if (!suggestions || suggestions.length === 0) {
      this.hideDadataSuggestions();
      return;
    }

    suggestionsEl.innerHTML = suggestions.map((s, i) =>
      `<div class="checkout-dadata-item" data-index="${i}">${s.value}</div>`
    ).join('');

    // Store suggestions for selection
    this._currentSuggestions = suggestions;

    // Bind click on each item
    suggestionsEl.querySelectorAll('.checkout-dadata-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        this.selectDadataSuggestion(suggestions[idx]);
      });
    });

    suggestionsEl.classList.remove('hidden');
  }

  selectDadataSuggestion(suggestion) {
    if (!suggestion) return;

    const data = suggestion.data;
    this.selectedAddress = data;

    // Populate hidden structured fields
    this.setFieldValue('co-city', data.city);
    this.setFieldValue('co-street', data.street_with_type);
    this.setFieldValue('co-house', data.house + (data.block ? `, корп. ${data.block}` : ''));
    this.setFieldValue('co-postal-code', data.postal_code);
    this.setFieldValue('co-fias-id', data.fias_id);
    this.setFieldValue('co-city-fias-id', data.city_fias_id);

    // Prefill apartment if DaData returned it
    const aptInput = document.getElementById('co-apartment');
    if (aptInput && data.flat) {
      aptInput.value = data.flat;
    }

    // Hide search input, show selected address display
    const searchInput = document.getElementById('co-address-search');
    if (searchInput) searchInput.style.display = 'none';

    const selectedEl = document.getElementById('co-address-selected');
    const selectedText = document.getElementById('co-address-selected-text');
    if (selectedEl && selectedText) {
      selectedText.textContent = suggestion.value;
      selectedEl.classList.remove('hidden');
    }

    this.hideDadataSuggestions();

    // Trigger CDEK delivery calculation if cityFiasId available
    if (data.city_fias_id && this.cartId) {
      this.calculateDelivery(data.city_fias_id, data.postal_code);
    }
  }

  resetDadataAddress() {
    this.selectedAddress = null;
    this.selectedDelivery = null;
    this.deliveryTariffs = [];
    this.deliveryCostCents = 0;

    // Reset delivery UI back to placeholder
    this.setDeliveryState('placeholder');
    this.updateDeliveryTotals();

    // Clear hidden fields
    ['co-city', 'co-street', 'co-house', 'co-postal-code', 'co-fias-id', 'co-city-fias-id'].forEach(id => {
      this.setFieldValue(id, '');
    });

    // Clear apartment
    const aptInput = document.getElementById('co-apartment');
    if (aptInput) aptInput.value = '';

    // Show search input again, hide selected display
    const searchInput = document.getElementById('co-address-search');
    if (searchInput) {
      searchInput.style.display = '';
      searchInput.value = '';
      searchInput.focus();
    }

    const selectedEl = document.getElementById('co-address-selected');
    if (selectedEl) selectedEl.classList.add('hidden');
  }

  hideDadataSuggestions() {
    const suggestionsEl = document.getElementById('dadata-suggestions');
    if (suggestionsEl) suggestionsEl.classList.add('hidden');
  }

  setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  }

  /**
   * Collect address data from either DaData selection or manual fields.
   * Returns structured address object for CheckoutAPI.setAddress().
   */
  getAddressData() {
    const city = document.getElementById('co-city')?.value;

    // DaData was used (hidden fields populated)
    if (city) {
      return {
        city: city,
        street: document.getElementById('co-street')?.value || '',
        building: document.getElementById('co-house')?.value || '',
        apartment: document.getElementById('co-apartment')?.value || '',
        postalCode: document.getElementById('co-postal-code')?.value || '',
        fiasId: document.getElementById('co-fias-id')?.value || '',
        cityFiasId: document.getElementById('co-city-fias-id')?.value || '',
      };
    }

    // Manual fallback
    return {
      city: document.getElementById('co-manual-city')?.value || '',
      street: document.getElementById('co-manual-street')?.value || '',
      building: document.getElementById('co-manual-house')?.value || '',
      apartment: document.getElementById('co-manual-apartment')?.value || '',
      postalCode: document.getElementById('co-manual-postal-code')?.value || '',
    };
  }

  // --- End DaData ---

  // --- CDEK Delivery Calculation & Selection ---

  async calculateDelivery(cityFiasId, postalCode) {
    this.setDeliveryState('loading');
    this.selectedDelivery = null;
    this.deliveryTariffs = [];

    try {
      const res = await CheckoutAPI.calculateDelivery(this.cartId, {
        cityFiasId,
        postalCode: postalCode || undefined,
      });

      if (!res.success) {
        this.setDeliveryState('error');
        return;
      }

      const { tariffs, pickupAvailable, pickupAddress } = res.data;

      if ((!tariffs || tariffs.length === 0) && !pickupAvailable) {
        this.setDeliveryState('unavailable');
        return;
      }

      this.deliveryTariffs = tariffs || [];
      this.renderDeliveryTariffs(tariffs, pickupAvailable, pickupAddress);
      this.setDeliveryState('tariffs');
    } catch (e) {
      console.error('Delivery calculation error:', e);
      this.setDeliveryState('error');
    }
  }

  setDeliveryState(state) {
    const placeholder = document.getElementById('co-delivery-placeholder');
    const loading = document.getElementById('co-delivery-loading');
    const tariffs = document.getElementById('co-delivery-tariffs');
    const pickup = document.getElementById('co-delivery-pickup');
    const error = document.getElementById('co-delivery-error');
    const unavailable = document.getElementById('co-delivery-unavailable');

    // Hide all
    [placeholder, loading, tariffs, pickup, error, unavailable].forEach(el => {
      if (el) el.classList.add('hidden');
    });

    // Show the right one
    switch (state) {
      case 'placeholder':
        if (placeholder) placeholder.classList.remove('hidden');
        break;
      case 'loading':
        if (loading) loading.classList.remove('hidden');
        break;
      case 'tariffs':
        if (tariffs) tariffs.classList.remove('hidden');
        // pickup is shown/hidden independently by renderDeliveryTariffs
        break;
      case 'error':
        if (error) error.classList.remove('hidden');
        break;
      case 'unavailable':
        if (unavailable) unavailable.classList.remove('hidden');
        break;
    }
  }

  renderDeliveryTariffs(tariffs, pickupAvailable, pickupAddress) {
    const container = document.getElementById('co-delivery-tariffs');
    const pickupEl = document.getElementById('co-delivery-pickup');

    if (!container) return;

    // Render CDEK tariffs
    container.innerHTML = (tariffs || []).map((t, i) => {
      const priceCents = Math.round((t.deliverySum || 0) * 100);
      const priceText = priceCents > 0 ? `${Math.round(priceCents / 100)} ₽` : 'Бесплатно';
      const periodText = t.periodMin && t.periodMax
        ? `${t.periodMin}-${t.periodMax} дн.`
        : t.periodMin ? `от ${t.periodMin} дн.` : '';
      const modeText = t.deliveryMode === 'door' ? 'Курьер' : t.deliveryMode === 'pvz' ? 'ПВЗ' : '';

      return `
        <label class="checkout-shipping-option" data-delivery="cdek" data-tariff-code="${t.tariffCode}" data-cost="${priceCents}" data-index="${i}">
          <div class="checkout-shipping-left">
            <input type="radio" name="delivery" value="cdek-${t.tariffCode}" class="checkout-radio">
            <div>
              <span class="checkout-shipping-name font-body">${t.tariffName || 'СДЭК'}</span>
              ${modeText ? `<div class="checkout-shipping-mode font-body">${modeText}</div>` : ''}
            </div>
          </div>
          <div class="checkout-shipping-right">
            <span class="checkout-shipping-price font-body">${priceText}</span>
            ${periodText ? `<span class="checkout-shipping-days font-body">${periodText}</span>` : ''}
          </div>
        </label>
      `;
    }).join('');

    // Show/hide pickup
    if (pickupEl) {
      if (pickupAvailable) {
        pickupEl.classList.remove('hidden');
        const addrEl = document.getElementById('co-pickup-address');
        if (addrEl && pickupAddress) addrEl.textContent = pickupAddress;
      } else {
        pickupEl.classList.add('hidden');
      }
    }

    // Bind click events for tariff selection
    this.bindDeliverySelection();
  }

  bindDeliverySelection() {
    const allOptions = document.querySelectorAll('#co-delivery-tariffs .checkout-shipping-option, #co-delivery-pickup .checkout-shipping-option');

    allOptions.forEach(option => {
      option.addEventListener('click', () => {
        // Update visual selection
        allOptions.forEach(o => o.classList.remove('checkout-shipping-option--selected'));
        option.classList.add('checkout-shipping-option--selected');

        // Check the radio
        const radio = option.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        // Determine selection
        const deliveryType = option.dataset.delivery;
        const costCents = parseInt(option.dataset.cost || '0', 10);
        const tariffCode = option.dataset.tariffCode ? parseInt(option.dataset.tariffCode, 10) : null;

        this.selectDeliveryOption(deliveryType, tariffCode, costCents);
      });
    });
  }

  async selectDeliveryOption(type, tariffCode, deliveryCostCents) {
    this.selectedDelivery = { type, tariffCode, deliveryCostCents };
    this.deliveryCostCents = deliveryCostCents;

    // Update totals UI immediately
    this.updateDeliveryTotals();

    // Send selection to backend
    try {
      const res = await CheckoutAPI.selectDelivery(this.cartId, {
        type,
        tariffCode: tariffCode || null,
        deliveryCostCents,
      });

      if (res.success && res.data) {
        this.cart = res.data;
        // Re-update totals from server data
        this.updateDeliveryTotals();
      }
    } catch (e) {
      console.error('Delivery selection error:', e);
    }
  }

  updateDeliveryTotals() {
    // Update "Доставка" line in the order summary panel
    const deliveryCostEl = document.getElementById('co-delivery-cost');
    if (deliveryCostEl) {
      deliveryCostEl.textContent = this.deliveryCostCents > 0
        ? this.formatPrice(this.deliveryCostCents / 100)
        : 'Бесплатно';
    }

    // Update total
    const totalEl = document.getElementById('co-total');
    if (totalEl) {
      const subtotal = this.cart?.subtotalCents
        ?? this.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
      const discount = this.cart?.discountCents ?? 0;
      const total = subtotal + this.deliveryCostCents - discount;
      totalEl.textContent = this.formatPrice(total / 100);
    }
  }

  // --- End CDEK Delivery ---

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
            ${item.options ? `<div style="font-size: 0.75rem; color: rgb(var(--color-muted));">${Object.entries(item.options).map(([k,v]) => k + ': ' + v).join(', ')}</div>` : ''}
            <div style="font-size: 0.875rem; color: rgb(var(--color-primary)); font-weight: 600;">${this.formatPrice(lineTotal / 100)}</div>
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
