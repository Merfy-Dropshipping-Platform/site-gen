/**
 * Cart Store module
 * Управление состоянием корзины с localStorage и синхронизацией через API
 */

import { CartAPI } from './cart-api.js';

const CART_ID_KEY = 'merfy:cartId';
const CART_ITEMS_KEY = 'merfy:cartItems';

/** @type {{ items: Array<any>, cartId: string|null, loading: boolean, syncPromise: Promise<string|null>|null }} */
const state = {
  items: [],
  cartId: null,
  loading: false,
  // In-flight serverka-sync. Дедуплицирует параллельные syncToServer (фоновый
  // синк на чекауте + apply-промокода + сабмит): все ждут ОДНУ корзину, иначе
  // получаем 2-3 серверные корзины на один заказ.
  syncPromise: null,
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

// ── Само-лечение корзины из АКТУАЛЬНОГО каталога ──────────────────────────────
// Корзина по сути хранит ID+кол-во; цена/имя/картинка — снимок с момента добавления
// и устаревает, когда мерчант меняет цену или удаляет товар. Без пере-резолва
// страница корзины показывает старую цену, а checkout (серверный синк) — новую →
// «в корзине и в оформлении разное». Пере-резолв приводит ОБА дисплея (оба читают
// getItems()) к текущему каталогу. Цены products.json — в РУБЛЯХ → *100 в копейки.
const optionsMatch = (catalogOpts, itemOpts) => {
  if (!catalogOpts || !itemOpts) return false;
  const keys = Object.keys(itemOpts);
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (String(catalogOpts[k]) !== String(itemOpts[k])) return false;
  }
  return true;
};

/**
 * Чистый пере-резолв позиций из каталога (экспорт для юнит-теста).
 * Товар/вариант отсутствует в каталоге → строка ВЫКИДЫВАЕТСЯ (удалён мерчантом).
 * Мёртвый variantCombinationId → ре-матч по options (Цвет/Размер). isBonus не трогаем.
 * @param {Array<any>} items
 * @param {Array<any>} products
 * @returns {{items: Array<any>, changed: boolean, dropped: number}}
 */
export function reconcileItemsAgainstCatalog(items, products) {
  if (!Array.isArray(items) || items.length === 0) return { items: items || [], changed: false, dropped: 0 };
  if (!Array.isArray(products) || products.length === 0) return { items, changed: false, dropped: 0 };
  const byId = new Map();
  for (const p of products) {
    if (p && p.id != null) byId.set(String(p.id), p);
  }
  let changed = false;
  let dropped = 0;
  const next = [];
  for (const it of items) {
    if (it && it.isBonus) { next.push(it); continue; } // серверный подарок (0₽) — не трогаем
    const p = it ? byId.get(String(it.productId)) : null;
    if (!p) { changed = true; dropped++; continue; } // товар удалён из каталога → выкинуть
    const combos = Array.isArray(p.variantCombinations) ? p.variantCombinations : [];
    let combo = null;
    if (combos.length > 0) {
      const vcId = it.variantCombinationId;
      if (vcId) combo = combos.find((c) => String(c.id) === String(vcId)) || null;
      if (!combo && it.options) combo = combos.find((c) => optionsMatch(c.options, it.options)) || null;
      if (!combo) { changed = true; dropped++; continue; } // вариант удалён → выкинуть
    }
    const priceRub = combo ? Number(combo.price) : Number(p.price);
    const priceCents = Number.isFinite(priceRub) ? Math.round(priceRub * 100) : (it.unitPriceCents || it.priceCents || 0);
    const oldRaw = combo ? combo.compareAtPrice : p.compareAtPrice;
    const oldCents = (oldRaw != null && Number.isFinite(Number(oldRaw))) ? Math.round(Number(oldRaw) * 100) : undefined;
    const name = p.name || it.name;
    const image = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (it.imageUrl || it.image);
    const qty = it.quantity || 1;
    const nit = {
      ...it,
      name,
      imageUrl: image,
      image,
      priceCents,
      unitPriceCents: priceCents,
      totalCents: priceCents * qty,
      compareAtPriceCents: oldCents,
    };
    if (combo) nit.variantCombinationId = String(combo.id);
    if (
      nit.priceCents !== it.priceCents ||
      nit.unitPriceCents !== it.unitPriceCents ||
      nit.name !== it.name ||
      nit.imageUrl !== it.imageUrl ||
      nit.variantCombinationId !== it.variantCombinationId
    ) {
      changed = true;
    }
    next.push(nit);
  }
  return { items: next, changed, dropped };
}

// Кэш каталога на сессию (одна сетевая загрузка на страницу). Ошибка/пустой → [];
// тогда reconcile НЕ трогает корзину (оффлайн-защита — не теряем товары при недоступном
// каталоге). cache:'default' — уважаем cache-заголовки products.json (свежесть = публикация).
let catalogPromise = null;
function loadCatalogProducts(url) {
  if (!catalogPromise) {
    catalogPromise = fetch(url, { cache: 'default' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const arr = Array.isArray(j) ? j : (j && (j.products || j.data)) || [];
        return Array.isArray(arr) ? arr : [];
      })
      .catch(() => []);
  }
  return catalogPromise;
}

