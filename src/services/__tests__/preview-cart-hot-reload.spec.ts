/**
 * @jest-environment jsdom
 *
 * Жалоба владельца (17.09, дословно): «20 обновляется только после
 * перезагрузки» — секция «Корзина» темы bloom, до этого уже жаловался на
 * заголовок/количество/цену/цену без скидки на той же секции.
 *
 * Воспроизведено вживую (customize.merfy.ru, тестовый bloom-сайт
 * 53e9152f-c313-4fa4-9657-dd5d5db25191, страница «Корзина»): смена «Цветовой
 * схемы» у секции «Корзина» в панели меняет подпись на «Схема 1», но фон
 * превью остаётся прежним (был scheme-3, чёрный) — до ручной перезагрузки.
 *
 * Корневая причина: страница `page-cart` рендерится тем же v2-page-composer,
 * что и главная (`CART_UNIFIED_THEMES` — все пять тем), а он оборачивает
 * КАЖДЫЙ блок в `<div class="color-scheme-N" data-block-scheme="N">` (см.
 * `v2-page-composer.ts` `wrapScheme`). Для секций без local-patch любая правка
 * идёт на сервер (`/preview/block`), и код после fetch (097-фикс,
 * `hasSchemeWrapper`) синхронизирует ЭТУ обёртку. Но у CartBody/CartSummary
 * ещё с spec 110 колонка `colorScheme` обрабатывается ЛОКАЛЬНЫМ патчем (без
 * fetch — иначе слайдер отступов пересоздавал список товаров), и этот патч
 * менял class ТОЛЬКО на самой секции, никогда не трогая родительскую
 * scheme-обёртку — она застывала на схеме первого рендера. Секция сама
 * визуально не красится (её фон определяет CSS-переменная `--color-bg`,
 * которую в итоге перекрывает обёртка, ближайшая к корню), поэтому смена
 * оставалась невидимой до перезагрузки.
 *
 * Тест поднимает РЕАЛЬНОЕ тело инлайн-агента (`PREVIEW_NAV_AGENT_INLINE`) в
 * jsdom — тем же приёмом, что `preview-agent-block-not-found.spec.ts` — и
 * проверяет: (1) правка колорсхемы Cart идёт local-patch'ем (без fetch —
 * поведение 110 сохранено, список товаров не мигает), (2) обёртка
 * `data-block-scheme` синхронизируется, а не остаётся замороженной.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "preview.service.ts"), "utf8");

function templateBody(name: string): string {
  const marker = `const ${name} = \``;
  const exportMarker = `export const ${name} = \``;
  const start = SRC.indexOf(exportMarker) >= 0 ? SRC.indexOf(exportMarker) : SRC.indexOf(marker);
  const usedMarker = SRC.indexOf(exportMarker) >= 0 ? exportMarker : marker;
  if (start < 0) throw new Error(`не нашёл ${name}`);
  const from = start + usedMarker.length;
  const end = SRC.indexOf("\n`;", from);
  if (end < 0) throw new Error(`не нашёл конец шаблона ${name}`);
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`");
}

/** Тот же приём распаковки шаблона агента, что в preview-agent-block-not-found.spec.ts. */
function agentSource(): string {
  const marker = "const PREVIEW_NAV_AGENT_INLINE = `";
  const start = SRC.indexOf(marker);
  if (start < 0) throw new Error("не нашёл PREVIEW_NAV_AGENT_INLINE");
  const from = start + marker.length;
  const end = SRC.indexOf("\n`;", from);
  if (end < 0) throw new Error("не нашёл конец шаблона агента");
  const scrollSource = templateBody("PREVIEW_SELF_SCROLL_SOURCE");
  const checkoutSchemeSource = templateBody("PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE");
  return SRC.slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`")
    .replace("${PREVIEW_SELF_SCROLL_SOURCE}", () => scrollSource)
    .replace("${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}", () => checkoutSchemeSource)
    .replace(/\$\{[^}]*\}/g, "''");
}

type Ctx = {
  fetches: string[];
  errors: unknown[][];
  send: (msg: Record<string, unknown>) => void;
};

const attached: Array<[string, EventListenerOrEventListenerObject]> = [];

function bootAgent(): Ctx {
  const fetches: string[] = [];
  const errors: unknown[][] = [];

  // Ровно та разметка, что реально отдаёт /preview для page-cart у bloom
  // (проверено curl'ом на живом сайте 17.09): CartBody внутри scheme-обёртки
  // v2-page-composer, схема 3 — и на самой секции, и на обёртке (сервер их
  // синхронизирует при первичном рендере).
  document.body.innerHTML =
    '<main>' +
    '<div class="color-scheme-3" data-block-scheme="3">' +
    '<section data-puck-component-id="CartBody-1" data-block="cart-body" ' +
    'class="relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] color-scheme-3">' +
    '<h1>Корзина</h1></section>' +
    '</div>' +
    '</main>';

  (globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
    fetches.push(String(url));
    return Promise.reject(new Error("update-block НЕ обязан идти на сервер для Cart colorScheme (spec 110 — local patch)"));
  }) as unknown as typeof fetch;

  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: () => {} },
  });

  const realError = console.error;
  console.error = ((...args: unknown[]) => {
    errors.push(args);
  }) as typeof console.error;
  (globalThis as unknown as { __restoreConsoleError: () => void }).__restoreConsoleError = () => {
    console.error = realError;
  };

  // Ключевое отличие от preview-agent-block-not-found.spec.ts: local-patch
  // ВКЛЮЧЁН — именно эта ветка обрабатывает colorScheme у Cart (spec 110).
  (window as unknown as Record<string, unknown>).__MERFY_LOCAL_PATCH_ENABLED = true;

  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts2?: unknown) => {
    attached.push([type, fn]);
    return realAdd(type, fn as EventListener, opts2 as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  try {
    // eslint-disable-next-line no-new-func
    new Function(agentSource())();
  } finally {
    window.addEventListener = realAdd as typeof window.addEventListener;
  }

  return {
    fetches,
    errors,
    send: (msg) => window.dispatchEvent(new MessageEvent("message", { data: msg })),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  (globalThis as unknown as { __restoreConsoleError?: () => void }).__restoreConsoleError?.();
  while (attached.length) {
    const entry = attached.pop();
    if (entry) window.removeEventListener(entry[0], entry[1]);
  }
  document.body.innerHTML = "";
});

const INIT = {
  type: "init",
  themeId: "bloom",
  siteId: "site-1",
  data: {
    content: [
      { type: "CartBody", props: { id: "CartBody-1", colorScheme: "scheme-3", padding: { top: 80, bottom: 24 } } },
    ],
  },
};

describe("превью корзины bloom: смена цветовой схемы без перезагрузки", () => {
  it("обёртка v2-page-composer перекрашивается вместе с секцией (local-patch, без fetch)", async () => {
    const ctx = bootAgent();
    ctx.send(INIT);
    await tick();

    ctx.send({
      type: "update-block",
      blockId: "CartBody-1",
      blockType: "CartBody",
      props: { id: "CartBody-1", colorScheme: "scheme-1", padding: { top: 80, bottom: 24 } },
    });
    await tick();
    await tick();

    // spec 110 обязана остаться в силе: правка отступов/схемы Cart не должна
    // дёргать сервер (иначе список товаров пересоздаётся и мигает).
    expect(ctx.fetches.filter((u) => u.includes("/preview/block"))).toHaveLength(0);
    expect(ctx.errors).toHaveLength(0);

    const section = document.querySelector('[data-puck-component-id="CartBody-1"]');
    const wrapper = section?.parentElement ?? null;

    expect(section?.className).toContain("color-scheme-1");
    expect(section?.className).not.toContain("color-scheme-3");

    // ГЛАВНАЯ ПРОВЕРКА (баг владельца): обёртка `data-block-scheme` — то, что
    // реально красит фон страницы, — обязана уехать на новую схему вместе с
    // секцией, а не оставаться замороженной на scheme-3 до reload.
    expect(wrapper?.getAttribute("data-block-scheme")).toBe("1");
    expect(wrapper?.className).toContain("color-scheme-1");
    expect(wrapper?.className).not.toContain("color-scheme-3");
  });
});
