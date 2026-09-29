/**
 * Квадратики цвета на карточке товара flux — ОДНА реализация на все карточки.
 *
 * Карточку flux рисуют три места:
 *   • «Коллекция товаров» — гидрация `themes/flux/src/lib/storefront-hydrate.ts`
 *     (импортирует функции отсюда);
 *   • «Группа товаров» (каталог) — `is:inline` скрипт `Catalog.astro` этой папки.
 *     Модульный `<script>` в порте на витрине не собирается (404), импорт из
 *     инлайна невозможен, поэтому скрипт получает ЭТИ ЖЕ функции строкой
 *     `fluxCardSwatchesSource()` — она склеена из их `.toString()` (приём
 *     theme-base `runtime/extension-points.ts`), второй копии нет;
 *   • серверная карточка `FluxProductCard.astro` этой папки.
 *
 * Живёт в папке порта, потому что порт не может импортировать файлы вне своей
 * папки (при сборке она кладётся плоско в `src/components/`), а гидрация flux
 * может импортировать отсюда.
 *
 * Правило одно (владелец 28–29.09: «прожимаемые цвета»): квадратик на каждое
 * НАЗВАНИЕ цвета товара (группа «Цвет»/`Color`); цвет — swatchHex мерчанта,
 * иначе угадан по названию (`colorToHex`). Нажатие ставит фото этого цвета и
 * переключает «В корзину» на вариант этого цвета (первый размер в порядке
 * показа), выбранный обведён. Размеры одежды на карточке не показываются —
 * только чипы памяти («128 ГБ», `cardMemoryValues`).
 *
 * ПРАВИЛА ДЛЯ ФУНКЦИЙ НИЖЕ (иначе строка сломается): только `function`-
 * декларации, никаких ссылок на константы модуля и импорты — всё, что нужно,
 * внутри функций или в других функциях этого файла; стили новых элементов —
 * в `style`, классы — только те, что уже есть в CSS витрины (сторож
 * `src/themes/__tests__/flux-catalog-swatches.spec.ts`).
 */

export interface CardSwatchOption {
  value?: string | null;
  swatchHex?: string | null;
  images?: string[] | null;
}
export interface CardSwatchGroup {
  name?: string | null;
  options?: CardSwatchOption[] | null;
}
export interface CardSwatchCombo {
  id?: string | number;
  price?: number | string | null;
  available?: boolean;
  options?: Record<string, string> | null;
}
export interface CardSwatchProduct {
  variantSwatches?: Array<{ value?: string | null; color?: string | null; available?: boolean }> | null;
  variantGroups?: CardSwatchGroup[] | null;
  variantCombinations?: CardSwatchCombo[] | null;
}
/** Квадратик цвета карточки = один настоящий цвет товара. */
export interface CardSwatch {
  /** Название цвета у мерчанта («Haze Pink»); пусто — если в данных только hex. */
  value: string;
  /** `#RRGGBB`: swatchHex мерчанта, иначе по названию (colorToHex). */
  color: string;
  /** Фото этого цвета (option.images[0] группы «Цвет»), иначе null. */
  image: string | null;
}
/** Выбор варианта по умолчанию (theme-base `pickDefaultCombination`). */
export type PickCombo = (combos: CardSwatchCombo[], groups: CardSwatchGroup[]) => CardSwatchCombo | null;

type ColorTables = {
  exact: Record<string, string>;
  stems: Array<[string, string]>;
  modifiers: Record<string, number>;
  endings: string[];
};

