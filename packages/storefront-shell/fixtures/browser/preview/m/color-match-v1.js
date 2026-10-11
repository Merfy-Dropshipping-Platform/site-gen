import { defineSection } from '@merfy/shell';

// Подбор цвета, версия 1: считает нажатия; счёт отдаёт новой версии кода (saveState).
const counts = new WeakMap();
const stops = new WeakMap();

export default defineSection({
  mount(element) {
    const label = element.querySelector('[data-label]');
    const show = () => (label.textContent = `v1: ${counts.get(element)}`);
    const onClick = (event) => {
      if (!event.target.closest('[data-pick]')) return;
      counts.set(element, counts.get(element) + 1);
      show();
    };
    counts.set(element, 0);
    show();
    element.addEventListener('click', onClick);
    stops.set(element, () => element.removeEventListener('click', onClick));
  },
  unmount(element) {
    stops.get(element)?.();
  },
  saveState(element) {
    return { count: counts.get(element) };
  },
});
