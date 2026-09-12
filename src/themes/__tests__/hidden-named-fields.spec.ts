/**
 * «Глаз» у ИМЕНОВАННОГО параметра секции обязан убирать его с витрины —
 * во ВСЕХ пяти темах и у КАЖДОГО блока, который конструктор адресует.
 *
 * Конструктор кладёт скрытые поля в `props.hiddenFields`, пропускать их обязан
 * порт темы; общего хелпера нет, каждый порт делает это руками. До 2026-09-12
 * тест сторожил шесть ЗАХАРДКОЖЕННЫХ блоков — и дыра жила ровно там, куда он не
 * смотрел. Хардкод убран: список блоков берётся из РЕАЛЬНОГО манифеста темы
 * (`dist/theme-sections/<тема>/manifest.json`, собирается из
 * `themes/<тема>/sections.map.json`), поэтому новая секция попадает под
 * проверку сама. Блок, не классифицированный ни как «есть именованные
 * параметры», ни как «их нет», роняет тест — молчаливый пропуск невозможен.
 *
 * Тестировщик работает с одного сайта, переключая тему в конструкторе, —
 * значит все пять тем равнозначны и проверяются всегда вместе, а не «эталон
 * плюс остальные по остаточному принципу».
 *
 * Почему рендер, а не grep. `grep hiddenFields` — гипотеза: файл может
 * упоминать hiddenFields и при этом скрывать одно поле из четырёх (так и было
 * в ImageWithText). Здесь секция рендерится ТЕМ ЖЕ скомпилированным модулем,
 * что уходит на витрину и в превью, дважды: без скрытия и со скрытием. В
 * первом рендере «маячок» (уникальное значение параметра) обязан быть, во
 * втором — исчезнуть.
 *
 * Почему снимки этого не ловят: они рендерят секции БЕЗ hiddenFields, и
 * «параметр не скрывается» для них выглядит нормой.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема> для всех пяти
 * и pnpm build:blocks (для общих блоков theme-base).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const base = { colorScheme: "1", padding: { top: 40, bottom: 40 } };

type FieldSpec = {
  /** Имя, которое конструктор кладёт в props.hiddenFields. */
  field: string;
  /** Уникальный след параметра в разметке. Массив — «любой из» (composite). */
  probe: string | string[];
};
type BlockSpec = {
  /** theme-base — блок общий и живёт вне sections.map.json (см. рендерер). */
  pkg?: "theme-base";
  props: Record<string, unknown>;
  fields: FieldSpec[];
};

const marker = (f: string) => `data-puck-subsection-field="${f}"`;

/**
 * Зеркало NAMED_SUBSECTIONS конструктора
 * (`backend/services/constructor/src/lib/utils/arrayField.ts`) — ЕДИНСТВЕННЫЙ
 * источник «глаза» у именованного параметра: SortableItem вешает
 * onToggleNamedVisibility на каждую запись оттуда. Блока нет в реестре —
 * hiddenFields ему не придёт никогда, и правка порта была бы работой вхолостую.
 *
 * Поля, отфильтрованные конструктором по puckConfig темы, сюда не входят:
 * Newsletter.subheading есть в реестре, но в puckConfig его нет, значит
 * getNamedSubsections его отбрасывает и «глаза» у него не бывает.
 */
