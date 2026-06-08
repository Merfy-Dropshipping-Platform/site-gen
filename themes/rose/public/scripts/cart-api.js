/**
 * Cart API module
 * Работа с API корзины Merfy
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
    cache: 'no-store',
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

export const CartAPI = {
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
   * @param {string|null} variantCombinationId
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async addItem(cartId, productId, quantity = 1, variantCombinationId = null) {
    const body = { productId, quantity };
    if (variantCombinationId) {
      body.variantCombinationId = variantCombinationId;
    }
    return request(`/orders/cart/${cartId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * Обновить количество товара в корзине
   * @param {string} cartId
   * @param {string} itemId
   * @param {number} quantity
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async updateItem(cartId, itemId, quantity) {
    return request(`/orders/cart/${cartId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  },

  /**
   * Удалить товар из корзины
   * @param {string} cartId
   * @param {string} itemId
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async removeItem(cartId, itemId) {
    return request(`/orders/cart/${cartId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },
};

export default CartAPI;
