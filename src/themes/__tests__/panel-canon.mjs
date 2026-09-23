#!/usr/bin/env node
/**
 * Канон состава параметров секций: что именно видит мерчант в правой панели
 * конструктора — по каждой из пяти тем и по каждому блоку.
 *
 * Зачем файл вообще. Владелец (2026-09-13): «Есть секции, определённые
 * настройки и параметры — они и должны быть. Нельзя их менять ни в коем
 * случае, ни при каких обстоятельствах». Проверять это глазами не выходит:
 * панель собирается из puckConfig темы, и лишнее поле замечает тестер, а не
 * мы. Отсюда снимок (conformance/panel-canon.json) и гард
 * (panel-canon.spec.ts), который роняет CI на любом расхождении.
 *
 * Зачем дочерний процесс. `getPuckConfig` дёргает СКОМПИЛИРОВАННЫЙ контроллер
 * (dist/src/controllers/theme-puck-config.controller.js), а тот подтягивает
 * ESM-модули блоков из dist/astro-blocks. jest (CJS, без
 * --experimental-vm-modules) падает на них с «Unexpected token 'export'» — та
 * же причина, по которой рядом лежат puck-config-fields.mjs /
 * puck-config-panel.mjs / puck-config-raw.mjs.
 *
 * Зачем брать конфиг ТЕМЫ, а не theme-base. У тем бывают СОБСТВЕННЫЕ
 * puckConfig (у satin их одиннадцать), и resolveBlocks подставляет пакет темы
 * ЦЕЛИКОМ. Считать состав по theme-base значило бы сторожить satin чужой
 * панелью — гард бы молчал ровно там, где тема расходится.
 *
 * Использование:
 *   node panel-canon.mjs                 → JSON снимка на stdout
 *   node panel-canon.mjs --out <файл>    → записать снимок в файл
 *   node panel-canon.mjs --theme rose    → только одна тема (для отладки)
 *
 * Требует собранного dist: `pnpm build && pnpm build:blocks`.
 */
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const SITES_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

export const CANON_THEMES = ["rose", "bloom", "satin", "flux", "vanilla"];

/**
 * Видимость контрола глазами конструктора. Проверено чтением исходника
 * (backend/services/constructor/src/components/fields/):
 *
 *   'off'      — `type: 'hidden'`. И FieldRenderer.tsx (`if (field.type ===
 *                "hidden") return null`), и CustomFieldsPanel.tsx
 *                (та же проверка выше по списку) возвращают null: контрола НЕТ
 *                НИГДЕ — ни в основной панели, ни в подпанели. Это и есть
 *                «убрать поле с экрана», сохранив проп в схеме.
 *   'subpanel' — `hiddenInMainPanel: true`. CustomFieldsPanel пропускает поле в
 *                ОСНОВНОЙ панели, но оно остаётся доступным через дерево слева
 *                (NamedFocusedPanel / FocusedItemPanel). То есть это НЕ
 *                «скрыть», а «перенести в подпанель».
 *   'panel'    — обычный контрол основной панели секции.
 *   'never'    — поле внутри объекта (objectFields) с условием показа
 *                `visibleWhen`, которое панель выполнить не может. ObjectField.tsx
 *                ищет СОСЕДНЕЕ поле по имени: `objectValue[cond.field]`. Путь
 *                вроде `productCard.nextPhoto` там не находится никогда, и поле
 *                не показывается ни при каком значении. Так «Режим следующего
 *                фото» до 23.09 числился здесь «в панели», а мерчант и тестер
 *                его ни разу не видели. На верхнем уровне и в элементах списков
 *                конструктор условия не проверяет вовсе — там поле видно всегда.
 */
function visibilityOf(field, objectSiblings) {
  if (field?.type === "hidden") return "off";
  const cond = field?.visibleWhen;
  if (objectSiblings && cond && !(cond.field in objectSiblings)) return "never";
  if (field?.hiddenInMainPanel === true) return "subpanel";
  return "panel";
}

