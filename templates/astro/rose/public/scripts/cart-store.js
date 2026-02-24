/**
 * Cart Store module
 * Управление состоянием корзины с localStorage и синхронизацией через API
 */

import { CartAPI } from './cart-api.js';

const CART_ID_KEY = 'merfy_cart_id';
const CART_ITEMS_KEY = 'merfy_cart_items';

/** @type {{ items: Array<any>, cartId: string|null, loading: boolean }} */
const state = {
  items: [],
  cartId: null,
  loading: false,
};

function saveToStorage() {
  try {
    if (state.cartId) {
      localStorage.setItem(CART_ID_KEY, state.cartId);
    } else {
      localStorage.removeItem(CART_ID_KEY);
    }
    localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(state.items));
  } catch (e) {
    // localStorage may be unavailable
  }
}

function loadFromStorage() {
  try {
    state.cartId = localStorage.getItem(CART_ID_KEY) || null;
    const raw = localStorage.getItem(CART_ITEMS_KEY);
    state.items = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.items = [];
    state.cartId = null;
  }
}

function notify(eventName, detail) {
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function syncFromCartData(cartData) {
  if (cartData && Array.isArray(cartData.items)) {
    state.items = cartData.items;
  }
  saveToStorage();
  notify('cart:updated', { items: state.items });
}

async function refreshCart() {
  if (!state.cartId) return;
  try {
    const apiUrl = window.__MERFY_CONFIG__?.apiUrl || 'https://gateway.merfy.ru/api';
    const res = await fetch(`${apiUrl}/orders/cart/${state.cartId}?_t=${Date.now()}`, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
    const data = await res.json();
    if (data.success && data.data) {
      syncFromCartData(data.data);
    }
  } catch (e) {
    // ignore refresh errors
  }
}

async function ensureCart() {
  if (state.cartId) return state.cartId;

  const res = await CartAPI.createCart();
  if (res.success && res.data?.id) {
    state.cartId = res.data.id;
    saveToStorage();
    return state.cartId;
  }
  throw new Error(res.message || 'Не удалось создать корзину');
}

export const cartStore = {
  /**
   * Инициализация: загрузить из localStorage и проверить на сервере
   */
  async init() {
    loadFromStorage();
    notify('cart:updated', { items: state.items });

    if (state.cartId) {
      try {
        const res = await CartAPI.getCart(state.cartId);
        if (res.success && res.data) {
          syncFromCartData(res.data);
        } else {
          // Cart expired or invalid — reset
          state.cartId = null;
          state.items = [];
          saveToStorage();
          notify('cart:updated', { items: state.items });
        }
      } catch (e) {
        // Network error — keep local cache, don't reset
      }
    }
  },

  /**
   * Добавить товар в корзину
   * @param {string} productId
   * @param {string|null} variantId
   * @param {number} quantity
   */
  async addItem(productId, variantId, quantity) {
    const qty = quantity || 1;
    state.loading = true;

    try {
      const cartId = await ensureCart();
      const res = await CartAPI.addItem(cartId, productId, qty, variantId);
      if (res.success) {
        await refreshCart();
        notify('cart:item-added', { productId, variantId, quantity: qty });
        return true;
      }
      throw new Error(res.message || 'Ошибка добавления');
    } catch (e) {
      // If cart invalid, try creating new one
      if (e.message && e.message.includes('не найден')) {
        state.cartId = null;
        saveToStorage();
        try {
          const cartId = await ensureCart();
          const res = await CartAPI.addItem(cartId, productId, qty, variantId);
          if (res.success) {
            await refreshCart();
            notify('cart:item-added', { productId, variantId, quantity: qty });
            return true;
          }
        } catch (e2) {
          // give up
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

    try {
      const res = await CartAPI.removeItem(state.cartId, itemId);
      if (res.success) {
        await refreshCart();
        return true;
      }
      return false;
    } catch (e) {
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

    try {
      const res = await CartAPI.updateItem(state.cartId, itemId, quantity);
      if (res.success) {
        await refreshCart();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  /**
   * Получить элементы корзины
   * @returns {Array<any>}
   */
  getItems() {
    return state.items;
  },

  /**
   * Получить количество товаров в корзине
   * @returns {number}
   */
  getCount() {
    return state.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  },

  /**
   * Получить общую сумму в копейках
   * @returns {number}
   */
  getTotal() {
    return state.items.reduce((sum, item) => {
      const price = item.priceCents || item.price || 0;
      return sum + price * (item.quantity || 0);
    }, 0);
  },

  /**
   * Получить cartId
   * @returns {string|null}
   */
  getCartId() {
    return state.cartId;
  },

  /**
   * Очистить корзину
   */
  clear() {
    state.cartId = null;
    state.items = [];
    try {
      localStorage.removeItem(CART_ID_KEY);
      localStorage.removeItem(CART_ITEMS_KEY);
    } catch (e) {
      // ignore
    }
    notify('cart:updated', { items: [] });
  },

  /**
   * Проверка загрузки
   * @returns {boolean}
   */
  isLoading() {
    return state.loading;
  },
};

// Make available globally for inline onclick handlers in Astro templates
window.cartStore = cartStore;

export default cartStore;