/** Словари цвета: название → hex, модификаторы светлоты, окончания. Строятся один раз. */
export function fluxColorTables(): ColorTables {
  const self = fluxColorTables as unknown as { cache?: ColorTables };
  if (self.cache) return self.cache;
  const names: Record<string, string> = {
    белый: "#FFFFFF", white: "#FFFFFF", чёрный: "#000000", черный: "#000000", black: "#000000",
    красный: "#E02D2D", red: "#E02D2D", синий: "#2D4BE0", blue: "#2D4BE0", голубой: "#6FB7E0",
    зелёный: "#2DA84F", зеленый: "#2DA84F", green: "#2DA84F", жёлтый: "#F2C53D", желтый: "#F2C53D",
    yellow: "#F2C53D", оранжевый: "#FA5109", orange: "#FA5109", серый: "#9A9A9A", gray: "#9A9A9A",
    grey: "#9A9A9A", серебро: "#C0C0C0", серебряный: "#C0C0C0", серебристый: "#C0C0C0",
    silver: "#C0C0C0", графит: "#3A3A3A", graphite: "#3A3A3A", бежевый: "#E8D9C0", beige: "#E8D9C0",
    коричневый: "#7A5230", brown: "#7A5230", розовый: "#F2A0C0", pink: "#F2A0C0",
    фиолетовый: "#7A3FB0", purple: "#7A3FB0", violet: "#7A3FB0", бордовый: "#6E1423",
    золотой: "#D4AF37", gold: "#D4AF37", бирюзовый: "#2DBFB0", teal: "#2DBFB0",
  };
  // Модификаторы светлоты составного имени: основа слова → сдвиг (+ к белому,
  // − к чёрному). «Ярко»/«матовый» узнаём, но тон не двигаем.
  const modifiers: Record<string, number> = {
    светл: 0.35, бледн: 0.3, нежн: 0.3, пастельн: 0.3, light: 0.35, pale: 0.3, soft: 0.3,
    темн: -0.35, глубок: -0.3, dark: -0.35, deep: -0.3,
    ярк: 0, насыщенн: 0, матов: 0, глянцев: 0, металлик: 0, bright: 0, neon: 0, неон: 0,
  };
  // Окончания прилагательных — снимаются при сравнении основ. Длинные раньше.
  const endings = [
    "ыми", "ими", "ого", "его", "ому", "ему",
    "ый", "ий", "ой", "ая", "яя", "ое", "ее", "ые", "ие",
    "ым", "им", "ых", "их", "ую", "юю",
    "о", "е",
  ];
  const tables: ColorTables = { exact: {}, stems: [], modifiers, endings };
  self.cache = tables;
  const seenStems: Record<string, true> = {};
  for (const name of Object.keys(names)) {
    const normalized = normalizeColorName(name);
    tables.exact[normalized] = names[name];
    const s = colorStem(normalized);
    if (seenStems[s]) continue;
    seenStems[s] = true;
    tables.stems.push([s, names[name]]);
  }
  return tables;
}

/** Регистр, ё/е, дефисы и тире, повторные пробелы — к одному виду. */
export function normalizeColorName(raw?: string | null): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[-_/\\‐-―−]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Основа слова: снимаем окончание прилагательного, если остаётся ≥3 букв. */
export function colorStem(word: string): string {
  if (word.length < 4) return word;
  const end = fluxColorTables().endings.find((e) => word.length - e.length >= 3 && word.endsWith(e));
  return end ? word.slice(0, word.length - end.length) : word;
}

/** Слово → цвет: точное имя, затем основа, затем общий префикс основ (≥4). */
export function lookupColorWord(word: string): string | null {
  if (!word) return null;
  const tables = fluxColorTables();
  if (tables.exact[word]) return tables.exact[word];
  const s = colorStem(word);
  const byStem = tables.stems.find(([key]) => key === s);
  if (byStem) return byStem[1];
  if (s.length < 4) return null;
  const byPrefix = tables.stems.find(([key]) => key.length >= 4 && (key.startsWith(s) || s.startsWith(key)));
  return byPrefix ? byPrefix[1] : null;
}

/** Модификатор светлоты слова (по основе или целиком) или undefined. */
export function lookupColorModifier(word: string): number | undefined {
  const modifiers = fluxColorTables().modifiers;
  const s = colorStem(word);
  if (Object.prototype.hasOwnProperty.call(modifiers, s)) return modifiers[s];
  return Object.prototype.hasOwnProperty.call(modifiers, word) ? modifiers[word] : undefined;
}

