/**
 * Контрол в сайдбаре обязан СТОЯТЬ НА ЗНАЧЕНИИ, а не в нейтральном положении.
 *
 * Откуда проверка. Жалоба владельца 2026-09-13: «настройки у параметров и у
 * секций — размеры, кнопки — стоят в нейтральном положении и требуют действия
 * пользователя, поэтому мы ловим баги». Механика бага проверена по коду
 * конструктора:
 *   • SelectField: значения нет → в поле «Выберите...» (плейсхолдер), то есть
 *     панель НЕ показывает, что реально нарисовано на витрине;
 *   • RadioField: значения нет → НИ ОДНА пилюля не подсвечена;
 *   • AlignmentField: значения нет → подсвечено 'left' (FieldRenderer
 *     `value || "left"`), хотя порт может рисовать по центру — панель ВРЁТ;
 *   • CustomFieldsPanel.updateProp мержит defaultProps в props при ЛЮБОЙ
 *     правке (`{...defaultProps, ...existingProps, [field]: value}`), поэтому
 *     неверный дефолт материализуется в данные и МЕНЯЕТ ВИТРИНУ при правке
 *     соседнего поля. Отсюда жёсткое требование: дефолт обязан совпадать с
 *     фактическим фолбэком порта (проверяется рендером, см. ниже).
 *
 * Что сторожит этот тест. Каждое поле панели КАЖДОЙ темы имеет либо значение в
 * defaultProps, либо ЯВНОЕ исключение с причиной. Новая секция или новое поле
 * без дефолта роняют тест — молчаливый пропуск невозможен. Набор полей берётся
 * из РАБОЧЕГО puck-config темы (тот же путь, что у конструктора:
 * `GET /api/themes/:id/puck-config`), а не из theme-base: у тем бывают
 * СОБСТВЕННЫЕ puckConfig (у satin их одиннадцать), и resolveBlocks подставляет
 * пакет темы целиком.
 *
 * Чего этот тест НЕ проверяет. Что дефолт РАВЕН фолбэку порта — это проверяется
 * снимками секций (section-html-snapshot) и отдельным зондом при правке:
 * рендер блока без значения обязан быть байт-в-байт равен рендеру со значением.
 * Здесь — только «значение есть или явно объяснено, почему его нет».
 *
 * Требует сборки: pnpm build (компилированный контроллер puck-config).
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const PANEL = resolve(__dirname, "puck-config-panel.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

type PanelField = {
  type: string | null;
  label: string;
  hasDefault: boolean;
  value: unknown;
};
type ThemePanel = Record<string, Record<string, PanelField>>;

/** Не контролы: в панели их не видно вовсе. */
const NOT_A_CONTROL = new Set(["hidden", "section-header"]);

/**
 * Типы, у которых ПУСТО — это законное состояние: поле хранит контент или
 * ссылку на сущность мерчанта, и «дефолтное значение» означало бы подсунуть
 * чужой текст/товар. Оформление (размеры, выравнивание, тумблеры, radio,
 * слайдеры) сюда НЕ входит — оно обязано иметь дефолт.
 */
const CONTENT_TYPES: Record<string, string> = {
  aiText: "текст мерчанта: дефолт подставил бы чужой контент",
  text: "текст мерчанта: дефолт подставил бы чужой контент",
  textarea: "текст мерчанта: дефолт подставил бы чужой контент",
  richText: "текст мерчанта: дефолт подставил бы чужой контент",
  image: "изображение мерчанта: дефолт подставил бы чужую картинку",
  imagePair: "изображения мерчанта: дефолт подставил бы чужие картинки",
  video: "ссылка на ролик мерчанта",
  productPicker: "выбор товара мерчанта",
  collectionPicker: "выбор коллекции мерчанта",
  pagePicker: "выбор страницы мерчанта",
  pageContentPicker: "выбор страницы мерчанта",
  disabledHint: "не контрол: подпись «редактируется в другом месте»",
  object:
    "контейнер вложенных полей: значения живут у вложенных (панель мержит props поверхностно, вложенный дефолт до существующей секции не доходит)",
};