/** Опции select/radio в стабильном виде «значение=подпись». */
function optionsOf(field) {
  if (!Array.isArray(field?.options)) return undefined;
  return field.options.map((o) =>
    o && typeof o === "object" ? `${o.value}=${o.label ?? ""}` : String(o),
  );
}

/**
 * Описание одного контрола. undefined-ключи не попадают в JSON.
 * `objectSiblings` — соседние поля, если контрол лежит внутри объекта.
 */
function describeField(field, objectSiblings) {
  const out = {
    type: field?.type ?? null,
    label: field?.label ?? "",
    visibility: visibilityOf(field, objectSiblings),
  };
  const options = optionsOf(field);
  if (options) out.options = options;
  // Потолок списка: именно он не даёт мерчанту добавить лишний элемент
  // (SortableItem: `canAddMore = arrayField.max ? items.length < max : true`).
  if (typeof field?.max === "number") out.max = field.max;
  if (typeof field?.min === "number") out.min = field.min;
  if (field?.arrayFields && typeof field.arrayFields === "object") {
    out.itemFields = {};
    for (const [name, sub] of Object.entries(field.arrayFields)) {
      out.itemFields[name] = describeField(sub);
    }
  }
  if (field?.objectFields && typeof field.objectFields === "object") {
    out.objectFields = {};
    for (const [name, sub] of Object.entries(field.objectFields)) {
      out.objectFields[name] = describeField(sub, field.objectFields);
    }
  }
  return out;
}

export async function collectPanelCanon(themes = CANON_THEMES) {
  const require = createRequire(import.meta.url);
  const compiled = resolve(
    SITES_ROOT,
    "dist",
    "src",
    "controllers",
    "theme-puck-config.controller.js",
  );
  const mod = require(compiled);
  const controller = new mod.ThemePuckConfigController();
  const out = {};
  for (const theme of themes) {
    const cfg = await controller.getPuckConfig(theme);
    const blocks = {};
    for (const [block, def] of Object.entries(cfg.components ?? {})) {
      const fields = {};
      // Порядок Object.entries = порядок объявления в puckConfig, то есть
      // порядок контролов в панели. Не сортировать: перестановка полей —
      // тоже изменение панели, и гард обязан её заметить.
      for (const [name, field] of Object.entries(def?.fields ?? {})) {
        fields[name] = describeField(field);
      }
      blocks[block] = { label: def?.label ?? "", fields };
    }
    out[theme] = blocks;
  }
  return out;
}

function parseArgs(argv) {
  const out = { themes: CANON_THEMES, outFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") out.outFile = argv[i + 1];
    if (argv[i] === "--theme") out.themes = [argv[i + 1]];
  }
  return out;
}

async function main() {
  const { themes, outFile } = parseArgs(process.argv.slice(2));
  const canon = await collectPanelCanon(themes);
  const payload = {
    // Читателю снимка: это НЕ произвольный кэш, а утверждение о продукте.
    _: [
      "Канон состава параметров секций. Снимается с того же скомпилированного",
      "контроллера, который отдаёт конфиг конструктору (GET /api/themes/:id/puck-config).",
      "Менять состав параметров нельзя: владелец, 2026-09-13.",
      "Если изменение намеренное — пересними (pnpm panel-canon:refresh) ОТДЕЛЬНЫМ",
      "коммитом и объясни в нём, кто и зачем разрешил.",
      "ВАЖНО: это ЗАМЕР сегодняшнего состояния, а НЕ выписка из макета. Источник",
      "истины по составу — Figma; панели, ещё не сверенные с макетом, перечислены",
      "в conformance/panel-canon.pending.json — их сегодняшний состав эталоном НЕ является.",
    ].join(" "),
    verifiedAgainstFigma: false,
    themes: canon,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (outFile) {
    const abs = resolve(SITES_ROOT, outFile);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, json, "utf-8");
    process.stderr.write(`panel-canon → ${abs}\n`);
    return;
  }
  process.stdout.write(json);
}

// Файл работает и как CLI, и как модуль (гард импортирует CANON_THEMES).
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err));
    process.exit(1);
  });
}
