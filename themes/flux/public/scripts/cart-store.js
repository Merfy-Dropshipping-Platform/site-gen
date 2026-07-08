/**
 * Cart Store module
 *
 * Single source of truth: backend (orders service).
 * localStorage хранит ТОЛЬКО merfy:cartId — items НЕ дублируются локально.
 * При init/addItem/removeItem/updateQuantity делается fetch GET /cart/:id
 * чтобы получить актуальные данные (включая live price из product service).
 *
 * Это убирает class of bugs:
 *  - stale items с frozen price в localStorage даже после изменения price
 *    в админке
 *  - zombie cart (items без cartId)
 *  - рассинхронизация между табами (одна табка положила item, другая видит
 *    старый snapshot)
 */

import { CartAPI } from './cart-api.js';

const CART_ID_KEY = 'merfy:cartId';

/** @type {{ items: Array<any>, cartId: string|null, loading: boolean }} */
const state = {
  items: [],
  cartId: null,
  loading: false,
};

function saveCartId() {
  try {
    if (state.cartId) {
      localStorage.setItem(CART_ID_KEY, state.cartId);
    } else {
      localStorage.removeItem(CART_ID_KEY);
    }
    // Чистим устаревший ключ от старого хранилища (миграция; можно удалить
    // через 1-2 релиза когда у всех юзеров localStorage уже без него).
    localStorage.removeItem('merfy:cartItems');
  } catch (e) {
    // localStorage may be unavailable (private mode etc.)
  }
}

