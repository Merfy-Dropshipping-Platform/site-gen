import { defineSection } from '@merfy/shell';
import { label } from './lib/label.ts';

const stops = new WeakMap<HTMLElement, () => void>();

export default defineSection({
  mount(element: HTMLElement) {
    const picked = element.querySelector('[data-picked]');
    const onClick = (event: Event): void => {
      const color = event.target instanceof HTMLElement ? event.target.dataset.color : undefined;
      if (color !== undefined && picked !== null) picked.textContent = label(color);
    };
    element.addEventListener('click', onClick);
    stops.set(element, () => element.removeEventListener('click', onClick));
  },
  unmount(element: HTMLElement) {
    stops.get(element)?.();
  },
});
