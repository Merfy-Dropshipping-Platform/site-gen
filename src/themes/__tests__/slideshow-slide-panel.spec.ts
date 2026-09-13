/**
 * Подпанель «Слайд» (Slideshow.slides) обязана иметь тот состав, который
 * владелец назвал эталонным, — во ВСЕХ пяти темах.
 *
 * Откуда взялась проверка. Пункт 1 баг-репорта тестировщика 2026-09-13:
 * «Параметр Слайд имеет не наш сайдбар — как настройки в нём, так и внешний
 * вид. Ожидаемый результат: взять из Figma нашу вариацию». Доступа к макету
 * нет; владелец указал эталон словами — «как было в rose раньше». Эталон
 * найден в истории: коммит b11d0487 (02.07.2026) «fix(slideshow): панель
 * "Слайд" по Figma 1:33170 + Затемнение per-slide (5 тем)».
 *
 * Почему состав потерялся. Ветка release/themes-2026-09-09 отпочковалась от
 * main 28.06.2026 (b62ae11b) — за четыре дня ДО b11d0487, — прожила два с
 * половиной месяца и была влита обратно слиянием 283acab2 (09.09.2026).
 * Конфликт по этому файлу разрешили в пользу ветки: изменения main
 * (8eea7f39) отброшены. Ни в одном сообщении коммита решения «убрать
 * Затемнение из панели слайда» нет — это молчаливый дрейф слияния.
 *
 * Что именно сторожим — состав и типы контролов ПО ПОРЯДКУ. Порядок важен:
 * FocusedItemPanel рисует поля в порядке объявления, и перестановка — тоже
 * изменение панели. Каждое поле сверяется по типу, подписи, видимости и, где
 * есть, по опциям/подсказке/границам ползунка.
 *
 * Почему не по theme-base, а по РАБОЧЕМУ конфигу темы: у тем бывают
 * собственные puckConfig (у satin их одиннадцать), resolveBlocks подставляет
 * пакет темы целиком. Считать по theme-base значило бы сторожить satin чужой
 * панелью. Сегодня Slideshow собственного порта конфига ни у одной темы нет —
 * проверка это тоже фиксирует: появится, и расхождение будет видно.
 *
 * Чего проверка НЕ делает: не сторожит ЗНАЧЕНИЯ по умолчанию (это
 * test:panel-defaults) и не проверяет, что поле доезжает до витрины (это
 * test:hidden-fields и снимки секций; для «Затемнения» рендер-пруф лежит в
 * slideshow-slide-overlay.spec.ts).
 *
 * Требует собранного dist: pnpm build && pnpm build:blocks.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const RAW = resolve(__dirname, "puck-config-raw.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

const REFERENCE =
  "эталон — коммит b11d0487 «fix(slideshow): панель «Слайд» по Figma 1:33170 + Затемнение per-slide (5 тем)»";

type RawField = {
  type?: string;
  label?: string;
  placeholder?: string;
  toggleLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  fieldType?: string;
  options?: Array<{ label?: string; value?: string }>;
  objectFields?: Record<string, RawField>;
  arrayFields?: Record<string, RawField>;
};

/** Ожидаемое описание одного контрола подпанели. */
type Expected = {
  type: string;
  label: string;
  placeholder?: string;
  toggleLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  fieldType?: string;
  /** Опции в виде «значение=подпись» — порядок значим. */
  options?: string[];
  objectFields?: Record<string, Expected>;
};

const SIZE_OPTIONS = ["small=Маленький", "medium=Средний", "large=Большой"];

/**
 * Состав подпанели «Слайд» по эталону b11d0487, сверху вниз.
 *
 * Порядок и подписи взяты из эталонного коммита дословно. Пояснения к
 * отдельным местам:
 *   • `imageUrl` — легаси-поле старых ревизий. Оставлено `hidden`: рядом стоит
 *     рабочее «Изображение» (image), и мерчант видел ДВА одинаковых поля.
 *     Данные ревизий продолжают работать фолбэком в рендере (порты читают
 *     `s.image || s.imageUrl`).
 *   • `contentHeader` — не контрол, а разделитель «Содержание» (чёрный 16px с
 *     верхней границей). В props не сохраняется. Тот же приём, что в Hero
 *     (`_contentSection`, Figma 314-34815).
 *   • `heading` / `text` / `button` — объекты с ПУСТОЙ подписью: FocusedItemPanel
 *     при пустом label рисует поле БЕЗ заголовка группы, и вложенные поля
 *     встают плоскими строками («Заголовок», «Размер заголовка», …), как на
 *     макете. Форма данных при этом не меняется — heading остаётся {text,size}.
 */
