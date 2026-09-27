/**
 * Событие аналитики «Готов к оплате» (`checkout_start`) при открытии оформления.
 *
 * Владелец 28.09: в воронке «Готов к оплате: 0». Трекер умеет слать шаг
 * (`window._mfy.trackCheckout`, analytics-collector static/tracker.js), но ни
 * одна витрина его не вызывала. Трекер подгружается асинхронно, поэтому ждём
 * его до 10 с и шлём один раз. В превью конструктора не шлём — это просмотр
 * мерчанта, а не покупатель.
 */
export const CHECKOUT_START_ANALYTICS_SOURCE = `(function () {
  if (window.self !== window.top || window.__merfyCheckoutStartSent) return;
  var tries = 0;
  (function send() {
    var mfy = window._mfy;
    if (mfy && typeof mfy.trackCheckout === 'function') {
      window.__merfyCheckoutStartSent = true;
      mfy.trackCheckout();
      return;
    }
    if (++tries < 20) setTimeout(send, 500);
  })();
})();`;
