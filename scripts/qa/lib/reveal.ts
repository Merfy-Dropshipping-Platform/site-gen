/**
 * Открыть скрытое: панель поиска, дровер корзины, модалку «товар добавлен»,
 * мобильное меню.
 *
 * Зачем модуль. Сейчас каждый агент кликает по-своему и половина промахивается:
 * клик по координатам попадает во вложенный `<svg>` (поймано на дровере
 * корзины), клик по первой попавшейся кнопке открывает не ту панель, а замер
 * НЕОТКРЫТОЙ панели молча возвращает цвета скрытого узла — то есть враньё в
 * обе стороны.
 *
 * Здесь это закрыто устройством:
 *   • управляющий элемент ищется по маркеру и кликается САМ (`el.click()` в
 *     DOM) — вложенный `<svg>`/иконка перехватить клик не может;
 *   • после клика панель ПРОВЕРЯЕТСЯ на видимость числом (бокс, opacity,
 *     visibility), а не считается открытой по факту клика;
 *   • не открылась — зонд честно возвращает `opened: false` с причиной, и
 *     вызывающий обязан на это среагировать.
 */
import type { Stage } from "./stage";

export type RevealName = "search" | "cart" | "added" | "menu";

export type Recipe = {
  /** Чем открывается — по порядку приоритета. */
  open: string[];
  /** Что обязано стать видимым. */
  panel: string[];
  /** Сколько ждать появления (мс). */
  timeout: number;
  why: string;
};

export const RECIPES: Record<RevealName, Recipe> = {
  search: {
    open: ['[data-action="toggle-search"]', "[data-search-toggle]", '[aria-controls="header-search-panel"]'],
    panel: ["#header-search-panel", "[data-search-panel]", "[data-search-results]"],
    timeout: 3000,
    why: "панель поиска в шапке: max-height 0 ⇄ 80px, кнопок несколько (по одной на ветку раскладки)",
  },
  cart: {
    open: ["[data-cart-open]"],
    panel: ['[data-nt="cart-drawer"] [data-cart-panel]', "[data-cart-panel]"],
    timeout: 3000,
    why:
      "дровер корзины: обработчик висит на [data-cart-open] в capture-фазе; " +
      "мерить надо ВЫЕЗЖАЮЩУЮ панель [data-cart-panel], а не контейнер " +
      '[data-nt="cart-drawer"] — он лежит поверх экрана всегда и любую проверку видимости пройдёт',
  },
  added: {
    open: ["[data-add-to-cart]", '[data-product-action="add-to-cart"]', "[data-cart-add]"],
    panel: ["[data-cart-added-modal]", "[data-cart-modal-card]"],
    timeout: 4000,
    why: "модалка «товар добавлен» появляется после реального добавления в корзину",
  },
  menu: {
    open: ["[data-burger-toggle]", "[data-mobile-toggle]", "[data-hamburger]"],
    panel: ["[data-nav-drawer]", "[data-mobile-menu]", "[data-mobile-drawer]", "[data-mobile-submenu]"],
    timeout: 3000,
    why:
      "мобильное меню: кнопка у тем зовётся по-разному (data-burger-toggle у четырёх тем, " +
      "data-mobile-toggle в theme-base), а сама шторка — своим id в каждой теме; " +
      "поэтому панель ищется ещё и по aria-controls нажатой кнопки",
  },
};

export type RevealResult = {
  what: RevealName;
  opened: boolean;
  /** Каким селектором открыли. */
  via: string | null;
  /** Какая панель стала видимой — её и надо мерить. */
  panel: string | null;
  why: string;
  /** Что пробовали и что из этого вышло — для отчёта. */
  tried: Array<{ selector: string; clicked: boolean; visible: boolean }>;
};

/**
 * Видима ли панель — числом, а не «наверное».
 *
 * Мало проверить бокс и `opacity`: шторка прячется СДВИГОМ за край экрана
 * (`transform: translateX(100%)`), и у неё остаются и размер, и непрозрачность.
 * На стенде satin такой дровер читался как «уже открыто» ещё до клика — то есть
 * зонд врал в пользу «всё хорошо». Поэтому панель обязана ещё и ПЕРЕСЕКАТЬСЯ с
 * окном раскладки (`clientWidth/clientHeight`, а не `innerWidth`: последний
 * растёт вместе с переполнением).
 */
async function visible(stage: Stage, selector: string): Promise<boolean> {
  return stage.page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const onScreen = r.right > 1 && r.left < vw - 1 && r.bottom > 1 && r.top < vh - 1;
    return (
      r.width > 0 &&
      r.height > 0 &&
      onScreen &&
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      Number.parseFloat(cs.opacity || "1") > 0.01
    );
  }, selector);
}

async function firstVisible(stage: Stage, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    if (await visible(stage, sel)) return sel;
  }
  return null;
}

/**
 * Клик по САМОМУ управляющему элементу (иконка внутри перехватить не может)
 * плюс его `aria-controls`: у каждой темы шторка меню зовётся своим id, и
 * список селекторов панели их все не перечислит.
 */
async function clickControl(
  stage: Stage,
  selector: string,
): Promise<{ clicked: boolean; controls: string | null }> {
  return stage.page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { clicked: false, controls: null };
    const id = el.getAttribute("aria-controls");
    el.scrollIntoView({ block: "center" });
    el.click();
    return { clicked: true, controls: id ? `#${id}` : null };
  }, selector);
}

/** Открыть скрытое и ПРОВЕРИТЬ, что оно открылось. */
export async function reveal(stage: Stage, what: RevealName): Promise<RevealResult> {
  const recipe = RECIPES[what];
  const tried: RevealResult["tried"] = [];

  const already = await firstVisible(stage, recipe.panel);
  if (already) {
    return { what, opened: true, via: "уже открыто", panel: already, why: recipe.why, tried };
  }

  for (const sel of recipe.open) {
    const { clicked, controls } = await clickControl(stage, sel);
    if (!clicked) {
      tried.push({ selector: sel, clicked: false, visible: false });
      continue;
    }
    const candidates = controls ? [controls, ...recipe.panel] : recipe.panel;
    const deadline = Date.now() + recipe.timeout;
    let panel: string | null = null;
    while (Date.now() < deadline && panel === null) {
      panel = await firstVisible(stage, candidates);
      if (panel === null) await stage.page.waitForTimeout(100);
    }
    tried.push({ selector: sel, clicked: true, visible: panel !== null });
    if (panel !== null) {
      return { what, opened: true, via: sel, panel, why: recipe.why, tried };
    }
  }

  return {
    what,
    opened: false,
    via: null,
    panel: null,
    why:
      tried.length === 0 || tried.every((t) => !t.clicked)
        ? `на странице нет ни одного управляющего элемента: ${recipe.open.join(", ")}`
        : `кликнули, но ни одна панель не стала видимой: ${recipe.panel.join(", ")}`,
    tried,
  };
}

/**
 * Открыть и упасть, если не открылось.
 *
 * Мерить неоткрытую панель нельзя: у скрытого узла свои цвета и нулевой бокс —
 * замер получится, но он будет ложью.
 */
export async function revealOrThrow(stage: Stage, what: RevealName): Promise<RevealResult> {
  const res = await reveal(stage, what);
  if (!res.opened) throw new Error(`не удалось открыть «${what}» на ${stage.label}: ${res.why}`);
  return res;
}
