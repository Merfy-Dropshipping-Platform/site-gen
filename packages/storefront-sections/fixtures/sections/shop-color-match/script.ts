import { defineSection } from '@merfy/shell';

export default defineSection({
  mount(element: HTMLElement) {
    const advice = element.querySelector('[data-advice]');
    element.addEventListener('click', (event) => {
      const coat = event.target instanceof HTMLElement ? event.target.dataset.coat : undefined;
      if (coat !== undefined && advice !== null) advice.textContent = `К пальто «${coat}» — шарф кэмел`;
    });
  },
});
