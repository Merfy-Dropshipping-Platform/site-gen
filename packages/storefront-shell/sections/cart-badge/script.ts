import { defineSection, part } from '@merfy/shell';

// Значок корзины (design.md блока 7, С7-18 Б): секция платформы, путь тот же, что у секции любого автора. Число строк
// корзины ядра; подписка снимается в unmount.
const stops = new WeakMap<HTMLElement, () => void>();

export default defineSection({
  async mount(element) {
    const cart = await part('cart');
    const count = element.querySelector('[data-count]');
    const show = (): void => {
      if (count !== null) count.textContent = String(cart.count());
    };
    stops.set(element, cart.subscribe(show));
  },
  unmount(element) {
    stops.get(element)?.();
  },
});
