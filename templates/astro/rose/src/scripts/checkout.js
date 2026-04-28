/**
 * @deprecated 080 Phase 9 — superseded by checkout-puck.astro + @merfy/storefront/checkout.
 * Kept until per-site `settings.checkoutPuckManaged=true` is fully rolled out.
 * Removal scheduled 30 days after 100% canary success.
 */
/**
 * Checkout page logic
 * Single-page checkout form (no multi-step navigation)
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
    this.dadataToken = null;
    this.selectedAddress = null; // Stores full DaData suggestion data
    this.deliveryTariffs = []; // CDEK tariffs from calculation
    this.selectedDelivery = null; // { type, tariffCode, deliveryCostCents }
    this.deliveryCostCents = 0; // Current delivery cost for totals
    this.pickupPoints = []; // CDEK pickup points for selected city
    this.selectedPvz = null; // { code, name, address, workTime, type }
    this.lastCityFiasId = null; // Cache to avoid re-fetching PVZ for same city
    this.deliveryMethods = { cdekAvailable: false, pickupAvailable: false, pickupAddress: null, pickupNotification: null, pickupExpectedDate: null, customProfiles: [] };
    this.selectedDeliveryMethod = null; // 'cdek' | 'pickup' | null

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
          await this.revalidatePrices();
          this.renderProductSummary();
          this.bindEvents();
          this.initDaData();
          // Analytics: track checkout_start
          if (window._mfy && window._mfy.trackCheckout) {
            window._mfy.trackCheckout();
          }
          // Check delivery method availability (CDEK / pickup / both)
          this.checkDeliveryOptions();
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
      // Check delivery method availability (CDEK / pickup / both)
      this.checkDeliveryOptions();
    } catch (e) {
      console.error('Checkout init error:', e);
      this.showError('Ошибка загрузки', e.message || 'Попробуйте обновить страницу');
    }
  }

  getSavedCartId() {
    try {
      return localStorage.getItem('merfy:cartId') || null;
    } catch (e) {
      return null;
    }
  }

  async revalidatePrices() {
    try {
      const res = await fetch('/data/products.json');
      if (!res.ok) return;
      const products = await res.json();
      const priceMap = new Map();
      for (const p of products) {
        priceMap.set(p.id, Math.round(p.price * 100));
      }
      const staleItems = [];
      for (const item of this.items) {
        const currentCents = priceMap.get(item.productId);
        if (currentCents !== undefined && currentCents !== item.unitPriceCents) {
          staleItems.push({ name: item.name, oldCents: item.unitPriceCents, newCents: currentCents });
          item.unitPriceCents = currentCents;
        }
      }
      if (staleItems.length > 0) {
        const banner = document.createElement('div');
        banner.className = 'checkout-price-warning';
        banner.style.cssText = 'background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-family: var(--font-body, sans-serif); font-size: 14px; color: #92400E;';
        const lines = staleItems.map(s =>
          `${s.name}: ${this.formatPrice(s.oldCents / 100)} → ${this.formatPrice(s.newCents / 100)}`
        );
        banner.innerHTML = `<strong>Цены обновились</strong><br>${lines.join('<br>')}`;
        const form = document.getElementById('co-product-list');
        if (form) form.parentNode.insertBefore(banner, form);
      }
    } catch (e) {
      // Non-critical — proceed with cart prices
    }
  }

  clearSavedCart() {
    try {
      localStorage.removeItem('merfy:cartId');
      localStorage.removeItem('merfy_cart_items');
    } catch (e) {
      // ignore
    }
    // Notify cart components
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: [] } }));
  }

  renderProductSummary() {
    const container = document.getElementById('co-product-list');
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = '<p class="font-body" style="color: rgb(var(--color-muted));">Корзина пуста</p>';
      return;
    }

    const itemsHtml = this.items.map(item => {
      const imgHtml = item.imageUrl
        ? `<div class="checkout-product-img-wrap">
            <img src="${item.imageUrl}" alt="${item.name}" class="checkout-product-img">
            ${item.quantity > 1 ? `<span class="checkout-product-counter">${item.quantity}</span>` : ''}
          </div>`
        : `<div class="checkout-product-img-wrap">
            <div class="checkout-product-img" style="display: flex; align-items: center; justify-content: center; color: rgb(var(--color-muted));">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21,15 16,10 5,21"/>
              </svg>
            </div>
            ${item.quantity > 1 ? `<span class="checkout-product-counter">${item.quantity}</span>` : ''}
          </div>`;

      const lineTotal = item.unitPriceCents * item.quantity;

      return `
        <div class="checkout-product-item">
          ${imgHtml}
          <div class="checkout-product-info">
            <span class="checkout-product-name font-body">${item.name}</span>
            ${item.options ? `<span class="checkout-product-variant font-body" style="font-size: 12px; color: rgb(var(--color-muted));">${Object.entries(item.options).map(([k,v]) => k + ': ' + v).join(', ')}</span>` : ''}
            <div class="checkout-product-price">
              <span class="checkout-product-price-current font-body">${this.formatPrice(lineTotal / 100)}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = itemsHtml;

    // Update totals after rendering
    this.updateDeliveryTotals();
  }

  bindEvents() {
    // Single-page checkout — no step navigation buttons needed
    // All form submission happens via the pay button

    // Pay button
    const payBtn = document.getElementById('co-submit-btn');
    if (payBtn) {
      payBtn.addEventListener('click', async () => {
        await this.processPayment();
      });
    }

    // Промокод
    const applyPromoBtn = document.getElementById('co-btn-apply-promo');
    if (applyPromoBtn) {
      applyPromoBtn.addEventListener('click', () => {
        this.applyPromo();
      });
    }

    const promoInput = document.getElementById('co-promo-input');
    if (promoInput) {
      promoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.applyPromo();
        }
      });
    }

    const removePromoBtn = document.getElementById('co-btn-remove-promo');
    if (removePromoBtn) {
      removePromoBtn.addEventListener('click', () => {
        this.removePromo();
      });
    }
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
    this.selectedPvz = null;
    this.pickupPoints = [];
    this.lastCityFiasId = null;

    // Reset delivery UI back to placeholder
    this.setDeliveryState('placeholder');
    this.hidePvzSection();
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

  // --- Pickup-only check (no CDEK) ---

  async checkDeliveryOptions() {
    try {
      const res = await CheckoutAPI.calculateDelivery(this.cartId, {});
      if (!res.success) return;

      const { cdekAvailable, cdekError, pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles } = res.data;
      this.deliveryMethods = { cdekAvailable, cdekError, pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles: customProfiles || [] };

      const methodEl = document.getElementById('co-delivery-method');
      const addressGroup = document.getElementById('co-address-group');
      const placeholder = document.getElementById('co-delivery-placeholder');
      const hasCustom = customProfiles && customProfiles.length > 0;

      // Case 1: Both available — show delivery method radio selector
      if (cdekAvailable && pickupAvailable) {
        if (placeholder) placeholder.classList.add('hidden');
        if (methodEl) methodEl.classList.remove('hidden');
        if (addressGroup) addressGroup.style.display = 'none';
        // Fill pickup address in method selector
        const addrEl = document.getElementById('co-delivery-method-pickup-addr');
        if (addrEl && pickupAddress) addrEl.textContent = pickupAddress;
        this.bindDeliveryMethodSelection();
        // If custom profiles exist, render them immediately (no address needed)
        if (hasCustom) {
          this.renderDeliveryTariffs([], pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles);
          this.setDeliveryState('tariffs');
        }
        return;
      }

      // Case 2: CDEK only — show address immediately (old behavior)
      if (cdekAvailable && !pickupAvailable) {
        if (hasCustom) {
          this.renderDeliveryTariffs([], false, null, null, null, customProfiles);
          this.setDeliveryState('tariffs');
        }
        return;
      }

      // Case 3: Pickup only — auto-select pickup, hide address
      if (!cdekAvailable && pickupAvailable) {
        if (placeholder) placeholder.classList.add('hidden');
        if (addressGroup) addressGroup.style.display = 'none';
        this.renderDeliveryTariffs([], true, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles);
        this.setDeliveryState('tariffs');
        if (cdekError) this.showCdekErrorNote(cdekError);
        return;
      }

      // Case 5: Custom profiles only — no CDEK, no pickup
      if (!cdekAvailable && !pickupAvailable && hasCustom) {
        if (placeholder) placeholder.classList.add('hidden');
        if (addressGroup) addressGroup.style.display = 'none';
        this.renderDeliveryTariffs([], false, null, null, null, customProfiles);
        this.setDeliveryState('tariffs');
        if (cdekError) this.showCdekErrorNote(cdekError);
        return;
      }

      // Case 4: Nothing available
      this.setDeliveryState('unavailable');
    } catch (e) {
      // Silently fail — user can still try address for CDEK calculation
    }
  }

  bindDeliveryMethodSelection() {
    const methodEl = document.getElementById('co-delivery-method');
    if (!methodEl) return;

    const options = methodEl.querySelectorAll('.checkout-delivery-method-option');
    options.forEach(option => {
      option.addEventListener('click', () => {
        // Visual selection
        options.forEach(o => o.classList.remove('checkout-shipping-option--selected'));
        option.classList.add('checkout-shipping-option--selected');
        const radio = option.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        const method = option.dataset.method;
        this.selectedDeliveryMethod = method;

        const addressGroup = document.getElementById('co-address-group');
        const tariffs = document.getElementById('co-delivery-tariffs');
        const pickupEl = document.getElementById('co-delivery-pickup');
        const placeholder = document.getElementById('co-delivery-placeholder');
        const pvzSection = document.getElementById('co-pvz-section');

        if (method === 'cdek') {
          // Show address block, hide pickup, reset CDEK tariffs
          if (addressGroup) addressGroup.style.display = '';
          if (pickupEl) pickupEl.classList.add('hidden');
          if (pvzSection) pvzSection.classList.add('hidden');
          // Re-render custom profiles (if any) while clearing CDEK tariffs
          const dm = this.deliveryMethods || {};
          const hasCustom = dm.customProfiles && dm.customProfiles.length > 0;
          if (hasCustom) {
            this.renderDeliveryTariffs([], false, null, null, null, dm.customProfiles);
            if (tariffs) tariffs.classList.remove('hidden');
          } else {
            if (tariffs) { tariffs.classList.add('hidden'); tariffs.innerHTML = ''; }
          }
          if (placeholder && !hasCustom) {
            placeholder.classList.remove('hidden');
          } else if (placeholder) {
            placeholder.classList.add('hidden');
          }
          // Reset delivery selection
          this.selectedDelivery = null;
          this.deliveryCostCents = 0;
          this.updateDeliveryTotals();
        } else if (method === 'pickup') {
          // Hide address, show pickup + custom profiles
          if (addressGroup) addressGroup.style.display = 'none';
          if (pvzSection) pvzSection.classList.add('hidden');
          if (placeholder) placeholder.classList.add('hidden');
          // Render pickup + custom profiles together
          const dm = this.deliveryMethods || {};
          this.renderDeliveryTariffs([], true, dm.pickupAddress, dm.pickupNotification, dm.pickupExpectedDate, dm.customProfiles);
          if (tariffs) tariffs.classList.remove('hidden');
          if (pickupEl) pickupEl.classList.remove('hidden');
          // Auto-select pickup
          this.selectedDelivery = { type: 'pickup', tariffCode: null, deliveryCostCents: 0 };
          this.deliveryCostCents = 0;
          this.updateDeliveryTotals();
          this.sendDeliverySelection('pickup', null, 0, null, null, null, null);
        }
      });
    });
  }

  // --- CDEK Delivery Calculation & Selection ---

  async calculateDelivery(cityFiasId, postalCode) {
    this.setDeliveryState('loading');
    this.hidePvzSection();
    this.selectedDelivery = null;
    this.selectedPvz = null;
    this.deliveryTariffs = [];
    this.pickupPoints = [];
    this.lastCityFiasId = null;

    try {
      const res = await CheckoutAPI.calculateDelivery(this.cartId, {
        cityFiasId,
        postalCode: postalCode || undefined,
      });

      if (!res.success) {
        this.setDeliveryState('error');
        return;
      }

      const { tariffs, pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles } = res.data;

      const hasCustom = customProfiles && customProfiles.length > 0;
      if ((!tariffs || tariffs.length === 0) && !pickupAvailable && !hasCustom) {
        this.setDeliveryState('unavailable');
        return;
      }

      this.deliveryTariffs = tariffs || [];
      this.renderDeliveryTariffs(tariffs, pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles);
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

    // Hide all (except pickup — managed by renderDeliveryTariffs)
    [placeholder, loading, tariffs, error, unavailable].forEach(el => {
      if (el) el.classList.add('hidden');
    });

    // Show the right one
    switch (state) {
      case 'placeholder':
        if (pickup) pickup.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
        break;
      case 'loading':
        if (pickup) pickup.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
        break;
      case 'tariffs':
        if (tariffs) tariffs.classList.remove('hidden');
        // pickup is shown/hidden independently by renderDeliveryTariffs (called before setDeliveryState)
        break;
      case 'error':
        if (pickup) pickup.classList.add('hidden');
        if (error) error.classList.remove('hidden');
        break;
      case 'unavailable':
        if (pickup) pickup.classList.add('hidden');
        if (unavailable) unavailable.classList.remove('hidden');
        break;
    }
  }

  showCdekErrorNote(errorMsg) {
    const tariffs = document.getElementById('co-delivery-tariffs');
    if (!tariffs) return;
    // Remove existing note if any
    const existing = tariffs.querySelector('.checkout-cdek-error-note');
    if (existing) existing.remove();
    const note = document.createElement('div');
    note.className = 'checkout-cdek-error-note';
    note.style.cssText = 'padding: 8px 12px; margin-top: 8px; font-size: 13px; color: var(--color-muted, #6b7280); background: var(--color-surface-alt, #f9fafb); border-radius: 8px;';
    note.textContent = `Доставка СДЭК недоступна: ${errorMsg}`;
    tariffs.appendChild(note);
  }

  renderDeliveryTariffs(tariffs, pickupAvailable, pickupAddress, pickupNotification, pickupExpectedDate, customProfiles) {
    const container = document.getElementById('co-delivery-tariffs');
    const pickupEl = document.getElementById('co-delivery-pickup');

    if (!container) return;

    // Destination address from selected DaData suggestion
    const selectedText = document.getElementById('co-address-selected-text');
    const fullAddress = selectedText ? selectedText.textContent : '';
    const cityEl = document.getElementById('co-city');
    const destCity = cityEl ? cityEl.value : '';
    const mapsUrl = fullAddress ? `https://yandex.ru/maps/?text=${encodeURIComponent(fullAddress)}` : '';

    // Render CDEK tariffs
    let html = (tariffs || []).map((t, i) => {
      const deliverySum = t.deliverySumRub ?? t.deliverySum ?? 0;
      const priceCents = Math.round(deliverySum * 100);
      const priceText = priceCents > 0 ? `${Math.round(priceCents / 100)} ₽` : 'Бесплатно';
      const periodText = t.periodMin && t.periodMax
        ? `${t.periodMin}-${t.periodMax} дн.`
        : t.periodMin ? `от ${t.periodMin} дн.` : '';

      // Mode badge and description with address
      let modeBadge = '';
      let modeDesc = '';
      if (t.deliveryMode === 'door') {
        modeBadge = '<span class="checkout-shipping-badge checkout-shipping-badge--door font-body">Курьер</span>';
        if (fullAddress) {
          modeDesc = `<a href="${mapsUrl}" target="_blank" rel="noopener" class="checkout-shipping-addr">${fullAddress}</a>`;
        } else {
          modeDesc = destCity ? `Доставка курьером в ${destCity}` : 'Доставка курьером до двери';
        }
      } else if (t.deliveryMode === 'pickup') {
        modeBadge = '<span class="checkout-shipping-badge checkout-shipping-badge--pvz font-body">ПВЗ</span>';
        modeDesc = destCity ? `Пункт выдачи СДЭК в ${destCity}` : 'Пункт выдачи СДЭК';
      }

      return `
        <label class="checkout-shipping-option" data-delivery="cdek" data-tariff-code="${t.tariffCode}" data-cost="${priceCents}" data-delivery-mode="${t.deliveryMode || ''}" data-period-min="${t.periodMin || ''}" data-period-max="${t.periodMax || ''}" data-index="${i}">
          <div class="checkout-shipping-left">
            <input type="radio" name="delivery" value="cdek-${t.tariffCode}" class="checkout-radio">
            <div class="checkout-shipping-info">
              <div class="checkout-shipping-name-row">
                <span class="checkout-shipping-name font-body">${t.tariffName || 'СДЭК'}</span>
                ${modeBadge}
              </div>
              ${modeDesc ? `<div class="checkout-shipping-desc font-body">${modeDesc}</div>` : ''}
            </div>
          </div>
          <div class="checkout-shipping-right">
            <span class="checkout-shipping-price font-body">${priceText}</span>
            ${periodText ? `<span class="checkout-shipping-days font-body">${periodText}</span>` : ''}
          </div>
        </label>
      `;
    }).join('');

    // Render custom profile tariffs
    if (customProfiles && customProfiles.length > 0) {
      for (const profile of customProfiles) {
        for (const t of profile.tariffs) {
          const priceText = t.priceCents > 0 ? `${Math.round(t.priceCents / 100)} ₽` : 'Бесплатно';
          html += `
            <label class="checkout-shipping-option" data-delivery="custom" data-tariff-code="${t.id}" data-cost="${t.priceCents}" data-delivery-mode="custom" data-period-min="" data-period-max="">
              <div class="checkout-shipping-left">
                <input type="radio" name="delivery" value="custom-${t.id}" class="checkout-radio">
                <div class="checkout-shipping-info">
                  <div class="checkout-shipping-name-row">
                    <span class="checkout-shipping-name font-body">${t.name}</span>
                    <span class="checkout-shipping-badge checkout-shipping-badge--custom font-body">${profile.name}</span>
                  </div>
                  ${t.description ? `<div class="checkout-shipping-desc font-body">${t.description}</div>` : ''}
                </div>
              </div>
              <div class="checkout-shipping-right">
                <span class="checkout-shipping-price font-body">${priceText}</span>
              </div>
            </label>
          `;
        }
      }
    }

    container.innerHTML = html;

    // Show/hide pickup
    if (pickupEl) {
      if (pickupAvailable) {
        pickupEl.classList.remove('hidden');
        const addrEl = document.getElementById('co-pickup-address');
        if (addrEl && pickupAddress) addrEl.textContent = pickupAddress;
        // Show notification and expected date if set by shop owner
        const notifEl = document.getElementById('co-pickup-notification');
        if (notifEl) {
          if (pickupNotification) {
            notifEl.textContent = pickupNotification;
            notifEl.classList.remove('hidden');
          } else {
            notifEl.classList.add('hidden');
          }
        }
        const dateEl = document.getElementById('co-pickup-expected-date');
        if (dateEl) {
          if (pickupExpectedDate) {
            dateEl.textContent = `Ожидаемая дата: ${pickupExpectedDate}`;
            dateEl.classList.remove('hidden');
          } else {
            dateEl.classList.add('hidden');
          }
        }
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
        const rawTariffCode = option.dataset.tariffCode;
        const tariffCode = deliveryType === 'custom' ? rawTariffCode : (rawTariffCode ? parseInt(rawTariffCode, 10) : null);
        const deliveryMode = option.dataset.deliveryMode || 'door';
        const periodMin = option.dataset.periodMin ? parseInt(option.dataset.periodMin, 10) : null;
        const periodMax = option.dataset.periodMax ? parseInt(option.dataset.periodMax, 10) : null;

        this.selectDeliveryOption(deliveryType, tariffCode, costCents, deliveryMode, periodMin, periodMax);
      });
    });
  }

  async selectDeliveryOption(type, tariffCode, deliveryCostCents, deliveryMode, periodMin, periodMax) {
    this.selectedDelivery = { type, tariffCode, deliveryCostCents, deliveryMode, periodMin, periodMax };
    this.deliveryCostCents = deliveryCostCents;

    // Update totals UI immediately
    this.updateDeliveryTotals();

    // Handle PVZ flow: if pickup tariff → show PVZ selection, don't send to backend yet
    if (deliveryMode === 'pickup') {
      this.selectedPvz = null;
      this.showPvzSection();
      this.loadPickupPoints();
      return; // Wait for PVZ selection before sending to backend
    }

    // Door delivery — hide PVZ section and send selection immediately
    this.hidePvzSection();
    this.selectedPvz = null;
    await this.sendDeliverySelection(type, tariffCode, deliveryCostCents, null, null, periodMin, periodMax);
  }

  async sendDeliverySelection(type, tariffCode, deliveryCostCents, pickupPointCode, pickupPointAddress, periodMin, periodMax) {
    try {
      const payload = {
        type,
        tariffCode: tariffCode || null,
        deliveryCostCents,
      };
      if (pickupPointCode) payload.pickupPointCode = pickupPointCode;
      if (pickupPointAddress) payload.pickupPointAddress = pickupPointAddress;
      if (periodMin != null) payload.periodMin = periodMin;
      if (periodMax != null) payload.periodMax = periodMax;

      const res = await CheckoutAPI.selectDelivery(this.cartId, payload);

      if (res.success && res.data) {
        this.cart = res.data;
        this.updateDeliveryTotals();
      }
    } catch (e) {
      console.error('Delivery selection error:', e);
    }
  }

  // --- PVZ (Pickup Point) Selection ---

  showPvzSection() {
    const section = document.getElementById('co-pvz-section');
    if (section) section.classList.remove('hidden');
  }

  hidePvzSection() {
    const section = document.getElementById('co-pvz-section');
    if (section) section.classList.add('hidden');
    // Also hide sub-elements
    const list = document.getElementById('co-pvz-list');
    const loading = document.getElementById('co-pvz-loading');
    const error = document.getElementById('co-pvz-error');
    if (list) list.classList.add('hidden');
    if (loading) loading.classList.add('hidden');
    if (error) error.classList.add('hidden');
  }

  async loadPickupPoints() {
    const cityFiasId = document.getElementById('co-city-fias-id')?.value;
    if (!cityFiasId || !this.cartId) {
      this.setPvzState('error');
      return;
    }

    // If same city and we already have points, just re-render
    if (this.lastCityFiasId === cityFiasId && this.pickupPoints.length > 0) {
      this.renderPickupPoints(this.pickupPoints);
      this.setPvzState('list');
      return;
    }

    this.setPvzState('loading');
    this.pickupPoints = [];
    this.lastCityFiasId = cityFiasId;

    try {
      const res = await CheckoutAPI.getPickupPoints(this.cartId, cityFiasId);

      if (!res.success || !res.data || res.data.length === 0) {
        this.setPvzState('error');
        return;
      }

      this.pickupPoints = res.data;
      this.renderPickupPoints(res.data);
      this.setPvzState('list');
    } catch (e) {
      console.error('Pickup points loading error:', e);
      this.setPvzState('error');
    }
  }

  setPvzState(state) {
    const loading = document.getElementById('co-pvz-loading');
    const list = document.getElementById('co-pvz-list');
    const error = document.getElementById('co-pvz-error');

    [loading, list, error].forEach(el => { if (el) el.classList.add('hidden'); });

    switch (state) {
      case 'loading':
        if (loading) loading.classList.remove('hidden');
        break;
      case 'list':
        if (list) list.classList.remove('hidden');
        break;
      case 'error':
        if (error) error.classList.remove('hidden');
        break;
    }
  }

  renderPickupPoints(points) {
    const container = document.getElementById('co-pvz-list');
    if (!container) return;

    container.innerHTML = points.map((p, i) => {
      const badgeText = p.type === 'POSTAMAT' ? 'Постамат' : 'ПВЗ';
      return `
        <label class="checkout-pvz-item" data-pvz-index="${i}">
          <input type="radio" name="pvz" value="${p.code}" class="checkout-radio checkout-pvz-item-radio">
          <div class="checkout-pvz-item-info">
            <p class="checkout-pvz-item-name font-body">${p.name || badgeText}</p>
            <p class="checkout-pvz-item-address font-body">${p.address}</p>
            ${p.workTime ? `<p class="checkout-pvz-item-worktime font-body">${p.workTime}</p>` : ''}
          </div>
          <span class="checkout-pvz-badge font-body">${badgeText}</span>
        </label>
      `;
    }).join('');

    this.bindPvzSelection(points);
  }

  bindPvzSelection(points) {
    const items = document.querySelectorAll('#co-pvz-list .checkout-pvz-item');

    items.forEach(item => {
      item.addEventListener('click', () => {
        // Update visual selection
        items.forEach(el => el.classList.remove('checkout-pvz-item--selected'));
        item.classList.add('checkout-pvz-item--selected');

        // Check radio
        const radio = item.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        // Get selected point
        const idx = parseInt(item.dataset.pvzIndex, 10);
        const point = points[idx];
        if (!point) return;

        this.selectedPvz = point;

        // Now send delivery selection with pickup point data
        if (this.selectedDelivery) {
          this.sendDeliverySelection(
            this.selectedDelivery.type,
            this.selectedDelivery.tariffCode,
            this.selectedDelivery.deliveryCostCents,
            point.code,
            point.address,
            this.selectedDelivery.periodMin,
            this.selectedDelivery.periodMax,
          );
        }
      });
    });
  }

  // --- End PVZ ---

  updateDeliveryTotals() {
    // Update "Доставка" line in the order summary panel
    const deliveryCostEl = document.getElementById('co-delivery-cost');
    if (deliveryCostEl) {
      deliveryCostEl.textContent = this.deliveryCostCents > 0
        ? this.formatPrice(this.deliveryCostCents / 100)
        : 'Бесплатно';
    }

    // Update discount row
    const discount = this.cart?.discountCents ?? 0;
    const discountRow = document.getElementById('co-discount-row');
    const discountValue = document.getElementById('co-discount-value');
    if (discountRow) {
      discountRow.style.display = discount > 0 ? '' : 'none';
    }
    if (discountValue && discount > 0) {
      discountValue.textContent = `-${this.formatPrice(discount / 100)}`;
    }

    // Update total
    const totalEl = document.getElementById('co-total');
    if (totalEl) {
      const subtotal = this.cart?.subtotalCents
        ?? this.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
      const total = subtotal + (this.deliveryCostCents || 0) - discount;
      totalEl.textContent = this.formatPrice(total / 100);
    }
  }

  // --- End CDEK Delivery ---

  /**
   * Collect customer and address data from single-page form fields.
   */
  getCustomerData() {
    return {
      email: document.getElementById('co-email')?.value?.trim() || '',
      phone: document.getElementById('co-phone')?.value?.trim() || '',
      firstName: document.getElementById('co-firstName')?.value?.trim() || '',
      lastName: document.getElementById('co-lastName')?.value?.trim() || '',
    };
  }

  async processPayment() {
    const btn = document.getElementById('co-submit-btn');
    if (!btn) return;

    const loadingEl = btn.querySelector('.co-btn-loading');
    const textEl = btn.querySelector('.co-btn-text');
    const errorEl = document.getElementById('co-error');

    btn.disabled = true;
    if (loadingEl) loadingEl.style.display = 'inline';
    if (textEl) textEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }

    try {
      // 1. Сохранить данные покупателя
      const customerData = this.getCustomerData();
      if (!customerData.email || !customerData.phone) {
        throw new Error('Укажите email и телефон');
      }

      const setCustomerPayload = {
        email: customerData.email,
        phone: customerData.phone,
        name: [customerData.firstName, customerData.lastName].filter(Boolean).join(' ') || undefined,
        firstName: customerData.firstName || undefined,
        lastName: customerData.lastName || undefined,
      };
      // Pass customerId if customer is logged in
      if (window.__MERFY_CUSTOMER_ID__) {
        setCustomerPayload.customerId = window.__MERFY_CUSTOMER_ID__;
      }
      const customerRes = await CheckoutAPI.setCustomer(this.cartId, setCustomerPayload);

      if (!customerRes.success) {
        throw new Error(customerRes.message || 'Ошибка сохранения контактов');
      }
      this.cart = customerRes.data;

      // 2. Сохранить адрес доставки (пропускаем для самовывоза)
      const isPickup = this.selectedDelivery?.type === 'pickup';
      if (!isPickup) {
        const addressData = this.getAddressData();
        if (!addressData.city) {
          throw new Error('Укажите город доставки');
        }

        const addressRes = await CheckoutAPI.setAddress(this.cartId, {
          city: addressData.city,
          street: addressData.street,
          building: addressData.building,
          apartment: addressData.apartment || undefined,
          postalCode: addressData.postalCode || undefined,
          fiasId: addressData.fiasId || undefined,
          cityFiasId: addressData.cityFiasId || undefined,
        });

        if (!addressRes.success) {
          throw new Error(addressRes.message || 'Ошибка сохранения адреса');
        }
        this.cart = addressRes.data;
      }

      // 3. Оформить заказ
      const checkoutRes = await CheckoutAPI.checkout(this.cartId);
      if (!checkoutRes.success) {
        throw new Error(checkoutRes.message || 'Не удалось оформить заказ');
      }
      this.orderId = checkoutRes.data.id;

      // 4. Очистить корзину в localStorage (заказ уже создан)
      this.clearSavedCart();

      // 4.5. Обновить профиль покупателя (адрес, телефон) — best effort
      if (window.__MERFY_CUSTOMER_ID__ && window.CustomerStore && window.CustomerStore.getToken()) {
        try {
          var profileUpdate = {};
          if (customerData.phone) profileUpdate.phone = customerData.phone;
          if (addressData.city) {
            profileUpdate.defaultAddress = {
              city: addressData.city,
              street: addressData.street || '',
              building: addressData.building || '',
              apartment: addressData.apartment || '',
              postalCode: addressData.postalCode || '',
            };
          }
          var profileConfig = window.__MERFY_CONFIG__ || {};
          var profileApiBase = profileConfig.apiBase || '';
          fetch(profileApiBase + '/store/auth/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + window.CustomerStore.getToken(),
            },
            body: JSON.stringify(profileUpdate),
          }).catch(function() { /* silent — best effort */ });
        } catch (_) { /* silent */ }
      }

      // 5. Создать платёж
      const returnUrl = `${window.location.origin}/checkout/result?orderId=${this.orderId}`;
      const paymentRes = await CheckoutAPI.createPayment(this.orderId, returnUrl);

      if (!paymentRes.success) {
        throw new Error(paymentRes.message || 'Не удалось создать платёж');
      }

      // 6. Редирект на ЮKassa
      window.location.href = paymentRes.data.confirmationUrl;
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      } else {
        console.error('Payment error:', e.message);
      }
      btn.disabled = false;
      if (loadingEl) loadingEl.style.display = 'none';
      if (textEl) textEl.style.display = 'inline';
    }
  }

  async applyPromo() {
    const input = document.getElementById('co-promo-input');
    const errorEl = document.getElementById('co-promo-error');
    const btn = document.getElementById('co-btn-apply-promo');
    if (!input || !btn) return;

    const code = input.value.trim();

    if (!code) return;
    if (!this.cartId) {
      if (errorEl) {
        errorEl.textContent = 'Корзина ещё не создана';
        errorEl.style.display = 'block';
      }
      return;
    }

    btn.disabled = true;
    if (errorEl) errorEl.style.display = 'none';

    try {
      const res = await CheckoutAPI.applyPromo(this.cartId, code);
      if (!res.success) {
        throw new Error(res.message || 'Промокод недействителен');
      }
      this.cart = res.data;
      this.updatePromoUI();
      this.updateDeliveryTotals();
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
    }
  }

  async removePromo() {
    if (!this.cartId) return;

    const btn = document.getElementById('co-btn-remove-promo');
    if (!btn) return;
    btn.disabled = true;

    try {
      const res = await CheckoutAPI.removePromo(this.cartId);
      if (!res.success) {
        throw new Error(res.message || 'Не удалось убрать промокод');
      }
      this.cart = res.data;
      this.updatePromoUI();
      this.updateDeliveryTotals();
    } catch (e) {
      const errorEl = document.getElementById('co-promo-error');
      if (errorEl) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
    }
  }

  updatePromoUI() {
    const inputRow = document.getElementById('co-promo-input-row');
    const appliedEl = document.getElementById('co-promo-applied');
    const errorEl = document.getElementById('co-promo-error');
    const input = document.getElementById('co-promo-input');

    if (errorEl) errorEl.style.display = 'none';

    if (this.cart?.promoCode) {
      if (inputRow) inputRow.style.display = 'none';
      if (appliedEl) appliedEl.style.display = '';

      const codeEl = document.getElementById('co-promo-code');
      if (codeEl) codeEl.textContent = this.cart.promoCode;

      const discount = this.cart.discountCents ?? 0;
      const discountValue = document.getElementById('co-discount-value');
      if (discountValue) {
        discountValue.textContent = discount > 0
          ? `-${this.formatPrice(discount / 100)}`
          : 'Скидка применена';
      }
    } else {
      if (inputRow) inputRow.style.display = '';
      if (appliedEl) appliedEl.style.display = 'none';
      if (input) input.value = '';
    }
  }

  showError(title, message) {
    // Single-page checkout: show error in co-error element
    const errorEl = document.getElementById('co-error');
    if (errorEl) {
      errorEl.textContent = `${title}: ${message}`;
      errorEl.style.display = 'block';
    } else {
      console.error(`Checkout error — ${title}: ${message}`);
    }
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
