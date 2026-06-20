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
      const rawHref = anchor.getAttribute('href') ?? '';
      let parsed: URL | null = null;
      try {
        parsed = new URL(anchor.href, window.location.origin);
      } catch {
        parsed = null;
      }
      // Внешние ссылки (соцсети и т.п.) + mailto/tel открываем в новой вкладке,
      // чтобы в превью можно было проверить переход, не покидая конструктор
      // (раньше любой <a> блокировался → внешние «не переходили»).
      const isMailTel = parsed
        ? parsed.protocol === 'mailto:' || parsed.protocol === 'tel:'
        : /^(?:mailto:|tel:)/i.test(rawHref);
      const isExternal =
        !!parsed &&
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.origin !== window.location.origin;
      if (isMailTel || isExternal) {
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
        return;
      }
      let path: string;
      if (parsed) {
        path = parsed.pathname + parsed.search + parsed.hash;
      } else {
        path = rawHref || '/';
      }
      // Системные storefront-ссылки (иконка профиля → /login|/account, /wishlist
      // и т.п.) — функции витрины, НЕ редактируемые Puck-страницы. В превью клик
      // по такой иконке НЕ навигирует (иначе модалка «создать страницу»), а
      // выделяет родительский блок (Header) для редактирования — как любой клик
      // по шапке.
      const STOREFRONT_SYSTEM =
        /^\/(login|register|reset-password|verify-email|account|wishlist)(\/|$|\?|#)/;
      if (anchor.hasAttribute('data-auth-link') || STOREFRONT_SYSTEM.test(path)) {
        const host = anchor.closest('[data-puck-component-id]') as HTMLElement | null;
        if (host) {
          window.parent.postMessage(
            { type: 'select-block', blockId: host.getAttribute('data-puck-component-id') },
            origin,
          );
        }
        return;
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
