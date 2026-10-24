/**
 * Оплата предложения расширения в чекауте магазина (spec 120, Б10).
 *
 * Ссылка из письма ведёт на `/checkout?offer=<токен>`. Позиции и цены такого
 * заказа выставляет расширение, покупатель их не меняет, поэтому чекаут в этом
 * режиме:
 *  - берёт позиции и итог из `GET <api>/pay/<токен>/offer` (только чтение);
 *  - не трогает корзину покупателя: настоящий `window.cartStore` не
 *    выставляется вовсе, вместо него — хранилище только для чтения с теми же
 *    методами, поэтому скрипты страниц и блоки не создают серверную корзину и не
 *    пишут `merfy:cartId` / `merfy:pendingOrder`;
 *  - не требует регистрации магазина (`requireCustomerAuth`): доступ даёт токен;
 *  - расчёт доставки, пункты выдачи и оформление идут на `/pay/<токен>/offer/*`;
 *    цену доставки считает сервер.
 *
 * Вне режима (нет `?offer=`) скрипт ничего не делает. Исходник строкой, как
 * runtime/checkout-start-analytics.ts: на собранной витрине обычный
 * `<script>import…</script>` даёт 404. Ставится ПЕРВЫМ в «Оформлении заказа»
 * (CheckoutForm), раньше блоков и скриптов страницы: блоки читают
 * `window.__merfyOffer` при своём запуске.
 *
 * Состояние: `window.__merfyOffer = { token, loaded, error, data, message() }`.
 * События на document: `checkout:offer-ready` (detail — предложение),
 * `checkout:offer-error` (detail.code), а также `cart:updated` и повторный
 * `checkout:config-ready` (настройка доставки магазина приходит с предложением).
 */
export const CHECKOUT_OFFER_SOURCE = `(function () {
  if (window.__merfyOffer) return;
  var token = '';
  try { token = new URLSearchParams(window.location.search).get('offer') || ''; } catch (e) { token = ''; }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;

  var TEXT = {
    pay_link_invalid: 'Ссылка недействительна. Если вы уже оплатили — продавец увидит оплату. Свяжитесь с продавцом',
    already_paid: 'Заказ уже оплачен. Спасибо!',
    offer_changed: 'Продавец изменил заказ. Обновляем страницу…',
    insufficient_stock: 'Товара нет в нужном количестве. Свяжитесь с продавцом',
    order_processing: 'Заказ оформляется. Повторите через несколько секунд',
    payments_not_configured: 'Магазин сейчас не принимает онлайн-оплату',
    shop_frozen: 'Магазин временно недоступен',
    delivery_option_unavailable: 'Выбранный способ доставки больше недоступен. Выберите другой',
    delivery_incomplete: 'Заполните телефон, адрес и пункт выдачи',
    delivery_unavailable: 'Не удалось рассчитать доставку. Попробуйте ещё раз через минуту',
    invalid_phone: 'Проверьте номер телефона',
    customer_required: 'Укажите имя',
    payment_create_failed: 'Не удалось перейти к оплате. Попробуйте ещё раз через минуту',
    network: 'Не удалось загрузить заказ. Обновите страницу через минуту',
    offer_unavailable: 'Не удалось загрузить заказ. Обновите страницу через минуту',
    orders_unavailable: 'Не удалось загрузить заказ. Обновите страницу через минуту',
    shop_unknown: 'Магазин не определён. Откройте ссылку из письма ещё раз'
  };
  var FALLBACK = 'Не удалось оформить заказ. Попробуйте ещё раз через минуту';

  var offer = {
    token: token,
    loaded: false,
    error: '',
    data: null,
    message: function (code, details) {
      if (code === 'insufficient_stock' && details && typeof details.itemName === 'string' && details.itemName) {
        return 'Товара «' + details.itemName + '» нет в нужном количестве. Свяжитесь с продавцом';
      }
      return TEXT[code] || FALLBACK;
    }
  };
  window.__merfyOffer = offer;

  var lines = [];
  var pass = function () { return Promise.resolve(null); };
  var refuse = function () { return Promise.resolve(false); };
  var store = {
    init: pass,
    refresh: pass,
    syncToServer: pass,
    // У витрин свои методы заполнения корзины из локальной (rose, vanilla, satin,
    // bloom): страницы чекаута зовут их на загрузке — здесь они ничего не делают.
    syncLinesToServer: pass,
    reconcileFromCatalog: pass,
    setLocalItemsReconciled: function () {},
    addItem: refuse,
    removeItem: refuse,
    updateQuantity: refuse,
    clear: function () {},
    setLocalItems: function () {},
    syncFromCartData: function () {},
    getItems: function () { return lines; },
    getCount: function () {
      return lines.reduce(function (sum, l) { return sum + (l.quantity || 0); }, 0);
    },
    getTotal: function () {
      return lines.reduce(function (sum, l) { return sum + (l.unitPriceCents || 0) * (l.quantity || 0); }, 0);
    },
    getServerCart: function () { return null; },
    getCartId: function () { return null; },
    isLoading: function () { return false; }
  };
  try {
    Object.defineProperty(window, 'cartStore', {
      configurable: true,
      enumerable: true,
      get: function () { return store; },
      set: function () {}
    });
  } catch (e) { window.cartStore = store; }

  var cfg = (window.__MERFY_CONFIG__ = window.__MERFY_CONFIG__ || {});
  cfg.checkout = {
    contactMethod: 'email-phone',
    customerNameMode: 'name-surname',
    addressRequired: true,
    requireCustomerAuth: false
  };

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }
  function base() {
    var c = window.__MERFY_CONFIG__ || {};
    return c.apiUrl || 'https://gateway.merfy.ru/api';
  }
  function lineOf(i) {
    var unit = i.unitPriceCents || 0;
    return {
      id: i.id,
      productId: i.productId,
      variantCombinationId: i.variantCombinationId || null,
      name: i.name,
      quantity: i.quantity || 1,
      unitPriceCents: unit,
      priceCents: unit,
      imageUrl: i.imageUrl || '',
      image: i.imageUrl || '',
      options: i.options || {}
    };
  }
  function fail(code) {
    offer.error = code || 'offer_unavailable';
    emit('checkout:offer-error', { code: offer.error });
  }
  function apply(data) {
    // Оформить можно только черновик: оформленный, оплаченный и закрытый заказ
    // показывает страница ссылки шлюза (она же ведёт на повторную оплату).
    if (!data || data.editable !== true) {
      window.location.replace(base() + '/pay/' + token);
      return;
    }
    offer.data = data;
    offer.loaded = true;
    lines = (data.items || []).map(lineOf);
    var c = (window.__MERFY_CONFIG__ = window.__MERFY_CONFIG__ || {});
    c.checkout = {
      contactMethod: 'email-phone',
      customerNameMode: 'name-surname',
      addressRequired: data.deliveryRequired !== false,
      requireCustomerAuth: false
    };
    emit('checkout:config-ready');
    emit('cart:updated', { items: lines });
    emit('checkout:offer-ready', data);
  }
  function load() {
    var shopId = (window.__MERFY_CONFIG__ || {}).shopId || '';
    if (!shopId) { fail('shop_unknown'); return; }
    fetch(base() + '/pay/' + token + '/offer?store_id=' + encodeURIComponent(shopId), {
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          return { ok: res.ok, json: json };
        });
      })
      .then(function (r) {
        if (r.ok && r.json && r.json.success && r.json.data) apply(r.json.data);
        else fail(r.json && r.json.code);
      })
      .catch(function () { fail('network'); });
  }

  // shopId и apiUrl ставят скрипты страницы ниже блоков — читаем после разбора.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();`;
