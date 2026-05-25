export interface PreviewNavAgentOptions {
  origin: string;
}

export function installPreviewNavAgent(options: PreviewNavAgentOptions): void {
  const origin = options.origin;

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target || !target.closest) return;

    const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
    if (anchor) {
      e.preventDefault();
      let path: string;
      try {
        const u = new URL(anchor.href, window.location.origin);
        path = u.pathname + u.search + u.hash;
      } catch {
        path = anchor.getAttribute('href') ?? '/';
      }
      // Product card links (Catalog/PopularProducts/etc.) — wrapping <article>
      // имеет data-product-id с конкретным товаром. Передаём parent так чтобы
      // setPreviewProductId() мог отрендерить именно выбранный товар,
      // не дефолтный из Puck props.
      const article = anchor.closest('[data-product-id]') as HTMLElement | null;
      const productId = article?.getAttribute('data-product-id') ?? undefined;
      const msg = productId
        ? { type: 'navigate', path, productId }
        : { type: 'navigate', path };
      window.parent.postMessage(msg, origin);
      return;
    }

    // Native interactive elements не интерсептятся — клик идёт к local
    // handler (add-to-cart, qty +/-, variant pill, promo apply, etc.).
    // Section/subsection selection не триггерится при клике в button/input.
    const nativeInteractive = target.closest(
      'button, input, select, textarea, label[for]',
    );
    if (nativeInteractive) {
      return;
    }

    const block = target.closest('[data-puck-component-id]') as HTMLElement | null;
    if (block) {
      const blockId = block.getAttribute('data-puck-component-id');
      window.parent.postMessage({ type: 'select-block', blockId }, origin);
    }
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement | null;
    e.preventDefault();
    window.parent.postMessage({
      type: 'form-submit-blocked',
      formId: form?.id ?? null,
    }, origin);
  }, true);
}
