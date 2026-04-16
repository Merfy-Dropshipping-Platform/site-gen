/**
 * Checkout result page logic
 * Polling статуса платежа после возврата с ЮKassa
 */

const API_BASE = window.__MERFY_CONFIG__?.apiUrl || 'https://gateway.merfy.ru/api';

async function checkPaymentStatus() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');

  if (!orderId) {
    showFailed('Заказ не найден. Проверьте ссылку или вернитесь в магазин.');
    return;
  }

  // Polling статуса (до 60 секунд, каждые 2 секунды)
  let attempts = 0;
  const maxAttempts = 30;

  async function poll() {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/payment-status`);
      const data = await res.json();

      // NestJS error responses: { statusCode, message }
      if (!res.ok && data.statusCode && !('success' in data)) {
        throw new Error(data.message || `Ошибка сервера (${data.statusCode})`);
      }

      if (!data.success) {
        throw new Error(data.message || 'Ошибка проверки статуса');
      }

      const status = data.data.status;

      switch (status) {
        case 'succeeded':
          showSuccess(orderId);
          return;

        case 'canceled':
        case 'cancelled':
          showFailed('Платёж был отменён.');
          return;

        case 'pending':
        case 'waiting_for_capture':
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 2000);
          } else {
            showPending();
          }
          return;

        default:
          // Неизвестный статус — попробуем ещё раз
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 2000);
          } else {
            showPending();
          }
      }
    } catch (e) {
      console.error('Payment status check error:', e);
      if (attempts < 5) {
        // При ошибках сети пробуем ещё несколько раз
        attempts++;
        setTimeout(poll, 3000);
      } else {
        showFailed(e.message || 'Не удалось проверить статус платежа.');
      }
    }
  }

  poll();
}

function showSection(id) {
  document.querySelectorAll('.result-section').forEach((el) => {
    el.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
}

function showSuccess(orderId) {
  document.getElementById('order-number').textContent = `Заказ #${orderId.slice(-8).toUpperCase()}`;
  // Трекинг покупки для воронки конверсии
  if (window._mfy && window._mfy.trackPurchase) {
    try {
      const cart = JSON.parse(localStorage.getItem('merfy-cart') || '[]');
      const totalCents = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
      window._mfy.trackPurchase(orderId, totalCents, cart.map(item => ({
        id: item.id, name: item.name, price: item.price, qty: item.quantity || 1
      })));
    } catch (e) { /* cart may already be cleared */ }
  }
  // Очищаем корзину после успешной оплаты
  try { localStorage.removeItem('merfy-cart'); } catch (e) { /* ignore */ }
  showSection('result-success');
}

function showPending() {
  showSection('result-pending');
}

function showFailed(message) {
  document.getElementById('error-message').textContent = message;
  showSection('result-failed');
}

// Запуск
checkPaymentStatus();
