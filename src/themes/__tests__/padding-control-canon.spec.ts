/**
 * «Отступы» у секции обязаны рисоваться НАШИМ контролом, а не двумя голыми
 * числовыми инпутами с английскими подписями `top` / `bottom`.
 *
 * Владелец, 2026-09-14, по скриншоту сайдбара секции «Вход» — дословно:
 * «Сайдбар привести к виду. Инпуты, отступы должны быть наши».
 *
 * Как ломалось. FieldRenderer конструктора
 * (constructor/src/components/fields/FieldRenderer.tsx) разводит контрол по
 * `field.type`: `case "padding"` → PaddingControl (два слайдера «Сверху» /
 * «Снизу»), `case "object"` → ObjectField (универсальная форма по
 * objectFields). Семнадцать блоков theme-base объявляли отступы как
 * `{ type: 'object', label: 'Отступы' }` и НЕ объявляли objectFields — их
 * достраивал сам сервис: hydrateFields() в
 * src/controllers/theme-puck-config.controller.ts инферит подтип из значения
 * (inferFieldTypeFromValue: number → 'number') и подписывает СЫРЫМ КЛЮЧОМ.
 * Отсюда и брались `top` / `bottom` по-английски. Замер до починки, живой
 * GET https://gateway.merfy.ru/api/themes/rose/puck-config:
 *
 *   LoginSection.fields.padding = {"type":"object","label":"Отступы",
 *     "objectFields":{"top":{"type":"number","label":"top"},
 *                     "bottom":{"type":"number","label":"bottom"}}}
 *   CartBody.fields.padding     = {"type":"padding","label":"Отступы"}  ← канон
 *
 * Что сторожим — ДВА уровня, потому что каждый ловит своё:
 *
 *   1. ИСХОДНИКИ (`packages/**\/*.puckConfig.ts`). Ловит ПРИЧИНУ: ни один блок
 *      не смеет объявить отступы через `type: 'object'`. Работает и для
 *      блоков, которых сегодня нет в каталоге конструктора
 *      (THEME_PUCK_BASE_BLOCK_NAMES) — девять подблоков чекаута лежат в дереве
 *      «спящими», и без этого уровня они вернулись бы сломанными в тот день,
 *      когда их снова выведут в панель.
 *
 *   2. ОТДАННЫЙ КОНФИГ (скомпилированный контроллер, все пять тем). Ловит
 *      СЛЕДСТВИЕ — ровно то, что видит мерчант. Уровень 1 сам по себе не
 *      доказывает, что до панели доехал нужный тип: конфиг проходит через
 *      resolveBlocks (тема может подменить блок целиком) и hydrateFields.
 *
 * Чего гард НЕ ловит (чтобы на него не полагались шире):
 *   • `type: 'hidden'` — это законный способ убрать контрол с экрана, сохранив
 *     проп. Такие блоки печатают отступы инлайном из скрытого параметра
 *     (CheckoutForm и его соседи по странице чекаута). Их здесь не трогаем;
 *   • форму ЗНАЧЕНИЯ в пропах — это предмет zod-схем блоков;
 *   • состав параметров панели — это предмет conformance/panel-canon.json.
 *
 * Требует собранного dist для уровня 2 (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join, relative } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const PACKAGES_ROOT = resolve(SITES_ROOT, "packages");
const DUMP = resolve(__dirname, "padding-control-dump.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Типы, при которых контрол отступов законен. */
const ALLOWED = new Set(["padding", "hidden"]);

const HOW_TO_FIX = [
  "",
  "Как чинить: в <Блок>.puckConfig.ts заменить",
  "    padding: { type: 'object', label: 'Отступы' },",
  "на канон (так объявлены Gallery, Collections, CartBody и ещё 30 блоков):",
  "    padding: { type: 'padding', label: 'Отступы' },",
  "Имя поля и подпись НЕ меняются — меняется только тип контрола.",
  "Форма значения в пропах прежняя: PaddingControl читает и пишет {top, bottom}.",
  "",
].join("\n");

/** Рекурсивный обход без node_modules/dist/симлинков. */
function findPuckConfigs(dir: string, out: string[] = []): string[] {
  const skip = new Set(["node_modules", "dist", ".git", "build", ".astro"]);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) findPuckConfigs(p, out);
    else if (entry.name.endsWith(".puckConfig.ts")) out.push(p);
  }
  return out;
}

/**
 * Блок `{...}`, стоящий за первым совпадением ключа, со сбалансированными
 * скобками. Регуляркой такое не берётся: внутри fields лежат вложенные
 * объекты, и `[^}]*` обрывается на первой же вложенной скобке.
 */
