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
 * Требует сборки (тот же порядок, что в CI перед этим шагом):
 *   pnpm build                     — компилированный контроллер puck-config,
 *                                    по нему считается набор полей ТЕМЫ;
 *   pnpm build:blocks              — общие блоки theme-base (CartSummary);
 *   pnpm build:theme-sections:all  — порты секций всех пяти тем.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const PUCK_FIELDS = resolve(__dirname, "puck-config-fields.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const base = { colorScheme: "1", padding: { top: 40, bottom: 40 } };

type FieldSpec = {
  /** Имя, которое конструктор кладёт в props.hiddenFields. */
  field: string;
  /** Уникальный след параметра в разметке. Массив — «любой из» (composite). */
  probe: string | string[];
  /**
   * compositeFields из NAMED_SUBSECTIONS: одно имя поля закрывает несколько
   * полей puckConfig. Конструктор оставляет такой параметр, если в конфиге
   * ТЕМЫ есть хотя бы одно из них (getNamedSubsections), — повторяем дословно.
   */
  composite?: string[];
  /**
   * Причина, по которой параметр НЕЛЬЗЯ проверить изолированным рендером
   * (узел не появляется без внешних данных). Заполнено — пара пропускается, и
   * причина видна в названии теста, а не молчит.
   */
  unprobeable?: string;
  /**
   * Узел появляется только при РЕАЛЬНОМ товаре (цена, варианты, описание из
   * карточки), а изолированный рендер всегда отдаёт placeholder. Отличается от
   * `unprobeable` тем, что в портах, где узел всё-таки рисуется, проверка
   * остаётся боевой: пропускается не пара, а только требование «узел обязан
   * быть до скрытия».
   */
  needsRealProduct?: true;
};
type BlockSpec = {
  /** theme-base — блок общий и живёт вне sections.map.json (см. рендерер). */
  pkg?: "theme-base";
  /**
   * Блока нет в sections.map.json этой темы — рендерить ОБЩИЙ theme-base.
   *
   * Ровно так работает витрина: порт есть только у части тем, остальные
   * собираются с общим блоком. Без этого поля тест молчал про «Товар» в
   * четырёх темах из пяти — блок в манифесте только у flux, и пары просто не
   * появлялись, тогда как у rose/bloom/satin/vanilla «глаз» не работал вовсе
   * (баг-репорт тестировщика 2026-09-13).
   */
  pkgFallback?: "theme-base";
  /**
   * Имя блока для рендера, если ключ реестра — алиас (один блок под двумя
   * наборами пропсов, например заполненный Hero и пустой).
   */
  renderAs?: string;
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
 * Поля перечислены ВСЕ, как в реестре конструктора. Отсев делается не здесь, а
 * по РАБОЧЕМУ puckConfig темы (см. activeFields ниже): у тем бывают
 * СОБСТВЕННЫЕ конфиги, и satin переопределяет десять блоков, включая Hero,
 * MainText и ImageWithText. Захардкодить отсев по theme-base значило бы
 * проверять satin не по его конфигу — ровно та ошибка, из-за которой правка
 * hiddenInMainPanel в theme-base когда-то починила четыре темы, а satin
 * остался сломанным.
 */
const NAMED_FIELDS: Record<string, BlockSpec> = {
  PromoBanner: {
    props: {
      ...base,
      text: "MK_PB_TEXT",
      linkText: "MK_PB_LINK",
      linkUrl: "/",
    },
    // Маячок — И текст, И хвост-ссылка: панель «Объявление» правит их вместе
    // (Текст + Размер текста + Ссылка), значит «глаз» обязан убрать оба. satin
    // снимал только текст и оставлял на полосе висеть голую ссылку.
    fields: [{ field: "text", probe: ["MK_PB_TEXT", "MK_PB_LINK"] }],
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
      {
        field: "buttons",
        probe: ["MK_HERO_BTN1", "MK_HERO_BTN2"],
        composite: ["primaryButton", "secondaryButton"],
      },
    ],
  },
  /**
   * Пустой Hero — тот же блок без единого заполненного параметра. Отдельный
   * случай, потому что порт рисует дефолт-плейсхолдер: скрытая кнопка
   * возвращалась на витрину не своим текстом, а заглушкой, и проверка по
   * значению этого не видела. Маячок здесь — сам узел параметра.
   */
  "Hero (пустое состояние)": {
    renderAs: "Hero",
    props: { ...base },
    fields: [
      {
        field: "buttons",
        probe: [marker("primaryButton"), marker("secondaryButton")],
        composite: ["primaryButton", "secondaryButton"],
      },
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
      // «Подзаголовок» убран из дерева конструктора (ghost-параметр: строка в
      // outline была, поля под ней — нет). Если вернут, запись сюда, а отсев
      // по конфигу темы решит, в каких темах он живой.
      { field: "buttonText", probe: "MK_NL_BTN" },
    ],
  },
  /**
   * Значения Product приходят из товара, а на изолированном рендере товара нет
   * (placeholder), поэтому маячок — сам узел параметра.
   *
   * Собственный порт есть ТОЛЬКО у flux (sections.map.json: Product →
   * FeaturedProduct.astro). Остальные четыре темы собираются с ОБЩИМ блоком
   * packages/theme-base/blocks/Product — поэтому `pkgFallback`. Без него тест
   * смотрел на один flux и держал зелёный свет, пока «глаз» у «Товара» не
   * работал в rose, bloom, satin и vanilla (баг-репорт тестировщика
   * 2026-09-13): поддержки hiddenFields в общем блоке не было вовсе.
   *
   * text/description заполняем НЕ ради значения, а ради появления узла: бренд
   * рисуется только при непустом `text.content`, описание — при непустом
   * `description.content`.
   */
  Product: {
    pkgFallback: "theme-base",
    props: {
      ...base,
      text: { content: "MK_PROD_BRAND" },
      description: { content: "MK_PROD_DESC" },
      share: { text: "MK_PROD_SHARE" },
    },
    fields: [
      ...["text", "title", "quantity", "buttons", "share"].map((f) => ({
        field: f,
        probe: marker(f),
      })),
      // Цена и варианты берутся из карточки товара: на placeholder
      // view.price.formatted пусто, view.hasVariants=false — узла нет ни при
      // каком наборе props. Где порт его всё-таки рисует (flux), проверка
      // остаётся боевой.
      { field: "price", probe: marker("price"), needsRealProduct: true },
      { field: "variants", probe: marker("variants"), needsRealProduct: true },
      // theme-base рисует описание из props.description, flux — только из
      // realProduct.description. Поэтому «узел обязан быть» не требуем.
      {
        field: "description",
        probe: marker("description"),
        needsRealProduct: true,
      },
    ],
  },
  /**
   * CartSummary («Промежуточный итог») — вторая секция страницы корзины
   * (баг-репорт 12, восстановлен spec 110). Порт есть у всех пяти тем
   * (sections.map.json), общий theme-base-блок остаётся фоллбэком для тем без
   * порта — поэтому `pkgFallback`, а не `pkg`: проверяем то, что реально уходит
   * на витрину этой темы. «Глаз» у cartTotals/cartCheckoutButton рабочий
   * (disabledHint гасит редактирование, но не видимость), значит порт обязан
   * пропускать hiddenFields.
   */
  CartSummary: {
    pkgFallback: "theme-base",
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
  //
  // ⚠️ «Именованных параметров нет» НЕ значит «проверять нечего»: у этих блоков
  // свой, второй механизм «глаза», и именно он был сломан у «Мультирядов»,
  // «Мультиколонн», «Сворачиваемого раздела» и «Слайд-шоу» (баг-репорт
  // тестировщика 2026-09-13). Их сторожит ОТДЕЛЬНЫЙ гард
  // `hidden-list-items.spec.ts` — запись здесь лишь говорит, что у блока нет
  // ИМЕНОВАННЫХ параметров, и отправляет к соседнему тесту.
  //
  // До 2026-09-13 тест дёргал у шести блоков ниже hiddenFields:['heading'] и
  // ждал, что заголовок пропадёт. Проверка держалась сама на себе: в реестре
  // конструктора этих блоков нет (NAMED_SUBSECTIONS — семь блоков), «глаза» у
  // их заголовка не бывает, и такого hiddenFields никто никогда не пришлёт.
  // Снято осознанно: зелёная проверка несуществующей функции — не покрытие, а
  // ложная уверенность. Появится «глаз» у заголовка списка — запись
  // переезжает в NAMED_FIELDS, и отсев по конфигу темы подхватит её сам.
  Collections:
    "список: «глаз» у элемента (item.hidden) — см. hidden-list-items.spec.ts",
  Gallery:
    "список: «глаз» у элемента (item.hidden) — см. hidden-list-items.spec.ts",
  MultiRows:
    "список: «глаз» у элемента (item.hidden) — см. hidden-list-items.spec.ts",
  MultiColumns:
    "список: «глаз» у элемента (item.hidden) — см. hidden-list-items.spec.ts",
  CollapsibleSection:
    "список: «глаз» у элемента (item.hidden) — см. hidden-list-items.spec.ts",
  Slideshow:
    "список слайдов: «глаз» у элемента (item.hidden) — см. hidden-list-items.spec.ts",
  // Ниже — блоков просто нет в NAMED_SUBSECTIONS конструктора: в outline у них
  // нет ни одной строки-параметра с «глазом».
  // Header: именованных параметров нет, но список ссылок меню — есть
  // (navigationLinks), и «глаз» у пункта меню сторожит hidden-list-items.spec.ts.
  Header:
    "нет в NAMED_SUBSECTIONS; список пунктов меню — см. hidden-list-items.spec.ts",
  Footer: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  ContactForm: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  PopularProducts:
    "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  Publications: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  Video: "нет в NAMED_SUBSECTIONS: параметров с «глазом» не показывает",
  CartSection:
    "нет в NAMED_SUBSECTIONS; «Итого»/«Оформить заказ» живут в CartSummary",
  // «Корзина» (тело: пустое состояние + список товаров). Именованных параметров
  // нет — «Итоговая цена»/«Кнопка оформления заказа» это под-узлы соседней
  // секции «Промежуточный итог» (NAMED_SUBSECTIONS.CartSummary).
  CartBody:
    "нет в NAMED_SUBSECTIONS; «Итого»/«Оформить заказ» живут в CartSummary",
};

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

/**
 * Поля рабочего puck-config темы (блок → список полей). Дочерний процесс:
 * компилированный контроллер тянет ESM-модули блоков, jest их не грузит.
 * null — конфиг недоступен (не собран `pnpm build`); это ловит отдельный тест,
 * иначе отсев полей молча выключился бы и проверки стали бы пустыми.
 */
function runtimePuckFields(theme: string): Record<string, string[]> | null {
  try {
    const raw = execFileSync("node", [PUCK_FIELDS, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return null;
  }
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
      const rendered = spec.renderAs ?? block;
      // Блок проверяется, если он есть в манифесте темы (свой порт), либо это
      // общий theme-base-блок (pkg), либо тема собирается с общим блоком
      // вместо собственного порта (pkgFallback).
      if (
        spec.pkg !== "theme-base" &&
        !spec.pkgFallback &&
        !blocks.includes(rendered)
      ) {
        continue;
      }
      for (const f of spec.fields) pairs.push({ block, spec, f });
    }
  }

  let shown: Row[] = [];
  let hidden: Row[] = [];

  /**
   * Поля, у которых «глаз» РЕАЛЬНО есть в этой теме. Повторяем отсев
   * getNamedSubsections по КОНФИГУ ЭТОЙ ТЕМЫ: конфиг берём у того же
   * скомпилированного контроллера, который отдаёт его конструктору
   * (`GET /api/themes/:id/puck-config`), — в нём уже применён resolveBlocks,
   * а он при `override` в theme.json берёт пакет темы ЦЕЛИКОМ вместо
   * theme-base. Считать по theme-base значило бы проверять satin (десять своих
   * блоков, включая Hero/MainText/ImageWithText) чужим набором полей.
   */
  const themeFields = runtimePuckFields(theme);
  const activeFields: Record<string, Set<string>> = {};
  if (themeFields) {
    for (const [block, spec] of Object.entries(NAMED_FIELDS)) {
      const f = themeFields[spec.renderAs ?? block];
      if (!f) continue;
      activeFields[block] = new Set(
        spec.fields
          .filter((s) =>
            s.composite
              ? s.composite.some((c) => f.includes(c))
              : f.includes(s.field),
          )
          .map((s) => s.field),
      );
    }
  }
  const isActive = (block: string, field: string): boolean =>
    activeFields[block]?.has(field) ?? false;

  beforeAll(() => {
    if (!built || pairs.length === 0) return;
    // Один процесс на тему: сначала все пары без скрытия, затем те же со скрытием.
    // Какой модуль рендерить: порт темы (есть в манифесте) или общий блок.
    const pkgOf = (
      spec: BlockSpec,
      rendered: string,
    ): "theme-base" | undefined =>
      spec.pkg ?? (blocks.includes(rendered) ? undefined : spec.pkgFallback);
    const shownJobs: Job[] = pairs.map(({ block, spec }) => ({
      block: spec.renderAs ?? block,
      pkg: pkgOf(spec, spec.renderAs ?? block),
      props: { ...spec.props, id: `${spec.renderAs ?? block}-1` },
    }));
    const hiddenJobs: Job[] = pairs.map(({ block, spec, f }) => ({
      block: spec.renderAs ?? block,
      pkg: pkgOf(spec, spec.renderAs ?? block),
      props: {
        ...spec.props,
        id: `${spec.renderAs ?? block}-1`,
        hiddenFields: [f.field],
      },
    }));
    shown = render(theme, shownJobs);
    hidden = render(theme, hiddenJobs);
  }, 180_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  it("рабочий puck-config темы прочитан (pnpm build)", () => {
    // Без конфига отсев полей молчит и «всё зелено» ничего не значит.
    expect(themeFields).not.toBeNull();
    expect(Object.keys(activeFields).length).toBeGreaterThan(0);
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
    it(`${block}.${f.field}: параметр виден, пока его не скрыли${
      f.unprobeable ? ` — ПРОПУЩЕН: ${f.unprobeable}` : ""
    }`, () => {
      if (!built || f.unprobeable) return;
      // «Глаза» у поля в этой теме нет (её конфиг его не содержит) — проверять
      // нечего: hiddenFields с таким именем конструктор не пришлёт.
      if (!isActive(block, f.field)) return;
      const row = shown[i];
      if (row?.missing) return; // блока нет в этой теме
      expect(row?.error ?? null).toBeNull();
      // Параметр живёт данными карточки товара — на placeholder узла может не
      // быть. Там, где порт его рисует, требование остаётся жёстким.
      if (f.needsRealProduct && !contains(row?.html ?? "", f.probe)) return;
      expect(contains(row?.html ?? "", f.probe)).toBe(true);
    });

    it(
      f.unprobeable
        ? `${block}.${f.field}: скрытие не проверяемо рендером — ${f.unprobeable}`
        : `${block}.${f.field}: скрытый параметр исчезает с витрины`,
      () => {
        if (!built || f.unprobeable) return;
        if (!isActive(block, f.field)) return;
        const row = hidden[i];
        if (row?.missing) return;
        expect(row?.error ?? null).toBeNull();
        if (!contains(shown[i]?.html ?? "", f.probe)) return; // параметра нет при этих props
        expect(contains(row?.html ?? "", f.probe)).toBe(false);
      },
    );

    /**
     * Пустой рендер — НЕ «скрыл». Проба ищет след параметра; строка без единого
     * узла её тоже проходит, и дыра выглядит зелёной. Так и было у rose
     * PromoBanner: скрытие «Объявления» уносило корень секции, `/preview/block`
     * отдавал пустую строку, превью её отбраковывало
     * (`isValidBlockHtml` → «keep old DOM») и баннер оставался на экране —
     * мерчант видел это как «глаз в дереве не работает» (баг-репорт владельца
     * 2026-09-13). Обратный ход ломался так же: показать обратно было нечего,
     * узла в DOM уже не существовало.
     *
     * Контракт: порт вправе спрятать параметр, но обязан оставить корень
     * секции с `data-puck-component-id` — иначе точечная перерисовка блока
     * молча откатывается.
     */
    it(`${block}.${f.field}: корень секции переживает скрытие (иначе превью не обновится)`, () => {
      if (!built || f.unprobeable) return;
      if (!isActive(block, f.field)) return;
      const before = shown[i]?.html ?? "";
      const after = hidden[i]?.html ?? "";
      if (hidden[i]?.missing || hidden[i]?.error) return;
      const root = `data-puck-component-id="${NAMED_FIELDS[block].renderAs ?? block}-1"`;
      // Тема не размечает корень этой секции — контракт к ней неприменим.
      if (!before.includes(root)) return;
      expect(after).toContain(root);
    });

    /**
     * Обратная сторона: скрыть один параметр — не значит снести соседний.
     * Правка «спрятать кнопку» легко уносит весь контейнер вместе с
     * заголовком, и на витрине пропадает то, что мерчант не трогал. Проверяем
     * ВСЕ остальные параметры блока, а не одного соседа.
     */
    it(`${block}.${f.field}: скрытие не задевает соседние параметры`, () => {
      if (!built || f.unprobeable) return;
      if (!isActive(block, f.field)) return;
      const before = shown[i]?.html ?? "";
      const after = hidden[i]?.html ?? "";
      if (hidden[i]?.missing || hidden[i]?.error) return;
      const lost = NAMED_FIELDS[block].fields
        .filter((other) => other.field !== f.field && !other.unprobeable)
        .filter((other) => isActive(block, other.field))
        // сосед был виден до скрытия, но пропал после
        .filter(
          (other) =>
            contains(before, other.probe) && !contains(after, other.probe),
        )
        .map((other) => other.field);
      expect(lost).toEqual([]);
    });
  });
});