const NAMED_FIELDS: Record<string, BlockSpec> = {
  PromoBanner: {
    props: {
      ...base,
      text: "MK_PB_TEXT",
      linkText: "MK_PB_LINK",
      linkUrl: "/",
    },
    fields: [{ field: "text", probe: "MK_PB_TEXT" }],
  },
  Hero: {
    props: {
      ...base,
      heading: { text: "MK_HERO_HEAD" },
      title: "MK_HERO_HEAD",
      text: { content: "MK_HERO_TEXT" },
      subtitle: "MK_HERO_TEXT",
      primaryButton: { text: "MK_HERO_BTN1", href: "/catalog" },
      secondaryButton: { text: "MK_HERO_BTN2", href: "/catalog" },
    },
    fields: [
      { field: "heading", probe: "MK_HERO_HEAD" },
      { field: "text", probe: "MK_HERO_TEXT" },
      // composite: одно имя поля — две кнопки в разметке.
      { field: "buttons", probe: ["MK_HERO_BTN1", "MK_HERO_BTN2"] },
    ],
  },
  MainText: {
    props: {
      ...base,
      heading: "MK_MT_HEAD",
      text: { content: "MK_MT_TEXT" },
      button: { text: "MK_MT_BTN", href: "/catalog" },
      position: "center",
    },
    fields: [
      { field: "heading", probe: "MK_MT_HEAD" },
      { field: "text", probe: "MK_MT_TEXT" },
      { field: "button", probe: "MK_MT_BTN" },
    ],
  },
  ImageWithText: {
    props: {
      ...base,
      image: { url: "/MK-IWT-IMG.png", alt: "Изображение" },
      heading: "MK_IWT_HEAD",
      text: { content: "MK_IWT_TEXT" },
      button: { text: "MK_IWT_BTN", href: "/catalog" },
      imagePosition: "left",
    },
    fields: [
      { field: "image", probe: "/MK-IWT-IMG.png" },
      { field: "heading", probe: "MK_IWT_HEAD" },
      { field: "text", probe: "MK_IWT_TEXT" },
      { field: "button", probe: "MK_IWT_BTN" },
    ],
  },
  Newsletter: {
    props: {
      ...base,
      heading: "MK_NL_HEAD",
      description: "MK_NL_DESC",
      placeholder: "MK_NL_PH",
      buttonText: "MK_NL_BTN",
    },
    fields: [
      { field: "heading", probe: "MK_NL_HEAD" },
      { field: "buttonText", probe: "MK_NL_BTN" },
    ],
  },
  /**
   * Значения Product приходят из товара, а на изолированном рендере товара нет
   * (placeholder), поэтому маячок — сам узел параметра. Блок есть только у flux
   * (sections.map.json: Product → FeaturedProduct.astro), в остальных темах
   * рендерер вернёт missing и пары просто не появятся.
   */
  Product: {
    props: { ...base },
    fields: [
      "text",
      "title",
      "price",
      "variants",
      "quantity",
      "buttons",
      "share",
    ].map((f) => ({ field: f, probe: marker(f) })),
  },
  /**
   * CartSummary не лежит в sections.map.json ни одной темы — он общий блок
   * theme-base, но стоит в packages/theme-<тема>/pages/cart.json всех пяти тем
   * с собственным puck-id, то есть конструктор его адресует и «глаз» у
   * cartTotals/cartCheckoutButton рабочий (disabledHint гасит редактирование,
   * но не видимость). Рендерим общий модуль — он один на все темы.
   */
  CartSummary: {
    pkg: "theme-base",
    props: { colorScheme: "scheme-2", padding: { top: 0, bottom: 80 } },
    fields: [
      { field: "cartTotals", probe: "cart-summary-totals" },
      { field: "cartCheckoutButton", probe: "cart-checkout-btn" },
    ],
  },
};

/**
 * Блоки из манифестов тем, у которых именованных параметров НЕТ. Список явный:
 * исключение обязано быть видно в диффе, иначе оно молчит — ровно так баг и жил.
 * Причина у каждого своя, проверена по реестру конструктора.
 */
const NO_NAMED_FIELDS: Record<string, string> = {
  // Ниже — блоки со СПИСКАМИ. У них «глаз» есть, но item-уровневый: скрывается
  // отдельный элемент через item.hidden, и отбрасывает его adaptLegacyProps в
  // src/themes/page-blocks.ts, а не порт темы. Именованных параметров нет.
  Collections:
    "список: «глаз» у элемента (item.hidden), не у именованного параметра",
  Gallery:
    "список: «глаз» у элемента (item.hidden), не у именованного параметра",
  MultiRows:
    "список: «глаз» у элемента (item.hidden), не у именованного параметра",
  MultiColumns:
    "список: «глаз» у элемента (item.hidden), не у именованного параметра",
  CollapsibleSection:
    "список: «глаз» у элемента (item.hidden), не у именованного параметра",
  Slideshow:
    "список слайдов: «глаз» у элемента (item.hidden), не у именованного параметра",
  // Ниже — блоков просто нет в NAMED_SUBSECTIONS конструктора: в outline у них
  // нет ни одной строки-параметра с «глазом».
  Header: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  Footer: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  ContactForm: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  PopularProducts:
    "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  Publications: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  Video: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  CartSection:
    "нет в NAMED_SUBSECTIONS; «Итого»/«Оформить заказ» живут в CartSummary",
};

/**
 * Известные дыры, которые чинит ПАРАЛЛЕЛЬНАЯ ветка `fix/preview-chrome-reorder`
 * (она правит Hero/ImageWithText/Newsletter во всех темах и flux/Puk.astro).
 * Трогать те же файлы отсюда — гарантированный конфликт, поэтому дыры
 * зафиксированы списком: CI зелёный, но дыра видна в коде и не забыта.
 *
 * Запись работает в обе стороны: если дыра закрылась, тест ТРЕБУЕТ убрать
 * строку — просроченное исключение не переживёт мерж.
 */
const KNOWN_GAPS: { theme: string; block: string; field: string }[] = [
  ...THEMES.map((t) => ({ theme: t, block: "Hero", field: "buttons" })),
  ...THEMES.map((t) => ({ theme: t, block: "ImageWithText", field: "image" })),
  ...THEMES.map((t) => ({
    theme: t,
    block: "Newsletter",
    field: "buttonText",
  })),
  { theme: "satin", block: "ImageWithText", field: "text" },
  { theme: "rose", block: "ImageWithText", field: "button" },
  { theme: "bloom", block: "ImageWithText", field: "button" },
  { theme: "satin", block: "ImageWithText", field: "button" },
];
const isKnownGap = (theme: string, block: string, field: string) =>
  KNOWN_GAPS.some(
    (g) => g.theme === theme && g.block === block && g.field === field,
  );