/**
 * Точечные исключения: поле оформления, но фактического дефолта у него НЕТ или
 * он не выражается статикой. Причина обязана быть проверяемой по коду порта.
 * `themes` — темы, где исключение действует; без него действует во всех.
 */
type FieldException = { reason: string; themes?: readonly Theme[] };

const FIELD_EXCEPTIONS: Record<string, FieldException> = {
  // ── Цветовая схема: дефолт ДИНАМИЧЕСКИЙ ───────────────────────────────────
  // Блок без colorScheme рендерится БЕЗ обёртки `.color-scheme-N`
  // (v2-page-composer.ts: обёртка ставится только при непустой схеме) и
  // наследует :root, а :root — это активная схема темы ИЛИ выбор мерчанта
  // (tokens-css.ts: merchant `defaultSchemeIndex` приоритетнее theme.json
  // `defaultScheme`). Статичное 'scheme-1' заморозило бы блок на первой схеме и
  // сломало бы вид тем мерчантам, кто сменил схему темы. Панель при этом не
  // пустая: ColorSchemeSelector при отсутствии значения показывает первую схему.
  "*.colorScheme": {
    reason:
      "дефолт динамический: без значения блок наследует :root (активная схема темы/мерчанта); статика заморозила бы выбор мерчанта",
  },
  "*.containerColorScheme": {
    reason:
      "дефолт динамический: без значения контейнер наследует схему секции; статика заморозила бы выбор мерчанта",
  },
  "*.menuColorScheme": {
    reason:
      "дефолт динамический: без значения меню наследует схему шапки; статика заморозила бы выбор мерчанта",
  },
  // ── Цвета и шрифты страницы «Заказ принят» ────────────────────────────────
  // OrderConfirmation.astro: `ocVar(p.orderBg, '--color-bg')` и
  // `if (p.headingFont) …` — ПУСТО означает «взять токен темы». Статичный hex
  // или имя шрифта отвязали бы страницу от темы и схемы мерчанта.
  "OrderConfirmation.orderBg": { reason: "пусто = токен темы (--color-bg)" },
  "OrderConfirmation.summaryBg": { reason: "пусто = токен темы (--color-input-bg)" },
  "OrderConfirmation.accentColor": { reason: "пусто = токен темы (--color-accent)" },
  "OrderConfirmation.buttonColor": { reason: "пусто = токен темы (--color-button-bg)" },
  "OrderConfirmation.errorColor": { reason: "пусто = токен темы (--color-error)" },
  "OrderConfirmation.headingFont": { reason: "пусто = шрифт заголовков темы" },
  "OrderConfirmation.bodyFont": { reason: "пусто = шрифт текста темы" },
  "OrderConfirmation.headingWeight": { reason: "пусто = насыщенность заголовков темы" },
  "OrderConfirmation.bodyWeight": { reason: "пусто = насыщенность текста темы" },
  // ── Порты, у которых «не задано» — ОТДЕЛЬНОЕ состояние ────────────────────
  // Ни одно значение списка не даёт тот же HTML, что отсутствие значения:
  // порт рисует четвёртую ветку. Дефолт здесь изменил бы вид витрины, а это
  // прямой запрет задачи. Чинить надо ПОРТ (добавить фолбэк), и это отдельная
  // правка: она двигает снимки секций.
  "Hero.alignment": {
    themes: ["satin"],
    reason:
      "satin Hero.astro: без значения alignItemsCls/textAlignCls пустые (четвёртая ветка), ни left/center/right этого не повторяют",
  },
  "ImageWithText.width": {
    themes: ["satin"],
    reason:
      "satin ImageWithText.astro: без значения max-w-[1920px] (полотно), а список даёт только 780/1080/1320",
  },
  "MultiRows.width": {
    themes: ["satin"],
    reason:
      "satin MultiRows.astro: без значения класс .satin-container, а список даёт только max-w-[780/1080/1320]",
  },
  "MultiColumns.imageAspectRatio": {
    themes: ["satin"],
    reason:
      "satin MultiColumns.astro: без значения колонка рисует НАТИВНУЮ иконку 56×56, любое значение включает медиа-бокс",
  },
  "Hero.position": {
    themes: ["rose", "vanilla", "satin"],
    reason:
      "порт читает p.position ?? p.contentPosition, а contentPosition — легаси-поле, которое дефолты theme-base материализуют в props ('center') при любой правке панели; статичная «Позиция» перебила бы его и сдвинула уже стоящие баннеры (проверено рендером: HTML с contentPosition:'center' и он же + position различаются во всех пяти темах). У flux и bloom значение в blockDefaults стоит ИСТОРИЧЕСКИ — расхождение зафиксировано в отчёте, снимать его отдельным решением",
  },
  "Hero.overlay": {
    themes: ["vanilla"],
    reason:
      "vanilla Hero.astro: без значения фикс-затемнение верстальщика bg-black/25, а overlay:0 его снимает",
  },
};