function balancedBlockAfter(src: string, key: RegExp): string | null {
  const m = src.match(key);
  if (!m || m.index === undefined) return null;
  const start = src.indexOf("{", m.index + m[0].length - 1);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Объявление поля `padding` на ВЕРХНЕМ уровне переданного блока. */
function topLevelPadding(block: string | null): string | null {
  if (!block) return null;
  let depth = 0;
  for (let i = 0; i < block.length; i += 1) {
    const c = block[i];
    if (c === "{") {
      depth += 1;
      continue;
    }
    if (c === "}") {
      depth -= 1;
      continue;
    }
    if (depth !== 1) continue;
    if (!block.startsWith("padding", i)) continue;
    if (!/[\s{,]/.test(block[i - 1] ?? " ")) continue;
    const head = block.slice(i).match(/^padding\s*:\s*/);
    if (!head) continue;
    let j = i + head[0].length;
    if (block[j] !== "{") continue;
    let d = 0;
    const from = j;
    for (; j < block.length; j += 1) {
      if (block[j] === "{") d += 1;
      else if (block[j] === "}") {
        d -= 1;
        if (d === 0) return block.slice(from, j + 1).replace(/\s+/g, " ");
      }
    }
  }
  return null;
}

type SourceRow = { file: string; decl: string; type: string };

function scanSources(): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const file of findPuckConfigs(PACKAGES_ROOT).sort()) {
    // Фикстуры контракта — намеренно кривые файлы для тестов резолвера.
    if (file.includes("__tests__")) continue;
    const src = readFileSync(file, "utf-8");
    const fields = balancedBlockAfter(src, /(^|\n)\s*fields\s*:\s*\{/);
    const decl = topLevelPadding(fields);
    if (!decl) continue;
    const t = decl.match(/type\s*:\s*'([^']+)'/);
    rows.push({
      file: relative(SITES_ROOT, file),
      decl,
      type: t ? t[1] : "UNPARSED",
    });
  }
  return rows;
}

describe("Отступы рисуются нашим контролом (PaddingControl), а не голым object", () => {
  // ── Уровень 1: исходники блоков ───────────────────────────────────────────
  describe("исходники: packages/**/*.puckConfig.ts", () => {
    const rows = scanSources();

    it("сканирование вообще что-то нашло (иначе гард сторожит пустоту)", () => {
      expect(rows.length).toBeGreaterThan(30);
    });

    it("ни один блок не объявляет отступы как object", () => {
      const bad = rows.filter((r) => r.type === "object");
      const report = bad
        .map((r) => `  ${r.file}\n      ${r.decl}`)
        .join("\n");
      expect(
        bad.length === 0
          ? ""
          : `Блоков с отступами через object: ${bad.length}\n${report}\n${HOW_TO_FIX}`,
      ).toBe("");
    });

    it("каждое объявление отступов — из разрешённого списка (padding | hidden)", () => {
      const bad = rows.filter((r) => !ALLOWED.has(r.type));
      expect(
        bad.length === 0
          ? ""
          : `Неизвестный тип контрола отступов:\n${bad
              .map((r) => `  ${r.file}: ${r.decl}`)
              .join("\n")}${HOW_TO_FIX}`,
      ).toBe("");
    });
  });

  // ── Уровень 2: то, что реально отдаётся конструктору ──────────────────────
  describe("отданный конфиг: GET /api/themes/:id/puck-config (все пять тем)", () => {
    const compiled = resolve(
      SITES_ROOT,
      "dist",
      "src",
      "controllers",
      "theme-puck-config.controller.js",
    );
    const built = existsSync(compiled) && statSync(compiled).isFile();

    // Молчаливый пропуск запрещён: нет сборки — падаем с понятной причиной.
    it("dist собран (pnpm build && pnpm build:blocks)", () => {
      expect(built ? "" : `нет ${relative(SITES_ROOT, compiled)}`).toBe("");
    });

    const served: Record<string, Record<string, unknown>> = built
      ? JSON.parse(
          execFileSync("node", [DUMP], {
            cwd: SITES_ROOT,
            encoding: "utf-8",
            maxBuffer: 64 * 1024 * 1024,
          }),
        )
      : {};

    for (const theme of THEMES) {
      it(`${theme}: ни у одного блока отступы не отданы как object`, () => {
        const blocks = (served[theme] ?? {}) as Record<
          string,
          { type?: string; objectFields?: unknown }
        >;
        expect(Object.keys(blocks).length).toBeGreaterThan(20);
        const bad = Object.entries(blocks).filter(
          ([, f]) => !ALLOWED.has(String(f?.type)),
        );
        expect(
          bad.length === 0
            ? ""
            : `Тема ${theme}: блоков с object-отступами ${bad.length}\n${bad
                .map(([name, f]) => `  ${name}: ${JSON.stringify(f)}`)
                .join("\n")}${HOW_TO_FIX}`,
        ).toBe("");
      });

      it(`${theme}: подписи «top»/«bottom» не попадают мерчанту на экран`, () => {
        const blocks = (served[theme] ?? {}) as Record<
          string,
          { objectFields?: Record<string, { label?: string }> }
        >;
        const leaked = Object.entries(blocks).filter(([, f]) =>
          Object.values(f?.objectFields ?? {}).some((sub) =>
            ["top", "bottom"].includes(String(sub?.label)),
          ),
        );
        expect(
          leaked.length === 0
            ? ""
            : `Тема ${theme}: сырые английские подписи в панели у ${leaked
                .map(([n]) => n)
                .join(", ")}${HOW_TO_FIX}`,
        ).toBe("");
      });
    }
  });
});