function notify(eventName, detail) {
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function applyCartData(cartData) {
  // Backend возвращает items с актуальной ценой (joined с product
  // на стороне cart.service для status=cart). Frontend просто принимает.
  if (cartData && Array.isArray(cartData.items)) {
    state.items = cartData.items;
  } else {
    state.items = [];
  }
  notify('cart:updated', { items: state.items });
}

async function fetchAndApply() {
  if (!state.cartId) {
    state.items = [];
    notify('cart:updated', { items: state.items });
    return;
  }
  try {
    const res = await CartAPI.getCart(state.cartId);
    if (res.success && res.data) {
      applyCartData(res.data);
    } else {
      // Cart expired / not found — reset
      state.cartId = null;
      state.items = [];
      saveCartId();
      notify('cart:updated', { items: state.items });
    }
  } catch (e) {
    // Network error — оставляем empty (без stale data)
  }
}

async function ensureCart() {
  if (state.cartId) return state.cartId;
  const res = await CartAPI.createCart();
  if (res.success && res.data?.id) {
    state.cartId = res.data.id;
    saveCartId();
    return state.cartId;
  }
  throw new Error(res.message || 'Не удалось создать корзину');
}

export const cartStore = {
  /**
   * Инициализация — читаем cartId из localStorage и тянем актуальные items
   * с backend. Если cartId null → state.items = [] (пустая корзина).
   */
  async init() {
    try {
      state.cartId = localStorage.getItem(CART_ID_KEY) || null;
    } catch (e) {
      state.cartId = null;
    }
    // Cleanup legacy key
    saveCartId();
    notify('cart:updated', { items: state.items });
    await fetchAndApply();
  },

  /**
   * Добавить товар в корзину
   * @param {string} productId
   * @param {string|null} variantId
   * @param {number} quantity
   * @param {Record<string,string>|null} options — опции варианта (Цвет/Размер);
   *   сервер пере-матчит вариант по ним, если variantId (combinationId) устарел
   *   (ресед пересоздал комбинации). Необязателен — обратная совместимость.
   */
  async addItem(productId, variantId, quantity, options) {
    const qty = quantity || 1;
    state.loading = true;
    try {
      const cartId = await ensureCart();
      const res = await CartAPI.addItem(cartId, productId, qty, variantId, options || null);
      if (res.success) {
        await fetchAndApply();
        notify('cart:item-added', { productId, variantId, quantity: qty });
        if (window._mfy && window._mfy.trackAddToCart) {
          window._mfy.trackAddToCart(productId, '', qty);
        }
        return true;
      }
      throw new Error(res.message || 'Ошибка добавления');
    } catch (e) {
      // Если cart invalid — пересоздаём
      if (e.message && e.message.includes('не найден')) {
        state.cartId = null;
        saveCartId();
        try {
          const cartId = await ensureCart();
          const res = await CartAPI.addItem(cartId, productId, qty, variantId, options || null);
          if (res.success) {
            await fetchAndApply();
            notify('cart:item-added', { productId, variantId, quantity: qty });
            return true;
          }
        } catch (e2) {
          /* give up */
        }
      }
      return false;
    } finally {
      state.loading = false;
    }
  },

  /**
   * Удалить товар из корзины
   * @param {string} itemId
   */
  async removeItem(itemId) {
    if (!state.cartId) return false;
    // Optimistic update — UI обновляется мгновенно (но source-of-truth — backend)
    const prevItems = [...state.items];
    state.items = state.items.filter((i) => i.id !== itemId);
    notify('cart:updated', { items: state.items });
    try {
      const res = await CartAPI.removeItem(state.cartId, itemId);
      if (!res.success) {
        state.items = prevItems;
        notify('cart:updated', { items: state.items });
        return false;
      }
      // Roundtrip — берём свежие данные с backend (включая обновлённые prices)
      await fetchAndApply();
      return true;
    } catch (e) {
      state.items = prevItems;
      notify('cart:updated', { items: state.items });
      return false;
    }
  },

  /**
   * Обновить количество товара
   * @param {string} itemId
   * @param {number} quantity
   */
  async updateQuantity(itemId, quantity) {
    if (!state.cartId || quantity < 1) return false;
    // Optimistic
    const prevItems = JSON.parse(JSON.stringify(state.items));
    const item = state.items.find((i) => i.id === itemId);
    if (item) {
      item.quantity = quantity;
      notify('cart:updated', { items: state.items });
    }
    try {
      const res = await CartAPI.updateItem(state.cartId, itemId, quantity);
      if (!res.success) {
        state.items = prevItems;
        notify('cart:updated', { items: state.items });
        return false;
      }
      await fetchAndApply();
      return true;
    } catch (e) {
      state.items = prevItems;
      notify('cart:updated', { items: state.items });
      return false;
    }
  },

  /** Force-refresh from backend (например после возврата на витрину) */
  async refresh() {
    await fetchAndApply();
  },

  /** @returns {Array<any>} */
  getItems() {
    return state.items;
  },

  /** @returns {number} total quantity */
  getCount() {
    return state.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  },

  /** @returns {number} sum in kopeyki */
  getTotal() {
    return state.items.reduce((sum, item) => {
      const price = item.unitPriceCents || item.priceCents || item.price || 0;
      return sum + price * (item.quantity || 0);
    }, 0);
  },

  /** @returns {string|null} */
  getCartId() {
    return state.cartId;
  },

  /** Полная очистка (localStorage + memory) */
  clear() {
    state.cartId = null;
    state.items = [];
    saveCartId();
    notify('cart:updated', { items: [] });
  },

  /** @returns {boolean} */
  isLoading() {
    return state.loading;
  },

  // Публичная ре-синхронизация позиций из ответа сервера (плоский order с items).
  // Нужна хендлерам apply/remove промокода на чекауте: после применения
  // промокод-BOGO в ответе появляется 0₽-подарок (item.isBonus=true), после
  // снятия — исчезает. applyCartData перекладывает cartData.items в state и шлёт
  // cart:updated, чтобы сводка/итоги перерисовались с подарком. cartSignature
  // (на чекауте) исключает isBonus → появление/снятие подарка НЕ сбросит
  // applied-state. (flux: items не дублируются в localStorage — single source of
  // truth backend; персиста items здесь не требуется.)
  syncFromCartData(cartData) {
    applyCartData(cartData);
  },
};

// Make available globally for inline onclick handlers in Astro templates
window.cartStore = cartStore;

export default cartStore;