// Пере-резолвит state.items из products.json и, если что-то поменялось (цена/имя/
// картинка/выкинутый товар), сохраняет + шлёт cart:updated → сводка/корзина перерисуются.
async function reconcileFromCatalog(url) {
  if (typeof window === 'undefined') return;
  if (!Array.isArray(state.items) || state.items.length === 0) return;
  const products = await loadCatalogProducts(url || '/data/products.json');
  const result = reconcileItemsAgainstCatalog(state.items, products);
  if (result.changed) {
    state.items = result.items;
    saveToStorage();
    notify('cart:updated', { items: state.items });
  }
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

    // Серверная корзина (по сохранённому cartId) — лишь СНИМОК с последнего
    // syncToServer; локальная (merfy:cartItems) отражает ТЕКУЩИЙ состав (юзер мог
    // менять товары/кол-во без серверного синка). НЕ перетираем НЕПУСТУЮ локальную
    // стейл-серверной — иначе на чекауте корректная корзина мерцает и заменяется
    // старой серверной (баг: другие товары/цены/картинки). Пул с сервера ТОЛЬКО
    // когда локальная ПУСТА (восстановление, напр. новое устройство/новая вкладка).
    // На промокоде/сабмите syncToServer создаёт СВЕЖУЮ серверную корзину из локальной.
    if (state.cartId && state.items.length === 0) {
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

    // Само-лечение: пере-резолв цен/наличия из текущего каталога (products.json).
    // Страница корзины наполняется через init() (BaseLayout зовёт на КАЖДОЙ странице)
    // → корзина всегда показывает актуальные цены, ровно как checkout.
    reconcileFromCatalog();
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

  // Spec — мгновенный рендер чекаута: ставит элементы В ПАМЯТЬ (из nt-cart),
  // БЕЗ серверных запросов. getItems()/getTotal() читают их сразу.
  setLocalItems(items) {
    state.items = Array.isArray(items) ? items : [];
    saveToStorage();
    notify('cart:updated', { items: state.items });
    // Само-лечение: checkout передаёт display из nt-cart (снимок add-time цен) →
    // пере-резолвим из каталога, чтобы сводка показала АКТУАЛЬНЫЕ цены/наличие.
    reconcileFromCatalog();
  },

  // Публичный пере-резолв позиций из products.json (само-лечение стейл-цен и
  // удалённых товаров). Автоматически зовётся из init()/setLocalItems();
  // экспонируем для ручного вызова из блоков при необходимости.
  reconcileFromCatalog(url) {
    return reconcileFromCatalog(url);
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

  // Синк серверной корзины из текущих (display) items. Используется и при
  // «Оформить», и для ФОНОВОГО синка на чекауте (чтобы показать серверные данные —
  // в т.ч. авто-BOGO-подарок 0₽-позицией — ДО сабмита).
  //
  // opts.notify=true → после синка шлёт cart:updated, чтобы сводка/итоги
  //   пере-рендерились из серверных items (с подарком). Сабмит зовёт без notify
  //   (он сразу уходит на оплату — лишний рендер не нужен).
  //
  // Дедупликация: параллельные вызовы (фоновый + apply-промокода + сабмит)
  //   получают ОДНУ in-flight корзину через state.syncPromise — иначе плодим
  //   2-3 серверные корзины на один заказ.
  //
  // Возвращает cartId (или null если корзина пуста).
  async syncToServer(opts) {
    const notify_ = !!(opts && opts.notify);
    if (state.syncPromise) {
      // Уже идёт синк — переиспользуем его cartId. notify предыдущего вызова
      // отрендерит сводку; если этот вызов тоже хочет notify, дёрнем после.
      const existing = await state.syncPromise;
      if (notify_ && existing) notify('cart:updated', { items: state.items });
      return existing;
    }
    const lines = state.items || [];
    if (!lines.length) return null;

    const run = (async () => {
      state.cartId = null;
      try { localStorage.removeItem(CART_ID_KEY); } catch (e) {}
      const cartId = await ensureCart();
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        try { await CartAPI.addItem(cartId, l.productId, l.quantity || 1, l.variantCombinationId || null); } catch (e) {}
      }
      try {
        const res = await CartAPI.getCart(cartId);
        if (res && res.success && res.data && Array.isArray(res.data.items)) {
          // Серверные items могут включать 0₽-bonus-позицию (авто-BOGO «Подарок»).
          state.items = res.data.items; saveToStorage();
        }
      } catch (e) {}
      return cartId;
    })();

    state.syncPromise = run;
    try {
      const cartId = await run;
      // Фоновый синк: перерисовать сводку серверными items (с подарком).
      if (notify_) notify('cart:updated', { items: state.items });
      return cartId;
    } finally {
      state.syncPromise = null;
    }
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
if (typeof window !== 'undefined') window.cartStore = cartStore;

export default cartStore;