/** Смешение двух цветов `#RRGGBB`: t=0 — первый, t=1 — второй. */
export function mixHex(a: string, b: string, t: number): string {
  const rgb = (hex: string): number[] => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = rgb(a);
  const y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/**
 * Значение/подсказка цвета → `#RRGGBB`. Приоритет: hex-подсказка (swatchHex) →
 * hex прямо в значении → имя цвета.
 *
 * Имя разбирается как КЛАСС, а не точным совпадением со словарём (баг
 * тестировщика 2026-09-13, п.6: «Светло-голубой» единственный из девяти
 * образцов оставался текст-кнопкой): регистр, ё/е, дефис/тире, лишние пробелы
 * нормализуются; у составного имени базовый цвет ищется с КОНЦА
 * («светло-голубой» = голубой, «Cherry Purple» = фиолетовый), слова перед ним —
 * модификатор светлоты либо второй цвет («сине-зелёный» = смесь); основа
 * слова сравнивается без окончания прилагательного. Не распознали — null.
 *
 * Тот же алгоритм во втором порте секции «Товар» —
 * packages/theme-base/blocks/Product/variantColor.ts (палитра своя).
 */
export function colorToHex(value?: string | null, hint?: string | null): string | null {
  const hexRe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const h = String(hint ?? "").trim();
  if (hexRe.test(h)) return h;
  const v = String(value ?? "").trim();
  if (hexRe.test(v)) return v;
  const normalized = normalizeColorName(v);
  if (!normalized) return null;
  const exact = fluxColorTables().exact[normalized];
  if (exact) return exact;
  const words = normalized.split(" ");
  let baseIdx = words.length - 1;
  while (baseIdx >= 0 && !lookupColorWord(words[baseIdx])) baseIdx--;
  if (baseIdx < 0) return null;
  let color = lookupColorWord(words[baseIdx]) as string;
  let shift = 0;
  for (const word of words.slice(0, baseIdx)) {
    const mod = lookupColorModifier(word);
    const second = mod === undefined ? lookupColorWord(word) : null;
    shift += mod ?? 0;
    if (second) color = mixHex(color, second, 0.5);
  }
  if (shift > 0) color = mixHex(color, "#FFFFFF", Math.min(shift, 0.75));
  if (shift < 0) color = mixHex(color, "#000000", Math.min(-shift, 0.75));
  return color;
}

/** Группа цвета товара («Цвет» / `Color`). */
export function cardColorGroup(p: CardSwatchProduct): CardSwatchGroup | undefined {
  return (p.variantGroups ?? []).find((g) => /^(цвет|color)$/i.test(String(g?.name ?? "").trim()));
}

/** Цвет комбинации вариантов. */
export function cardComboColor(c?: CardSwatchCombo | null): string {
  return String(c?.options?.["Цвет"] ?? c?.options?.["Color"] ?? "").trim();
}

/**
 * Квадратики цвета товара + флаг «есть недоступный цвет». Источники по
 * приоритету: variantSwatches (плоский, эмитит пайплайн) → группа «Цвет»
 * (swatchHex) → имена цветов из комбинаций. Недоступный цвет — один
 * перечёркнутый серый квадрат (swatchDisabled), как в эталоне. Один квадратик
 * на НАЗВАНИЕ, не на hex: «Haze Pink» и «Performance Pink» угадываются
 * одинаково розовыми, склейка по hex прятала вариант (владелец 28.09).
 */
export function cardSwatches(p: CardSwatchProduct): { swatches: CardSwatch[]; swatchDisabled: boolean } {
  const images: Record<string, string> = {};
  for (const o of cardColorGroup(p)?.options ?? []) {
    const img = (o?.images ?? []).find((u) => typeof u === "string" && u);
    const key = String(o?.value ?? "").trim().toLowerCase();
    if (img && key && !images[key]) images[key] = img;
  }
  const out: CardSwatch[] = [];
  const seen: Record<string, true> = {};
  let swatchDisabled = false;
  const push = (value: string | null | undefined, hex: string | null, available?: boolean): void => {
    const name = String(value ?? "").trim();
    const key = (name || hex || "").toLowerCase();
    if (!hex || seen[key]) return;
    if (available === false) {
      swatchDisabled = true;
      return;
    }
    seen[key] = true;
    out.push({ value: name, color: hex, image: images[name.toLowerCase()] ?? null });
  };
  for (const s of p.variantSwatches ?? []) push(s?.value, colorToHex(s?.value, s?.color), s?.available);
  if (out.length === 0) {
    for (const o of cardColorGroup(p)?.options ?? []) push(o?.value, colorToHex(o?.value, o?.swatchHex));
  }
  if (out.length === 0) {
    for (const c of p.variantCombinations ?? []) push(cardComboColor(c), colorToHex(cardComboColor(c)), c?.available);
  }
  return { swatches: out.slice(0, 6), swatchDisabled };
}

/**
 * Чипы памяти/объёма («128 ГБ») из не-цветовых групп. Только значения с
 * единицей памяти — размеры одежды на карточке не показываются. `\b` не
 * годится: после кириллических «ГБ» границы слова нет.
 */
export function cardMemoryValues(p: CardSwatchProduct): string[] {
  const memoryRe = /\d+\s*(гб|gb|тб|tb|мб|mb)(?![a-zа-яё])/i;
  const colorRe = /^(цвет|color)$/i;
  const fromGroups = (p.variantGroups ?? [])
    .filter((g) => !colorRe.test(String(g?.name ?? "").trim()))
    .flatMap((g) => (g?.options ?? []).map((o) => String(o?.value ?? "")));
  const fromCombos = (p.variantCombinations ?? []).flatMap((c) =>
    Object.keys(c?.options ?? {})
      .filter((k) => !colorRe.test(k))
      .map((k) => String(c.options?.[k] ?? "")),
  );
  const pick = (values: string[]): string[] => {
    const memory = values.map((v) => v.trim()).filter((v) => memoryRe.test(v));
    const keys = memory.map((v) => v.toLowerCase());
    return memory.filter((_, i) => keys.indexOf(keys[i]) === i);
  };
  const own = pick(fromGroups);
  return (own.length ? own : pick(fromCombos)).slice(0, 4);
}

/** Экранирование для атрибутов разметки квадратиков. */
export function escapeSwatchHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Вариант, который кладёт «В корзину» после выбора цвета: этот цвет, первый размер в порядке показа. */
export function cardComboForColor(p: CardSwatchProduct, color: string, pick?: PickCombo): CardSwatchCombo | null {
  if (!color || !pick) return null;
  const combos = (p.variantCombinations ?? []).filter((c) => cardComboColor(c) === color);
  const colorGroup = cardColorGroup(p);
  return pick(combos, (p.variantGroups ?? []).filter((g) => g !== colorGroup));
}

/**
 * Разметка квадратиков (без обёртки — у каждой карточки своя). Есть что
 * выбирать (вариант этого цвета или его фото) — кнопка с данными варианта для
 * `bindCardSwatches`; нечего — статичный квадрат. Выбран цвет варианта,
 * который кладёт «В корзину» (`pick` по всем комбинациям). Без `pick`
 * (серверная карточка) кнопка только меняет фото. Нет ни одного доступного
 * цвета — пусто (перечёркнутый квадрат только рядом с цветами).
 */
export function cardSwatchesHtml(p: CardSwatchProduct, pick?: PickCombo): string {
  const { swatches, swatchDisabled } = cardSwatches(p);
  if (swatches.length === 0) return "";
  const selected = pick ? cardComboColor(pick(p.variantCombinations ?? [], p.variantGroups ?? [])) : "";
  const ring = "box-shadow:0 0 0 2px rgb(var(--color-text,0 0 0));";
  const one = (s: CardSwatch): string => {
    const combo = cardComboForColor(p, s.value, pick);
    if (!combo && !s.image) {
      return `<span class="size-5 rounded-[2px]" style="background:${s.color}" aria-hidden="true"></span>`;
    }
    const on = s.value !== "" && s.value === selected;
    const size = String(combo?.options?.["Размер"] ?? combo?.options?.["Size"] ?? "").trim();
    const data: Array<[string, string]> = [
      ["data-swatch-value", s.value],
      ["data-swatch-image", s.image ?? ""],
      ["data-swatch-combo-id", combo ? String(combo.id ?? "") : ""],
      ["data-swatch-size", combo ? size : ""],
      ["data-swatch-price", combo ? String(combo.price ?? "") : ""],
    ];
    const attrs = data.map(([k, v]) => ` ${k}="${escapeSwatchHtml(v)}"`).join("");
    return (
      `<button type="button" data-card-swatch${attrs} aria-pressed="${on}"` +
      ` aria-label="Цвет: ${escapeSwatchHtml(s.value)}" title="${escapeSwatchHtml(s.value)}"` +
      ` class="size-5 rounded-[2px]" style="padding:0;border:0;cursor:pointer;background:${s.color};${on ? ring : ""}"></button>`
    );
  };
  const disabled = swatchDisabled
    ? `<span class="relative size-5 rounded-[2px] bg-[#F5F5F5]" aria-hidden="true"><span class="absolute inset-0 m-auto h-[1px] w-[26px] origin-center -rotate-45 bg-[#999999]"></span></span>`
    : "";
  return swatches.map(one).join("") + disabled;
}

/** Фото карточки → фото цвета. Запомненное «исходное» фото (наведение, свайп, каталог) — тоже. */
export function showCardSwatchPhoto(card: Element, url: string): void {
  const img = card.querySelector("[data-card-img]") ?? card.querySelector('[data-nt="flux-card-media"] img');
  if (!img) return;
  img.setAttribute("src", url);
  for (const attr of ["data-image-1", "data-img-primary"]) {
    if (img.hasAttribute(attr)) img.setAttribute(attr, url);
  }
}

/**
 * Кнопка «В корзину» карточки → вариант квадратика. Два контракта кнопок:
 * `[data-add-to-cart]` (гидрация, nt-cart-flux) и `[data-quick-add-id]`
 * (каталог) — отличаются только атрибутом номера комбинации.
 */
export function applyCardSwatchToCart(card: Element, swatch: Element): void {
  const targets: Array<[string, string]> = [
    ["[data-add-to-cart]", "data-variant-combination-id"],
    ["[data-quick-add-id]", "data-quick-add-combo-id"],
  ];
  const image = swatch.getAttribute("data-swatch-image");
  const hasCombo = !!swatch.getAttribute("data-swatch-combo-id");
  for (const [selector, comboAttr] of targets) {
    const button = card.querySelector(selector);
    if (!button) continue;
    if (image) button.setAttribute("data-image", image);
    if (!hasCombo) continue;
    const pairs: Array<[string, string]> = [
      ["data-swatch-combo-id", comboAttr],
      ["data-swatch-value", "data-variant-color"],
      ["data-swatch-size", "data-variant-size"],
      ["data-swatch-price", "data-price"],
    ];
    for (const [from, to] of pairs) {
      const value = swatch.getAttribute(from);
      if (value) button.setAttribute(to, value);
      else button.removeAttribute(to);
    }
  }
}

/** Выбор квадратика: обводка, фото цвета, вариант в «В корзину». */
export function selectCardSwatch(swatch: Element): void {
  const card = swatch.closest('[data-nt="flux-product-card"]');
  if (!card) return;
  for (const el of Array.from(card.querySelectorAll<HTMLElement>("[data-card-swatch]"))) {
    el.setAttribute("aria-pressed", String(el === swatch));
    el.style.boxShadow = el === swatch ? "0 0 0 2px rgb(var(--color-text,0 0 0))" : "";
  }
  const image = swatch.getAttribute("data-swatch-image");
  if (image) showCardSwatchPhoto(card, image);
  applyCardSwatchToCart(card, swatch);
}

/**
 * Нажатие на квадратик цвета любой карточки flux выбирает вариант. Один
 * делегат на документ (флаг на <html> общий для модуля и инлайн-строки) —
 * карточки перерисовываются фильтром/«Смотреть ещё»/гидрацией, привязка
 * переживает это.
 */
export function bindCardSwatches(): void {
  const root = document.documentElement;
  if (root.hasAttribute("data-flux-card-swatches")) return;
  root.setAttribute("data-flux-card-swatches", "");
  document.addEventListener("click", (event) => {
    const swatch = (event.target as Element | null)?.closest?.("[data-card-swatch]");
    if (!swatch) return;
    event.preventDefault();
    selectCardSwatch(swatch);
  });
}

/**
 * Строка для `<script is:inline set:html>`: те же функции, `.toString()`.
 * Ставит `window.__merfyFluxCardSwatches` = { html, memory, bind }.
 * Функция, а не константа: константа с вызовами `.toString()` не вырезается
 * сборщиком и тянула бы весь модуль в бандлы секций flux, которым он не нужен
 * (ловится снимками секций).
 */
export function fluxCardSwatchesSource(): string {
  const fns = [
    fluxColorTables,
    normalizeColorName,
    colorStem,
    lookupColorWord,
    lookupColorModifier,
    mixHex,
    colorToHex,
    cardColorGroup,
    cardComboColor,
    cardSwatches,
    cardMemoryValues,
    escapeSwatchHtml,
    cardComboForColor,
    cardSwatchesHtml,
    showCardSwatchPhoto,
    applyCardSwatchToCart,
    selectCardSwatch,
    bindCardSwatches,
  ];
  return `(function () {
if (window.__merfyFluxCardSwatches) return;
${fns.map((fn) => fn.toString()).join("\n")}
window.__merfyFluxCardSwatches = { html: cardSwatchesHtml, memory: cardMemoryValues, bind: bindCardSwatches };
})();`;
}
