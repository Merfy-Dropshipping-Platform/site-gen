/**
 * Hero carousel runtime — pagination clicks + autoplay.
 * Injected only when Hero block has `mode='carousel'`.
 */
export function initHeroCarousel(): void {
  const carousels = document.querySelectorAll<HTMLElement>(
    '[data-merfy-hero-carousel]',
  );
  carousels.forEach((carousel) => {
    const slides = Array.from(
      carousel.querySelectorAll<HTMLElement>('[data-slide-index]'),
    );
    const buttons = Array.from(
      carousel.querySelectorAll<HTMLElement>('[data-pagination-index]'),
    );
    const prev = carousel.querySelector<HTMLElement>('[data-pagination-prev]');
    const next = carousel.querySelector<HTMLElement>('[data-pagination-next]');
    const autoplay = carousel.dataset.autoplay === 'true';
    const interval =
      Number.parseInt(carousel.dataset.interval ?? '5', 10) * 1000;
    let active = 0;

    const show = (idx: number) => {
      const n = ((idx % slides.length) + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('hidden', i !== n));
      buttons.forEach((b, i) =>
        b.classList.toggle('text-[rgb(var(--color-heading))]', i === n),
      );
      active = n;
    };

    buttons.forEach((b, i) => b.addEventListener('click', () => show(i)));
    prev?.addEventListener('click', () => show(active - 1));
    next?.addEventListener('click', () => show(active + 1));

    if (autoplay && slides.length > 1) {
      setInterval(() => show(active + 1), interval);
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroCarousel);
  } else {
    initHeroCarousel();
  }
}
