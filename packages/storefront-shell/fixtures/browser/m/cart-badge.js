import { defineSection, part } from '@merfy/shell';

// Значок корзины: число строк корзины ядра. Подписка снимается в unmount.
const stops = new WeakMap();

export default defineSection({
  async mount(element) {
    const cart = await part('cart');
    const count = element.querySelector('[data-count]');
    stops.set(element, cart.subscribe(() => (count.textContent = String(cart.count()))));
  },
  unmount(element) {
    stops.get(element)?.();
  },
});
