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
      window.parent.postMessage({ type: 'navigate', path }, origin);
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
