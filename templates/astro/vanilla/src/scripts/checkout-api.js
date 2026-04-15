/**
 * Checkout API module
 * Работа с API заказов Merfy
 */

// Конфигурация читается из window.__MERFY_CONFIG__
function getConfig() {
  return {
    apiUrl: window.__MERFY_CONFIG__?.apiUrl || 'https://gateway.merfy.ru/api',
    shopId: window.__MERFY_CONFIG__?.shopId || '',
  };
}

async function request(path, options = {}) {
  const { apiUrl } = getConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json();

  // NestJS error responses have { statusCode, message } instead of { success, data }
  if (!res.ok && data.statusCode && !('success' in data)) {
    return { success: false, message: data.message || `Ошибка сервера (${data.statusCode})` };
  }

  return data;
}

export const CheckoutAPI = {
  /**
   * Создать корзину
   * @returns {Promise<{success: boolean, data: {id: string}}>}
   */
  async createCart() {
    const { shopId } = getConfig();
    return request('/orders/cart', {
      method: 'POST',
      body: JSON.stringify({ shopId }),
    });
  },

  /**
   * Получить корзину по ID
   * @param {string} cartId
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async getCart(cartId) {
    return request(`/orders/cart/${cartId}`);
  },

  /**
   * Добавить товар в корзину
   * @param {string} cartId
   * @param {string} productId
   * @param {number} quantity
   */
  async addItem(cartId, productId, quantity = 1) {
    return request(`/orders/cart/${cartId}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    });
  },

  /**
   * Установить данные покупателя
   * @param {string} cartId
   * @param {{email?: string, phone?: string, name?: string}} data
   */
  async setCustomer(cartId, data) {
    return request(`/orders/cart/${cartId}/customer`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Установить адрес доставки
   * @param {string} cartId
   * @param {{city?: string, street?: string, building?: string, apartment?: string, postalCode?: string}} address
   */
  async setAddress(cartId, address) {
    return request(`/orders/cart/${cartId}/address`, {
      method: 'PATCH',
      body: JSON.stringify(address),
    });
  },

  /**
   * Установить способ доставки
   * @param {string} cartId
   * @param {string} deliveryType
   * @param {number} deliveryCostCents
   */
  async setDelivery(cartId, deliveryType, deliveryCostCents) {
    return request(`/orders/cart/${cartId}/delivery`, {
      method: 'PATCH',
      body: JSON.stringify({ deliveryType, deliveryCostCents }),
    });
  },

  /**
   * Оформить заказ (checkout)
   * @param {string} cartId
   * @returns {Promise<{success: boolean, data: {id: string, orderNumber: string}}>}
   */
  async checkout(cartId) {
    // Pass browser analytics session/visitor IDs for accurate conversion tracking
    const metadata = {};
    try {
      const sid = document.cookie.match(/(?:^|;\s*)_mfy_sid=([^;]+)/);
      const vid = document.cookie.match(/(?:^|;\s*)_mfy_vid=([^;]+)/);
      if (sid) metadata.sessionId = sid[1];
      if (vid) metadata.visitorId = vid[1];
    } catch { /* best-effort */ }

    return request(`/orders/cart/${cartId}/checkout`, {
      method: 'POST',
      body: Object.keys(metadata).length > 0 ? JSON.stringify({ metadata }) : undefined,
    });
  },

  /**
   * Создать платёж в ЮKassa
   * @param {string} orderId
   * @param {string} returnUrl URL для возврата после оплаты
   * @returns {Promise<{success: boolean, data: {paymentId: string, confirmationUrl: string, status: string}}>}
   */
  async createPayment(orderId, returnUrl) {
    return request(`/orders/${orderId}/create-payment`, {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  },

  /**
   * Получить статус платежа
   * @param {string} orderId
   * @returns {Promise<{success: boolean, data: {status: string, paymentMethod?: string, paidAt?: string}}>}
   */
  async getPaymentStatus(orderId) {
    return request(`/orders/${orderId}/payment-status`);
  },

  /**
   * Применить промокод к корзине
   * @param {string} cartId
   * @param {string} promoCode
   * @returns {Promise<{success: boolean, data: object, message?: string}>}
   */
  async applyPromo(cartId, promoCode) {
    return request(`/orders/cart/${cartId}/promo`, {
      method: 'POST',
      body: JSON.stringify({ promoCode }),
    });
  },

  /**
   * Убрать промокод из корзины
   * @param {string} cartId
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async removePromo(cartId) {
    return request(`/orders/cart/${cartId}/promo`, {
      method: 'DELETE',
    });
  },

  /**
   * Рассчитать тарифы доставки СДЭК
   * @param {string} cartId
   * @param {{cityFiasId: string, postalCode?: string}} data
   * @returns {Promise<{success: boolean, data: {tariffs: Array, pickupAvailable: boolean, pickupAddress?: string}}>}
   */
  async calculateDelivery(cartId, data) {
    const { shopId } = getConfig();
    return request(`/store/carts/${cartId}/delivery/calculate?store_id=${encodeURIComponent(shopId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Выбрать способ доставки
   * @param {string} cartId
   * @param {{type: string, tariffCode?: number|null, deliveryCostCents: number, pickupPointCode?: string, pickupPointAddress?: string}} data
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async selectDelivery(cartId, data) {
    return request(`/store/carts/${cartId}/delivery/select`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Получить пункты выдачи СДЭК для города
   * @param {string} cartId
   * @param {string} cityFiasId
   * @returns {Promise<{success: boolean, data: Array<{code: string, name: string, address: string, workTime: string, type: 'PVZ'|'POSTAMAT'}>}>}
   */
  async getPickupPoints(cartId, cityFiasId) {
    const { shopId } = getConfig();
    const params = new URLSearchParams({ cityFiasId, store_id: shopId });
    return request(`/store/carts/${cartId}/delivery/pickup-points?${params}`);
  },
};

export default CheckoutAPI;
