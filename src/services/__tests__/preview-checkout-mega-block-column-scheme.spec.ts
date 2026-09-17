/**
 * Баг-репорт владельца (17.09, «ещё баг»): «Убрать очертания тёмные по
 * периметру» — скриншот страницы чекаута в цветовой схеме мерчанта: по
 * периметру всей области (обе колонки) видна чужая обводка.
 *
 * Тот же класс бага, что «тёмные очертания по периметру» из WORKLOG 16.09
 * (п.3), но в ДРУГОМ месте. Тот круг чинил РАМКУ ПОЛЯ (`--color-input-border`
 * в `tokens-css.ts` / `inputBorderOf`) — эта проверка её не трогает и не
 * дублирует.
 *
 * Здесь — `PreviewService.renderPreviewPage` (первичная отрисовка iframe
 * конструктора при открытии страницы «Оформление заказа», ДО первой правки
 * панели). У ЭТОГО пути обнаружился разрыв с двумя другими путями чекаута,
 * которые уже корректны:
 *
 *   1. Живая витрина — chrome-assembler.injectCheckoutChromeIntoHtml вызывает
 *      `patchCheckoutColumnScheme`: класс `color-scheme-N` садится на
 *      `[data-checkout-pane="form"|"summary"]` — КОЛОНКУ целиком.
 *   2. Живая правка панели в уже открытом превью — тот же приём
 *      (`PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE` / `applyCheckoutColumnScheme`,
 *      см. `preview-checkout-column-scheme.spec.ts`): класс уезжает на
 *      `el.closest('[data-checkout-pane]')`.
 *   3. ПЕРВИЧНЫЙ рендер `renderPreviewPage` (ЭТОТ файл, до фикса) — общая
 *      ветка `renderedBlocks` заворачивала HTML каждого блока с непустым
 *      `colorScheme` в `<div class="color-scheme-N">…</div>` ВНУТРИ колонки,
 *      а не на саму колонку. Секция «Оформление заказа»/«Сводка заказа»
 *      красилась «пятном» ограниченного размера — вокруг него и видна чужая
 *      обводка (полоса дефолтного фона там, где пятно кончается, а колонка
 *      ещё нет). Ровно канон «схема красит КОЛОНКУ, а не карточку внутри»
 *      (`docs/checkout-parity`, `checkout-split.ts`) — который здесь
 *      не соблюдался.
 *
 * Проверяем: (а) класс схемы стоит на `[data-checkout-pane]`, как у путей 1 и
 * 2; (б) вокруг секции чекаута НЕТ обёртки `<div class="color-scheme-N">`
 * (того самого «пятна»); (в) обычные (не чекаутные) блоки продолжают
 * заворачиваться как раньше — фикс не должен тронуть общий путь
 * (`preview.service.spec.ts`, «wraps block HTML in color-scheme-N div…»).
 */
import {
  PreviewService,
  type IAstroContainer,
  type ComponentResolver,
  type ContainerFactory,
} from '../preview.service';

function schemeClass(props: Record<string, unknown>): string {
  const raw = props.colorScheme;
  if (raw === undefined || raw === null || raw === '') return '';
  const id = String(raw).replace(/^scheme-/, '');
  return ` color-scheme-${id}`;
}

function buildFakeContainer(): IAstroContainer {
  return {
    async renderToString(component, opts) {
      const props = opts?.props ?? {};
      const tag = (component as { __block?: string }).__block ?? 'Unknown';
      const id = String(props.id ?? '');
      if (tag === 'CheckoutHeader') {
        return `<header class="checkout-header${schemeClass(props)}" data-puck-component-id="${id}" data-checkout-slot="header"></header>`;
      }
      if (tag === 'CheckoutForm') {
        // Зеркало реального CheckoutForm.astro: корень секции схему НЕ несёт
        // (владелец: «левая часть от нас… схема — это кнопка»), а «Кнопка
        // оплаты» внутри — несёт, получая colorScheme ПРОПОМ от родителя.
        return `<section class="checkout-form" data-puck-component-id="${id}" data-block="checkout-form"><section class="checkout-submit${schemeClass(props)}" data-block="checkout-submit"></section></section>`;
      }
      if (tag === 'CheckoutSummary') {
        return `<section class="checkout-summary" data-puck-component-id="${id}" data-block="checkout-summary"><div data-checkout-column="summary"></div></section>`;
      }
      return `<div data-stub="${tag}"></div>`;
    },
  };
}