function readPanel(theme: Theme): ThemePanel | null {
  try {
    const raw = execFileSync("node", [PANEL, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as ThemePanel;
  } catch {
    return null;
  }
}

/** Ключи исключения, под которые попадает пара (блок, поле). */
const exceptionKeys = (block: string, field: string): string[] => [
  `${block}.${field}`,
  `*.${field}`,
];

function exceptionFor(
  block: string,
  field: string,
  theme: Theme,
): FieldException | null {
  for (const key of exceptionKeys(block, field)) {
    const ex = FIELD_EXCEPTIONS[key];
    if (!ex) continue;
    if (ex.themes && !ex.themes.includes(theme)) continue;
    return ex;
  }
  return null;
}

const panels = new Map<Theme, ThemePanel | null>();
for (const theme of THEMES) panels.set(theme, readPanel(theme));

/** Пары (блок, поле), реально использовавшие исключение, — для отлова мёртвых. */
const usedExceptionKeys = new Set<string>();

describe.each(THEMES)("дефолты полей панели — %s", (theme) => {
  const panel = panels.get(theme) ?? null;

  it("рабочий puck-config темы прочитан (pnpm build)", () => {
    // Без конфига проверка молчала бы и «всё зелено» ничего не значило.
    expect(panel).not.toBeNull();
    expect(Object.keys(panel ?? {}).length).toBeGreaterThan(0);
  });

  it("у каждого контрола есть значение или явное исключение с причиной", () => {
    if (!panel) return;
    const missing: string[] = [];
    for (const [block, fields] of Object.entries(panel)) {
      for (const [name, field] of Object.entries(fields)) {
        const type = field.type ?? "";
        if (NOT_A_CONTROL.has(type)) continue;
        if (type in CONTENT_TYPES) continue;
        if (field.hasDefault) continue;
        const ex = exceptionFor(block, name, theme);
        if (ex) {
          for (const key of exceptionKeys(block, name)) {
            if (FIELD_EXCEPTIONS[key] === ex) usedExceptionKeys.add(key);
          }
          continue;
        }
        missing.push(`${block}.${name} [${type}]`);
      }
    }
    // Поле оформления без значения = контрол в панели стоит в нейтральном
    // положении и врёт про витрину. Пропишите дефолт, РАВНЫЙ фолбэку порта
    // (проверьте рендером: без значения и со значением HTML обязан совпасть),
    // либо добавьте запись в FIELD_EXCEPTIONS с проверяемой причиной.
    expect(missing.sort()).toEqual([]);
  });
});

describe("список исключений", () => {
  it("не содержит мёртвых записей", () => {
    // Исключение, которое больше никому не нужно, — это забытая причина:
    // поле давно получило дефолт, а запись продолжает разрешать пустоту.
    const allRead = THEMES.every((t) => panels.get(t));
    if (!allRead) return;
    const dead = Object.keys(FIELD_EXCEPTIONS).filter(
      (key) => !usedExceptionKeys.has(key),
    );
    expect(dead.sort()).toEqual([]);
  });

  it("у каждой записи есть непустая причина", () => {
    const silent = Object.entries(FIELD_EXCEPTIONS)
      .filter(([, ex]) => !ex.reason || ex.reason.trim().length < 10)
      .map(([key]) => key);
    expect(silent).toEqual([]);
  });
});
