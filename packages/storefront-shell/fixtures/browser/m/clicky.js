import { defineSection } from '@merfy/shell';

export default defineSection({
  mount(element) {
    element.querySelector('[data-boom]').addEventListener('click', () => {
      throw new Error('клик сломался');
    });
  },
});
