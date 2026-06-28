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

  // ── Inline (in-canvas) editing (Spec 101 «WYSIWYG прямо в секции») ──────────
  // Only wired in the constructor preview (this agent is never injected on live).
  // Elements marked `data-edit-field` (Page block heading/content) become
  // contenteditable; на blur их значение постится в конструктор → Puck props.

  // Empty-placeholder hint via :empty:before. pointer-events:none so the caret
  // still places when клик по пустому полю. Injected once.
  const EDIT_STYLE_ID = 'merfy-inline-edit-style';
  if (document.head && !document.getElementById(EDIT_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = EDIT_STYLE_ID;
    style.textContent =
      '[data-edit-field][contenteditable]:empty:before{content:attr(data-edit-placeholder);color:rgb(var(--color-muted));opacity:.55;pointer-events:none;}';
    document.head.appendChild(style);
  }

  // Mark every [data-edit-field] editable. Idempotent — safe to re-run after
  // re-render (update-block / reconcile swaps nodes, losing the attribute).
  const applyEditable = () => {
    document.querySelectorAll('[data-edit-field]').forEach((el) => {
      if (el.getAttribute('contenteditable') !== 'true') {
        el.setAttribute('contenteditable', 'true');
      }
    });
  };
  applyEditable();

  // Re-apply after DOM mutations (re-rendered blocks). Microtask-debounced so a
  // burst of mutations coalesces into one applyEditable pass (avoid thrash).
  let editableScheduled = false;
  const scheduleApplyEditable = () => {
    if (editableScheduled) return;
    editableScheduled = true;
    queueMicrotask(() => {
      editableScheduled = false;
      // Guard: the microtask can fire after the document is torn down (iframe
      // navigating away / test teardown) — querySelectorAll would throw on a
      // null document. Swallow so we never crash the host.
      try {
        applyEditable();
      } catch {
        /* document unavailable — nothing to mark */
      }
    });
  };
  new MutationObserver(scheduleApplyEditable).observe(document.body, {
    childList: true,
    subtree: true,
  });

  // On blur of an editable field → sync its value back to the constructor.
  // content → innerHTML (rich); heading → trimmed text. blockId from the closest
  // Puck component host. Capture phase so it fires before any re-render.
  document.addEventListener(
    'focusout',
    (e) => {
      const target = e.target as Element | null;
      const el = target?.closest?.('[data-edit-field]') as HTMLElement | null;
      if (!el) return;
      const field = el.getAttribute('data-edit-field');
      const value =
        field === 'content' ? el.innerHTML : (el.textContent || '').trim();
      const blockId = el
        .closest('[data-puck-component-id]')
        ?.getAttribute('data-puck-component-id');
      if (blockId && field) {
        window.parent.postMessage(
          { type: 'edit-field', blockId, field, value },
          origin,
        );
      }
    },
    true,
  );
}
