/**
 * Checkout API module
 * Работа с API заказов Merfy
 */

// Конфигурация читается из window.__MERFY_CONFIG__
function getConfig() {
  return {
    apiUrl: window.__MERFY_CONFIG__?.apiUrl || 'https://api.merfy.ru',
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
  return res.json();
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
    return request(`/orders/cart/${cartId}/checkout`, {
      method: 'POST',
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
};

export default CheckoutAPI;