const EXPECTED: Array<[string, Expected]> = [
  ["image", { type: "image", label: "Изображение" }],
  ["imageUrl", { type: "hidden", label: "" }],
  [
    "overlay",
    { type: "slider", label: "Затемнение", min: 0, max: 100, step: 5 },
  ],
  ["contentHeader", { type: "section-header", label: "Содержание" }],
  [
    "heading",
    {
      type: "object",
      label: "",
      objectFields: {
        text: { type: "aiText", label: "Заголовок", fieldType: "title" },
        size: {
          type: "select",
          label: "Размер заголовка",
          options: SIZE_OPTIONS,
        },
      },
    },
  ],
  [
    "text",
    {
      type: "object",
      label: "",
      objectFields: {
        content: {
          type: "aiText",
          label: "Текст",
          fieldType: "description",
        },
        size: {
          type: "select",
          label: "Размер текста",
          options: SIZE_OPTIONS,
        },
      },
    },
  ],
  [
    "button",
    {
      type: "object",
      label: "",
      objectFields: {
        text: {
          type: "text",
          label: "Кнопка",
          placeholder: "*Оставьте пустой, чтобы скрыть",
        },
        link: { type: "pagePicker", label: "Ссылка" },
      },
    },
  ],
  [
    "container",
    {
      type: "toggle",
      label: "Контейнер",
      toggleLabel: "Скрыть/показать",
      options: ["true=Показать", "false=Скрыть"],
    },
  ],
  [
    "position",
    {
      type: "select",
      label: "Позиция",
      options: [
        "top-left=Сверху слева",
        "top-center=Сверху в центре",
        "top-right=Сверху справа",
        "center-left=По центру слева",
        "center=По центру",
        "center-right=По центру справа",
        "bottom-left=Снизу слева",
        "bottom-center=Снизу по центру",
        "bottom-right=Снизу справа",
      ],
    },
  ],
  ["alignment", { type: "alignment", label: "Выравнивание" }],
  ["colorScheme", { type: "colorScheme", label: "Цветовая схема" }],
];

function readConfig(theme: Theme): Record<string, unknown> | null {
  try {
    const raw = execFileSync("node", [RAW, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function optionsOf(field: RawField | undefined): string[] | undefined {
  if (!Array.isArray(field?.options)) return undefined;
  return field.options.map((o) => `${o?.value}=${o?.label ?? ""}`);
}

/** Приводим контрол к сравнимому виду, беря ТОЛЬКО ожидаемые ключи. */
function actualOf(field: RawField | undefined, want: Expected): Expected {
  const out: Expected = {
    type: field?.type ?? "ПОЛЯ НЕТ",
    label: field?.label ?? "",
  };
  if (want.placeholder !== undefined) out.placeholder = field?.placeholder;
  if (want.toggleLabel !== undefined) out.toggleLabel = field?.toggleLabel;
  if (want.min !== undefined) out.min = field?.min;
  if (want.max !== undefined) out.max = field?.max;
  if (want.step !== undefined) out.step = field?.step;
  if (want.fieldType !== undefined) out.fieldType = field?.fieldType;
  if (want.options !== undefined) out.options = optionsOf(field);
  if (want.objectFields !== undefined) {
    const sub = field?.objectFields ?? {};
    out.objectFields = {};
    for (const [name, wantSub] of Object.entries(want.objectFields)) {
      out.objectFields[name] = actualOf(sub[name], wantSub);
    }
  }
  return out;
}

const configs = new Map<Theme, Record<string, unknown> | null>();
for (const theme of THEMES) configs.set(theme, readConfig(theme));

function slideFields(theme: Theme): Record<string, RawField> | null {
  const cfg = configs.get(theme) ?? null;
  if (!cfg) return null;
  const components = (cfg as { components?: Record<string, unknown> })
    .components;
  const block = components?.["Slideshow"] as
    | { fields?: Record<string, RawField> }
    | undefined;
  const slides = block?.fields?.["slides"];
  return slides?.arrayFields ?? null;
}

describe.each(THEMES)("подпанель «Слайд» — %s", (theme) => {
  it("рабочий puck-config темы прочитан (pnpm build && pnpm build:blocks)", () => {
    // Без конфига проверка молчала бы, и «всё зелено» ничего не значило.
    expect(configs.get(theme)).not.toBeNull();
    expect(slideFields(theme)).not.toBeNull();
  });

  it(`состав и порядок контролов — как в эталоне (${REFERENCE})`, () => {
    const fields = slideFields(theme);
    if (!fields) return;
    // `id` — служебный ключ элемента, FocusedItemPanel его не рисует
    // (`if (fieldName === "id") return null`). В составе панели его нет.
    const actualOrder = Object.keys(fields).filter((n) => n !== "id");
    expect(actualOrder).toEqual(EXPECTED.map(([name]) => name));
  });

  it.each(EXPECTED)(
    "контрол «%s» — тип, подпись и опции эталона",
    (name, want) => {
      const fields = slideFields(theme);
      if (!fields) return;
      expect(actualOf(fields[name], want)).toEqual(want);
    },
  );
});

describe("подпанель «Слайд» одинакова во всех пяти темах", () => {
  it("ни одна тема не подменяет состав собственным puckConfig", () => {
    // Тестировщик работает с ОДНОГО сайта, переключая тему: расхождение
    // панели между темами он увидит как «в одной теме настройки другие».
    const shapes = THEMES.map((t) => JSON.stringify(slideFields(t)));
    const differing = THEMES.filter((_, i) => shapes[i] !== shapes[0]);
    expect(differing).toEqual([]);
  });
});