const checkoutResolver: ComponentResolver = async (blockName) => {
  if (
    blockName === 'CheckoutHeader' ||
    blockName === 'CheckoutForm' ||
    blockName === 'CheckoutSummary' ||
    blockName === 'Hero'
  ) {
    return { __block: blockName };
  }
  throw new Error(`Block "${blockName}" not wired in this stub`);
};

const containerFactory: ContainerFactory = async () => buildFakeContainer();

describe('renderPreviewPage: чекаут красит КОЛОНКУ, а не карточку внутри неё', () => {
  let svc: PreviewService;

  beforeEach(() => {
    svc = new PreviewService(containerFactory, checkoutResolver);
  });

  async function renderCheckout(formScheme: unknown, summaryScheme: unknown) {
    return svc.renderPreviewPage({
      page: 'checkout',
      blocks: [
        { type: 'CheckoutHeader', props: { id: 'h1' } },
        { type: 'CheckoutForm', props: { id: 'checkout-form', colorScheme: formScheme } },
        { type: 'CheckoutSummary', props: { id: 'checkout-summary', colorScheme: summaryScheme } },
      ],
      tokensCss: '',
      fontHead: '',
    });
  }

  it('класс схемы садится на [data-checkout-pane="form"] (не пятно внутри)', async () => {
    const html = await renderCheckout(4, null);
    const paneMatch = /<div\b[^>]*\bclass="([^"]*)"[^>]*\bdata-checkout-pane="form"/.exec(html);
    expect(paneMatch).not.toBeNull();
    expect(paneMatch![1]).toContain('color-scheme-4');
  });

  it('класс схемы садится на [data-checkout-pane="summary"] (не пятно внутри)', async () => {
    const html = await renderCheckout(null, 'scheme-2');
    const paneMatch = /<div\b[^>]*\bclass="([^"]*)"[^>]*\bdata-checkout-pane="summary"/.exec(html);
    expect(paneMatch).not.toBeNull();
    expect(paneMatch![1]).toContain('color-scheme-2');
  });

  it('вокруг секции «Оформление заказа» НЕТ обёртки color-scheme-N («пятна»)', async () => {
    const html = await renderCheckout(4, null);
    // «Пятно» — это буквально `<div class="color-scheme-4"...>` непосредственно
    // перед секцией checkout-form (общая ветка агента заворачивала ИМЕННО так).
    expect(html).not.toMatch(/<div class="color-scheme-4"[^>]*>\s*<section[^>]*data-block="checkout-form"/);
  });

  it('вокруг секции «Сводка заказа» НЕТ обёртки color-scheme-N («пятна»)', async () => {
    const html = await renderCheckout(null, 'scheme-2');
    expect(html).not.toMatch(/<div class="color-scheme-2"[^>]*>\s*<section[^>]*data-block="checkout-summary"/);
  });

  it('без выбранной схемы колонки остаются без color-scheme-класса', async () => {
    const html = await renderCheckout(null, null);
    const formPane = /<div\b[^>]*\bclass="([^"]*)"[^>]*\bdata-checkout-pane="form"/.exec(html);
    const summaryPane = /<div\b[^>]*\bclass="([^"]*)"[^>]*\bdata-checkout-pane="summary"/.exec(html);
    expect(formPane![1]).not.toMatch(/color-scheme-\d/);
    expect(summaryPane![1]).not.toMatch(/color-scheme-\d/);
  });

  it('обычные (не чекаутные) блоки продолжают заворачиваться как раньше', async () => {
    const html = await svc.renderPreviewPage({
      blocks: [{ type: 'Hero', props: { id: 'hero-scheme', colorScheme: 3 } }],
      tokensCss: '',
      fontHead: '',
    });
    expect(html).toContain('<div class="color-scheme-3" data-block-scheme="3">');
  });
});
