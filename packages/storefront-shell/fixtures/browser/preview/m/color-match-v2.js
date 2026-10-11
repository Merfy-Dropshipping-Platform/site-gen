import { defineSection } from '@merfy/shell';

// Подбор цвета, версия 2: берёт счёт у прошлой версии (context.state) и продолжает его.
const counts = new WeakMap();
const stops = new WeakMap();

export default defineSection({
  mount(element, context) {
    const label = element.querySelector('[data-label]');
    const show = () => (label.textContent = `v2: ${counts.get(element)}`);
    const onClick = (event) => {
      if (!event.target.closest('[data-pick]')) return;
      counts.set(element, counts.get(element) + 1);
      show();
    };
    counts.set(element, context.state?.count ?? 0);
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
