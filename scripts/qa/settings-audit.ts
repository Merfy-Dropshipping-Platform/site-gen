/**
 * Аудит настроек: какие поля панели НЕ меняют разметку витрины.
 *
 * ЗАЧЕМ. Владелец 22.09: «кидаю эти задачи уже пятый раз». Класс «настройка
 * сохраняется, но ничего не делает» тестер находит по одному пункту: размер
 * заголовка, контейнер, положение видео, ссылка кнопки… Здесь он ищется СРАЗУ
 * по всем секциям всех тем.
 *
 * КАК. Имена и допустимые значения берутся ИЗ САМОЙ ПАНЕЛИ (`*.puckConfig.ts`),
 * а не выдумываются: половина ложных вердиктов 21.09 была именно из-за
 * выдуманных ключей (`videoPosition` вместо `position`, `containerEnabled`
 * вместо `container`). Затем секция рендерится дважды — с двумя разными
 * значениями поля — и разметка сравнивается.
 *
 * Запуск: pnpm exec tsx scripts/qa/settings-audit.ts [--json путь] [--theme t]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderBlock } from "./lib/render";

const SITES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;

/** Поля, которые нечем осмысленно перебрать или которые не про разметку. */
const ПРОПУСК_ТИПОВ = new Set([
  "section-header",
  "hidden",
  "array",
  "object",
  "image",
  "pagePicker",
  "collectionPicker",
  "productPicker",
  // Обёртку схемы ставит СБОРЩИК СТРАНИЦЫ, а не блок: одиночный рендер её не
  // видит и любая схема выглядела бы «мёртвой» во всех секциях сразу. Цвета
  // сторожит отдельная матрица схем (pnpm test:scheme-targets).
  "colorScheme",
]);

type Поле = { тип: string; значения: unknown[] };

/** Два различимых значения поля — по его объявлению в панели. */
function значенияПоля(f: Record<string, unknown>): unknown[] | null {
  const тип = String(f.type ?? "");
  if (ПРОПУСК_ТИПОВ.has(тип)) return null;
  if (тип === "toggle") return ["true", "false"];
  if (тип === "select" || тип === "radio") {
    const opts = (f.options ?? []) as Array<{ value?: unknown }>;
    const vals = opts.map((o) => o?.value).filter((v) => v !== undefined);
    return vals.length >= 2 ? [vals[0], vals[1]] : null;
  }
  if (тип === "colorScheme") return ["scheme-1", "scheme-2"];
  if (тип === "alignment") return ["left", "right"];
  if (тип === "padding") return [{ top: 0, bottom: 0 }, { top: 120, bottom: 120 }];
  if (тип === "slider" || тип === "number") {
    const min = typeof f.min === "number" ? f.min : 0;
    const max = typeof f.max === "number" ? f.max : 100;
    return min === max ? null : [min, max];
  }
  if (тип === "text" || тип === "aiText" || тип === "textarea") {
    return ["НАСТРОЙКА_А", "НАСТРОЙКА_Б"];
  }
  return null;
}

/** Поля панели блока — читаем исходник, чтобы не тянуть TS-модуль. */
function поляБлока(файл: string): Record<string, Поле> {
  const src = readFileSync(файл, "utf-8");
  const i = src.indexOf("fields: {");
  if (i < 0) return {};
  let depth = 1;
  let j = i + "fields: {".length;
  let body = "";
  while (j < src.length && depth > 0) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth > 0) body += c;
    j++;
  }
  const out: Record<string, Поле> = {};
  let d = 0;
  let cur = "";
  const сбросить = (txt: string) => {
    const km = txt.match(/^[\s\n]*\[?'?([a-zA-Z_]\w*)'?/);
    const tm = txt.match(/type:\s*'([^']+)'/);
    if (!km || !tm) return;
    const f: Record<string, unknown> = { type: tm[1] };
    const opts = [...txt.matchAll(/value:\s*'([^']*)'/g)].map((m) => ({ value: m[1] }));
    if (opts.length) f.options = opts;
    const min = txt.match(/min:\s*(-?\d+)/);
    const max = txt.match(/max:\s*(-?\d+)/);
    if (min) f.min = Number(min[1]);
    if (max) f.max = Number(max[1]);
    const знач = значенияПоля(f);
    if (знач) out[km[1]] = { тип: tm[1], значения: знач };
  };
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") d++;
    else if (ch === "}" || ch === "]" || ch === ")") d--;
    if (ch === "," && d === 0) {
      сбросить(cur);
      cur = "";
    } else cur += ch;
  }
  сбросить(cur);
  return out;
}

/** Секции, которые есть у темы (из собранного манифеста). */
function секцииТемы(тема: string): string[] {
  const p = resolve(SITES_ROOT, "dist", "theme-sections", тема, "manifest.json");
  if (!existsSync(p)) return [];
  return Object.keys(JSON.parse(readFileSync(p, "utf-8")));
}

