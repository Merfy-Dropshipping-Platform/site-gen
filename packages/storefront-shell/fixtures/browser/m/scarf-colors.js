import { defineSection } from '@merfy/shell';

const stops = new WeakMap();

export default defineSection({
  mount(element) {
    const picked = element.querySelector('[data-picked]');
    const onClick = (event) => {
      const color = event.target.closest('[data-color]')?.dataset.color;
      if (color) picked.textContent = `Выбран: ${color}`;
    };
    element.addEventListener('click', onClick);
    stops.set(element, () => element.removeEventListener('click', onClick));
  },
  unmount(element) {
    stops.get(element)?.();
  },
});
