import { defineSection, part } from '@merfy/shell';

// Отзывы (секция расширения reviews): «Купить такой же» кладёт товар в корзину ядра — значок корзины платформы это видит.
export default defineSection({
  async mount(element: HTMLElement) {
    const cart = await part('cart');
    element.addEventListener('click', (event) => {
      const id = event.target instanceof HTMLElement ? event.target.dataset.buy : undefined;
      if (id !== undefined) cart.add(id);
    });
  },
});
