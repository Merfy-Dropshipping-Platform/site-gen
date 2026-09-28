#!/usr/bin/env node
/**
 * Панель секции «вглубь»: ПОЛНЫЕ defaultProps (ровно то, что конструктор
 * впишет в секцию), типы полей и поля-РАЗМЕРЫ на любой глубине.
 *
 * Зачем не хватает puck-config-panel.mjs. Тот отдаёт значения только
 * ОБЪЯВЛЕННЫХ полей верхнего уровня. А `CustomFieldsPanel.updateProp` при
 * любой правке мержит в секцию ВСЕ ключи defaultProps — и скрытые поля, и
 * ключи вовсе без поля. Так у vanilla «Основной текст» первая правка вписывала
 * скрытые `headingSize`/`textSize` = 'medium', и под признаком заголовок
 * прыгал с 16 на 20 px (замер 25.09) — проверка по полям этого не видела.
 *
 * Поле-размер — select/radio, все варианты которого из шкалы SCALE_ORDER
 * («Тонкий/Маленький/Средний/Большой»): верхнее поле, поле объекта
 * («Заголовок → Размер заголовка») и поле элемента списка («Ряды → Размер»).
 * Плюс СКРЫТЫЕ размеры: ключ defaultProps без видимого поля со значением из
 * шкалы (у «Основного текста» четырёх тем — headingSize/textSize = 'medium').
 * Панель их не показывает, но вписывает первой же правкой, и нормализация
 * (coerceMainTextProps) ставит их выше видимого «Текст → Размер» — значит,
 * именно они решают, что на витрине. Варианты — small/medium/large.
 *
 * `sample` — те же defaultProps, но ПУСТЫЕ текстовые поля заполнены образцом:
 * без текста узла нет, и размер текста мерить не на чем («Размер
 * подзаголовка» при пустом подзаголовке молча проверял бы пустоту).
 *
 * Зачем дочерний процесс — та же причина, что у puck-config-panel.mjs:
 * контроллер тянет ESM-модули блоков, jest (CJS) на них падает.
 *
 * Использование: node puck-config-deep.mjs <тема>
 * На stdout — JSON { "<Блок>": { defaults, types, scales, sample } };
 * scales: [{ path, label, options, def }], path — сегменты пути,
 * «*» — каждый элемент списка; options — в порядке шкалы.
 */
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

/** Порядок шкалы размеров: от меньшего к большему. */
const SCALE_ORDER = ["thin", "small", "medium", "large"];
/** Текстовые поля, которые в `sample` заполняются образцом, если пусты. */
const TEXT_TYPES = new Set(["aiText", "text", "textarea"]);
const SAMPLE = "Образец текста размера";
/**
 * Тексты, которые блок получает НЕ из полей панели, а от сборки. «Страница»
 * рисует заголовок и текст выбранной страницы магазина (build data-stage
 * кладёт их в heading/content) — без них в секции нет ни одного узла текста.
 */
const BUILD_TEXTS = {
  Page: { heading: SAMPLE, content: `<p>${SAMPLE}</p>` },
};

const isScale = (f) =>
  (f?.type === "select" || f?.type === "radio") &&
  Array.isArray(f.options) &&
  f.options.length >= 2 &&
  f.options.every((o) => SCALE_ORDER.includes(o?.value));

const isEmpty = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Заполнить пустые текстовые поля уровня `fields` в объекте `target`. */
function fillTexts(fields, target) {
  for (const [name, f] of Object.entries(fields ?? {})) {
    if (TEXT_TYPES.has(f?.type) && isEmpty(target[name])) target[name] = SAMPLE;
    if (f?.type === "object") {
      if (typeof target[name] !== "object" || target[name] === null)
        target[name] = {};
      fillTexts(f.objectFields, target[name]);
    }
    if (f?.type === "array" && Array.isArray(target[name])) {
      for (const item of target[name]) {
        if (item && typeof item === "object") fillTexts(f.arrayFields, item);
      }
    }
  }
}

/** Поля-размеры уровня `fields` с префиксом пути. */
function scalesOf(fields, prefix, defaults) {
  const out = [];
  for (const [name, f] of Object.entries(fields ?? {})) {
    const path = [...prefix, name];
    const def = defaults?.[name];
    if (isScale(f)) {
      out.push({
        path,
        label: f.label ?? "",
        options: SCALE_ORDER.filter((v) =>
          f.options.some((o) => o.value === v),
        ),
        def: isEmpty(def) ? null : def,
      });
    }
    if (f?.type === "object") out.push(...scalesOf(f.objectFields, path, def));
    if (f?.type === "array")
      out.push(...scalesOf(f.arrayFields, [...path, "*"], undefined));
  }
  return out;
}

async function main() {
  const theme = process.argv[2];
  const require = createRequire(import.meta.url);
  const mod = require(
    resolve(
      SITES_ROOT,
      "dist",
      "src",
      "controllers",
      "theme-puck-config.controller.js",
    ),
  );
  const cfg = await new mod.ThemePuckConfigController().getPuckConfig(theme);
  const out = {};
  for (const [block, def] of Object.entries(cfg.components ?? {})) {
    const defaults = structuredClone(def?.defaultProps ?? {});
    const types = Object.fromEntries(
      Object.entries(def?.fields ?? {}).map(([name, f]) => [
        name,
        f?.type ?? null,
      ]),
    );
    const sample = {
      ...structuredClone(defaults),
      ...(BUILD_TEXTS[block] ?? {}),
    };
    fillTexts(def?.fields, sample);
    const scales = scalesOf(def?.fields, [], def?.defaultProps);
    const visible = new Set(scales.map((x) => x.path.join(".")));
    for (const [key, value] of Object.entries(defaults)) {
      if (
        typeof value !== "string" ||
        !SCALE_ORDER.includes(value) ||
        visible.has(key)
      )
        continue;
      if (types[key] !== undefined && types[key] !== "hidden") continue;
      scales.push({
        path: [key],
        label: "(скрытое поле)",
        options: ["small", "medium", "large"],
        def: value,
        hidden: true,
      });
    }
    out[block] = { defaults, types, scales, sample };
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
