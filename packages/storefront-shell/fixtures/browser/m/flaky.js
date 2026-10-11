import { defineSection, part } from '@merfy/shell';

export default defineSection({
  async mount(element) {
    const cart = await part('cart');
    element.querySelector('[data-buy]').addEventListener('click', (event) => cart.add(event.currentTarget.dataset.buy));
  },
});
