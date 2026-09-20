/**
 * Cart Store module
 * Управление состоянием корзины с localStorage и синхронизацией через API
 */

import { CartAPI } from './cart-api.js';

const CART_ID_KEY = 'merfy:cartId';
const CART_ITEMS_KEY = 'merfy:cartItems';

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
    const res = await CartAPI.getCart(state.cartId);
    if (res.success && res.data) {
      syncFromCartData(res.data);
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
        // Analytics: track add_to_cart
        if (window._mfy && window._mfy.trackAddToCart) {
          window._mfy.trackAddToCart(productId, '', qty);
        }
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

    // Optimistic update — товар исчезает из UI мгновенно
    const prevItems = [...state.items];
    state.items = state.items.filter(i => i.id !== itemId);
    saveToStorage();
    notify('cart:updated', { items: state.items });

    try {
      const res = await CartAPI.removeItem(state.cartId, itemId);
      if (!res.success) {
        state.items = prevItems;
        saveToStorage();
        notify('cart:updated', { items: state.items });
        return false;
      }
      return true;
    } catch (e) {
      state.items = prevItems;
      saveToStorage();
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

    // Optimistic update — UI обновляется мгновенно
    const prevItems = [...state.items];
    const item = state.items.find(i => i.id === itemId);
    if (item) {
      item.quantity = quantity;
      saveToStorage();
      notify('cart:updated', { items: state.items });
    }

    try {
      const res = await CartAPI.updateItem(state.cartId, itemId, quantity);
      if (!res.success) {
        state.items = prevItems;
        saveToStorage();
        notify('cart:updated', { items: state.items });
        return false;
      }
      return true;
    } catch (e) {
      state.items = prevItems;
      saveToStorage();
      notify('cart:updated', { items: state.items });
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
      const price = item.unitPriceCents || item.priceCents || item.price || 0;
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
   * Залить готовый список строк (локальная корзина темы или «купить сейчас»)
   * в СВЕЖУЮ серверную корзину ОДНИМ действием.
   *
   * Зачем отдельный метод. Чекаут звал addItem в цикле, а каждый такой вызов
   * дёргал cart:updated и повторный getCart. На шести товарах это давало шесть
   * перерисовок сводки (список рос 1→2→3→4→5→6 прямо на глазах, фотографии
   * перекладывались) и шесть перезапусков расчёта доставки — лоудер «Считаем
   * варианты доставки…» мигал. Замер до правки на живом стенде: 8 событий
   * cart:updated, 9 перестроений списка, 6 морганий лоудера за 6 секунд.
   *
   * Здесь позиции уходят на сервер молча, состав забирается ОДНИМ getCart,
   * и cart:updated шлётся ОДИН раз — в конце. Так же устроен rose.
   */
  async syncLinesToServer(lines, opts) {
    const silent = !!(opts && opts.notify === false);
    const list = Array.isArray(lines) ? lines : [];
    if (!list.length) return null;

    // Свежая серверная корзина: состав берём из локальной целиком, а не
    // доливаем в старую — иначе позиции прошлого захода останутся.
    state.cartId = null;
    state.items = [];
    try {
      localStorage.removeItem(CART_ID_KEY);
      localStorage.removeItem(CART_ITEMS_KEY);
    } catch (e) {
      // localStorage may be unavailable
    }

    const cartId = await ensureCart();
    for (let i = 0; i < list.length; i++) {
      const l = list[i] || {};
      const variantId = (l.variant && l.variant.variantCombinationId) || l.variantCombinationId || null;
      try {
        await CartAPI.addItem(cartId, l.productId, l.quantity || 1, variantId);
      } catch (e) {
        // Позиция могла исчезнуть из каталога — остальные из-за неё не теряем.
      }
    }

    try {
      const res = await CartAPI.getCart(cartId);
      if (res && res.success && res.data && Array.isArray(res.data.items)) {
        state.items = res.data.items;
        saveToStorage();
      }
    } catch (e) {
      // ignore
    }

    if (!silent) notify('cart:updated', { items: state.items });
    return cartId;
  },

  /**
   * Проверка загрузки
   * @returns {boolean}
   */
  isLoading() {
    return state.loading;
  },

  // Публичная ре-синхронизация позиций из ответа сервера (плоский order с items).
  // Нужна хендлерам apply/remove промокода на чекауте: после применения
  // промокод-BOGO в ответе появляется 0₽-подарок (item.isBonus=true), после
  // снятия — исчезает. Перекладываем cartData.items в state и шлём cart:updated,
  // чтобы сводка/итоги перерисовались с подарком. cartSignature (на чекауте)
  // исключает isBonus → появление/снятие подарка НЕ сбросит applied-state.
  syncFromCartData(cartData) {
    syncFromCartData(cartData);
  },
};

// Make available globally for inline onclick handlers in Astro templates
window.cartStore = cartStore;

export default cartStore;