/**
 * Невидимый на витрине текст не считается «параметр виден»: баг владельца —
 * «в сайдбаре скрыто, а в магазине ВИДНО». aria-label/alt/title не рисуются
 * (satin кладёт заголовок в aria-label секции — это не возврат заголовка на
 * страницу). src/href остаются: по ним видно картинку и ссылку.
 */
const visible = (html: string): string =>
  html.replace(
    /\s(?:aria-label|aria-labelledby|aria-describedby|title|alt)="[^"]*"/g,
    "",
  );

const contains = (html: string, probe: string | string[]): boolean => {
  const v = visible(html);
  return Array.isArray(probe)
    ? probe.some((p) => v.includes(p))
    : v.includes(probe);
};

type Job = {
  block: string;
  props: Record<string, unknown>;
  pkg?: "theme-base";
};
type Row = { block: string; html?: string; missing?: boolean; error?: string };

/** Рендерер отдаёт массив В ПОРЯДКЕ jobs — сопоставляем по индексу, не по имени
 *  (один блок встречается много раз: по разу на каждое скрываемое поле). */
function render(theme: string, jobs: Job[]): Row[] {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(raw) as Row[];
}

function manifestBlocks(theme: string): string[] | null {
  const mf = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  if (!existsSync(mf)) return null;
  return Object.keys(
    JSON.parse(readFileSync(mf, "utf-8")) as Record<string, string>,
  );
}

describe.each(THEMES)("скрытие именованного параметра — %s", (theme) => {
  const blocks = manifestBlocks(theme);
  const built = blocks !== null;

  // Пары (блок, поле) для этой темы: из реестра, но только те блоки, что
  // реально есть у темы. CartSummary общий — он есть у всех.
  const pairs: { block: string; spec: BlockSpec; f: FieldSpec }[] = [];
  if (built) {
    for (const [block, spec] of Object.entries(NAMED_FIELDS)) {
      if (spec.pkg !== "theme-base" && !blocks.includes(block)) continue;
      for (const f of spec.fields) pairs.push({ block, spec, f });
    }
  }

  let shown: Row[] = [];
  let hidden: Row[] = [];

  beforeAll(() => {
    if (!built || pairs.length === 0) return;
    // Один процесс на тему: сначала все пары без скрытия, затем те же со скрытием.
    const shownJobs: Job[] = pairs.map(({ block, spec }) => ({
      block,
      pkg: spec.pkg,
      props: { ...spec.props, id: `${block}-1` },
    }));
    const hiddenJobs: Job[] = pairs.map(({ block, spec, f }) => ({
      block,
      pkg: spec.pkg,
      props: { ...spec.props, id: `${block}-1`, hiddenFields: [f.field] },
    }));
    shown = render(theme, shownJobs);
    hidden = render(theme, hiddenJobs);
  }, 180_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  it("каждый блок манифеста классифицирован (новая секция не проскочит молча)", () => {
    if (!built) return;
    const unclassified = blocks.filter(
      (b) => !(b in NAMED_FIELDS) && !(b in NO_NAMED_FIELDS),
    );
    // Блок появился в sections.map.json — решите, есть ли у него именованные
    // параметры (NAMED_FIELDS), или их нет (NO_NAMED_FIELDS с причиной).
    expect(unclassified).toEqual([]);
  });

  pairs.forEach(({ block, f }, i) => {
    const gap = isKnownGap(theme, block, f.field);

    it(`${block}.${f.field}: параметр виден, пока его не скрыли`, () => {
      if (!built) return;
      const row = shown[i];
      if (row?.missing) return; // блока нет в этой теме
      expect(row?.error ?? null).toBeNull();
      expect(contains(row?.html ?? "", f.probe)).toBe(true);
    });

    it(
      gap
        ? `${block}.${f.field}: дыра ещё открыта (см. KNOWN_GAPS — чинится в fix/preview-chrome-reorder)`
        : `${block}.${f.field}: скрытый параметр исчезает с витрины`,
      () => {
        if (!built) return;
        const row = hidden[i];
        if (row?.missing) return;
        expect(row?.error ?? null).toBeNull();
        if (!contains(shown[i]?.html ?? "", f.probe)) return; // поля нет в этой теме
        const leaked = contains(row?.html ?? "", f.probe);
        if (gap) {
          // Дыру закрыли — уберите запись из KNOWN_GAPS, иначе она протухнет.
          expect(leaked).toBe(true);
        } else {
          expect(leaked).toBe(false);
        }
      },
    );
  });
});