function файлПанели(блок: string): string | null {
  const p = resolve(SITES_ROOT, "packages", "theme-base", "blocks", блок, `${блок}.puckConfig.ts`);
  return existsSync(p) ? p : null;
}

type Находка = { тема: string; секция: string; поле: string; тип: string };


/** Живое наполнение секции: без него рисуется плейсхолдер. */
function НАПОЛНЕНИЕ(секция: string): Record<string, unknown> {
  const картинка = "/images/placeholder.png";
  const общее: Record<string, unknown> = {
    heading: { text: "Заголовок секции" },
    text: { content: "Текст секции" },
    productId: "p1",
  };
  const по: Record<string, Record<string, unknown>> = {
    Hero: {
      heading: { text: "Заголовок" },
      text: { content: "Текст" },
      image: картинка,
      backgroundImages: [картинка],
      button: { text: "Кнопка", link: "/catalog" },
    },
    Slideshow: {
      slides: [
        { id: "s1", heading: { text: "Слайд 1" }, text: { content: "Текст 1" }, image: картинка, button: { text: "К", link: "/a" } },
        { id: "s2", heading: { text: "Слайд 2" }, text: { content: "Текст 2" }, image: картинка, button: { text: "К", link: "/b" } },
      ],
    },
    MultiColumns: {
      columns: [
        { id: "c1", heading: "Колонка 1", text: "Текст 1", linkText: "Ссылка", link: "/a", image: картинка },
        { id: "c2", heading: "Колонка 2", text: "Текст 2", linkText: "Ссылка", link: "/b", image: картинка },
      ],
    },
    MultiRows: {
      rows: [
        { id: "r1", heading: "Ряд 1", text: "Текст 1", image: картинка },
        { id: "r2", heading: "Ряд 2", text: "Текст 2", image: картинка },
      ],
    },
    Gallery: { items: [{ id: "g1", image: картинка, text: "Подпись 1" }, { id: "g2", image: картинка, text: "Подпись 2" }] },
    CollapsibleSection: { items: [{ id: "i1", heading: "Вопрос", text: "Ответ" }] },
    Publications: { heading: { text: "Публикации" } },
    PromoBanner: { text: "Акция", link: "/catalog" },
    ImageWithText: { heading: { text: "Заголовок" }, text: { content: "Текст" }, image: картинка, button: { text: "Кнопка", link: "/a" } },
    Video: { heading: "Видео", videoUrl: "https://example.com/v.mp4", poster: картинка },
    Newsletter: { heading: "Подписка", text: { content: "Текст" } },
  };
  return { ...общее, ...(по[секция] ?? {}) };
}

const аргументы = process.argv.slice(2);
const темыДляПрогона = (() => {
  const i = аргументы.indexOf("--theme");
  return i >= 0 ? [аргументы[i + 1]] : [...ТЕМЫ];
})();

const мёртвые: Находка[] = [];
const проверено: Находка[] = [];
const упало: Array<Находка & { причина: string }> = [];

for (const тема of темыДляПрогона) {
  for (const секция of секцииТемы(тема)) {
    const панель = файлПанели(секция);
    if (!панель) continue;
    const поля = поляБлока(панель);
    for (const [поле, { тип, значения }] of Object.entries(поля)) {
      // Секция БЕЗ содержимого рисует плейсхолдер, а в нём половина настроек
      // не применяется — и аудит объявил бы их мёртвыми. Ровно на этом сорвались
      // ручные замеры 21.09, поэтому каждой секции даётся живое наполнение.
      const база = { id: `${секция}-1`, colorScheme: "scheme-1", ...НАПОЛНЕНИЕ(секция) };
      let A = "";
      let B = "";
      try {
        A = renderBlock(тема, секция, { ...база, [поле]: значения[0] });
        B = renderBlock(тема, секция, { ...база, [поле]: значения[1] });
      } catch (e) {
        упало.push({ тема, секция, поле, тип, причина: (e as Error).message.slice(0, 60) });
        continue;
      }
      проверено.push({ тема, секция, поле, тип });
      if (A === B) мёртвые.push({ тема, секция, поле, тип });
    }
  }
}

console.log(`проверено полей: ${проверено.length}`);
console.log(`не влияют на разметку: ${мёртвые.length}`);
console.log(`не удалось отрендерить: ${упало.length}`);
for (const м of мёртвые.slice(0, 40)) {
  console.log(`  ❌ ${м.тема.padEnd(8)} ${м.секция.padEnd(20)} ${м.поле.padEnd(22)} (${м.тип})`);
}

const j = аргументы.indexOf("--json");
if (j >= 0) {
  writeFileSync(
    аргументы[j + 1],
    JSON.stringify({ проверено: проверено.length, мёртвые, упало }, null, 2),
    "utf-8",
  );
  console.log(`отчёт: ${аргументы[j + 1]}`);
}
