#!/usr/bin/env node
/**
 * Покрытие начертаний («Ж»/«К») по ВСЕМ форматируемым полям ВСЕХ секций пяти тем.
 *
 * Зачем файл. Rich-text чинили трижды (0d8117d9, 54823834, 12177f56) и трижды
 * возвращались: правили ОДНО поле, на которое пожаловался тестер, а класс
 * оставался дырявым. 13.09 дыра вылезла в четвёртый раз — `Collections.heading`:
 * замер живой цепочки отдавал `&lt;strong&gt;&lt;em&gt;Коллекция
 * товаров&lt;/em&gt;&lt;/strong&gt;` ТЕКСТОМ в `<h2>`. Хелпер `inlineFormat`
 * лежит в пяти темах побайтово одинаковый и покрыт юнит-тестом
 * (rich-text-bold-italic.spec.ts) — но никто не проверял, ЗОВУТ ли его из
 * конкретного поля конкретного порта. Юнит-тест хелпера зелёный, витрина сырая.
 *
 * Что здесь. Список форматируемых полей берётся не руками, а из РАБОЧЕГО
 * puck-конфига темы (`ThemePuckConfigController.getPuckConfig`) — того самого,
 * который конструктор показывает мерчанту. Форматируемое поле = `type: 'aiText'`:
 * это единственный контрол с кнопками «Ж»/«К» (backend/services/constructor/
 * src/components/fields/FieldRenderer.tsx:254 → AITextInput, единственный
 * потребитель lib/textFormat). Ни `text`, ни `textarea` кнопок не имеют.
 * Поэтому НОВОЕ поле, заведённое в puckConfig, попадает в проверку САМО —
 * забыть подключить его молча нельзя.
 *
 * Как рендерим. `render-theme-sections.mjs` с `live:true` + `cascade:true`, то
 * есть РОВНО той цепочкой, что работает в проде: adaptLegacyProps →
 * blockDefaults темы → resolveBlockProps → скомпилированный модуль секции,
 * а модуль ищется лестницей витрины (порт темы → пакет темы → theme-base).
 * Голый вызов `inlineFormat` меряет путь, которого в проде нет.
 *
 * Как считаем. Метрика тестировщика дословно: «в <h2> ноль элементов
 * strong/em, textContent содержит <strong>». Разметку и текст различает
 * настоящий парсер (node-html-parser), а не подстрока: маркер, попавший в
 * АТРИБУТ (`aria-label="<strong>…"`), разметкой не является и зачётом не идёт.
 *
 * Использование:
 *   node rich-text-coverage.mjs <тема>            → JSON-строки покрытия
 *   node rich-text-coverage.mjs <тема> --xss      → JSON-строки XSS-проверки
 *   node rich-text-coverage.mjs --table           → таблица по пяти темам
 *   node rich-text-coverage.mjs --table --xss     → то же для XSS
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build                     — dist/src (пайплайн + контроллер puck-config);
 *   pnpm build:blocks              — dist/astro-blocks (общие порты и пакеты тем);
 *   pnpm build:theme-sections:all  — dist/theme-sections/<тема>.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');

export const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'];

/**
 * Маркер: только латиница в верхнем регистре и цифры. Часть портов гонит текст
 * через `toUpperCase()` (или css `text-transform`), а часть — через `slugify`
 * для якорей; такой маркер переживает и то и другое без ложных «поле потерялось».
 */
export const MARKER = (n) => `RTX${String(n).padStart(2, '0')}Z`;

/** Значение, которое панель пишет в проп при нажатых «Ж» и «К» (порядок wrapText). */
export const formatPayload = (marker) => `<strong><em>${marker}</em></strong>`;

/**
 * Вредоносный ввод мерчанта в адрес ЕГО ЖЕ покупателей (stored XSS). Начертание
 * оставлено намеренно: проверяем ОБА направления сразу — разметка выживает,
 * чужой HTML нет.
 */
export const xssPayload = (marker) =>
  `<strong><em>${marker}</em></strong>` +
  `<img src="${marker}.png" onerror="alert('${marker}')">` +
  `<script>alert('${marker}')</script>` +
  `<a href="javascript:alert('${marker}')">${marker}LINK</a>` +
  `<div onmouseover="alert('${marker}')">${marker}DIV</div>`;

/**
 * Реквизит, без которого поле не доходит до разметки. Не «удобные» дефолты, а
 * состояние, в котором мерчант это поле и видит в панели.
 */
const EXTRA_PROPS = {
  // Подвал: заголовок и текст живут в блоке «Рассылка», который порт рисует
  // только при включённом тумблере.
  Footer: { newsletter: { enabled: true } },
};

/**
 * Поля, до разметки НЕ доезжающие, — каждое с причиной. Список заморожен: гард
 * сверяет фактический набор с этим и падает, если он ВЫРОС (забыли подключить
 * новое поле) или СЖАЛСЯ (поле ожило — значит запись устарела и её надо снять).
 */
export const NOT_RENDERED = {};

/**
 * Скрытые от мерчанта поля (`type: 'hidden'`) в проверку не берём: контрола нет
 * ни в панели, ни в подпанели (FieldRenderer.tsx:85 `if (field.type ===
 * "hidden") return null`), кнопок «Ж»/«К» мерчанту не достать.
 * Единственный такой набор сегодня — `Hero.slides[]` во всех пяти темах
 * (карусель героя выключена, слайды живут в «Слайд-шоу»).
 *
 * `hiddenInMainPanel: true` — НЕ скрытое: поле убрано из главной панели, но
 * правится через подсекцию outline, и кнопки «Ж»/«К» там есть. Берём.
 */
function isReachable(field) {
  return field?.type !== 'hidden';
}

/** Все пути до полей `aiText` внутри одной панели, включая объекты и списки. */
export function richTextPaths(fields) {
  const acc = [];
  const walk = (f, path) => {
    if (!isReachable(f)) return;
    if (f?.type === 'aiText') {
      acc.push(path);
      return;
    }
    if (f?.arrayFields) {
      for (const [k, v] of Object.entries(f.arrayFields)) walk(v, `${path}[].${k}`);
    }
    if (f?.objectFields) {
      for (const [k, v] of Object.entries(f.objectFields)) walk(v, `${path}.${k}`);
    }
  };
  for (const [n, f] of Object.entries(fields ?? {})) walk(f, n);
  return acc;
}

/** Рабочий puck-конфиг темы — тот же скомпилированный контроллер, что у конструктора. */
export async function runtimeFields(theme) {
  const require = createRequire(import.meta.url);
  const mod = require(
    resolve(SITES_ROOT, 'dist', 'src', 'controllers', 'theme-puck-config.controller.js'),
  );
  const cfg = await new mod.ThemePuckConfigController().getPuckConfig(theme);
  const out = {};
  for (const [block, def] of Object.entries(cfg.components ?? {})) {
    const paths = richTextPaths(def?.fields);
    if (paths.length) out[block] = paths.sort();
  }
  return out;
}

/** Положить значение по пути `a.b[].c`; в список — каждому элементу. */
export function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i += 1) {
    let key = parts[i];
    const isArr = key.endsWith('[]');
    if (isArr) key = key.slice(0, -2);
    if (isArr) {
      if (!Array.isArray(cur[key]) || cur[key].length === 0) cur[key] = [{}];
      const rest = parts.slice(i + 1).join('.');
      for (const item of cur[key]) setPath(item, rest, value);
      return;
    }
    if (i === parts.length - 1) {
      cur[key] = value;
      return;
    }
    if (typeof cur[key] !== 'object' || cur[key] === null || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
}

function renderJobs(theme, jobs) {
  const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

/** Ближайший предок с таким тегом (включая сам узел). */
function hasAncestor(node, tag) {
  let cur = node;
  while (cur) {
    if (String(cur.rawTagName ?? '').toLowerCase() === tag) return true;
    cur = cur.parentNode;
  }
  return false;
}

/**
 * Разбор результата ОДНОГО поля.
 *
 * `ok`     — маркер стоит в НАСТОЯЩЕЙ разметке: элемент `<em>` с этим текстом
 *            внутри `<strong>` (ровно то, что отдаёт inlineFormat);
 * `raw`    — теги видны В ТЕКСТЕ страницы (жалоба тестера дословно);
 * `plain`  — значение доехало, но начертание потеряно (кнопка «Ж» ничего не даёт);
 * `absent` — поле до разметки не доехало вовсе.
 *
 * Проверка идёт ПО МАРКЕРУ, а не по странице целиком: у секции таких полей два
 * и больше, и сырьё в одном не должно пачкать вердикт второму.
 */
export function classify(root, marker) {
  const text = root.text;
  // Сырьё: теги начертания стоят В ТЕКСТЕ вплотную к маркеру. Ловим и полный
  // payload, и «снята одна обёртка» (регрессия f19bb5f), и обратный порядок.
  const rawShapes = [
    `<strong><em>${marker}</em></strong>`,
    `<em><strong>${marker}</strong></em>`,
    `<em>${marker}</em>`,
    `<strong>${marker}</strong>`,
    `<strong><em>${marker}`,
    `<em>${marker}`,
    `${marker}</em>`,
    `${marker}</strong>`,
  ];
  if (rawShapes.some((s) => text.includes(s))) return 'raw';

  const ems = root.querySelectorAll('em').filter((em) => em.text.trim() === marker);
  if (ems.some((em) => hasAncestor(em.parentNode, 'strong'))) return 'ok';
  // Курсив съеден, жирный остался (или наоборот) — начертание потеряно частично,
  // для мерчанта это тот же «кнопка не работает».
  if (text.includes(marker)) return 'plain';
  return 'absent';
}

/**
 * Живой скрипт / атрибут-обработчик / js-ссылка, притащенные ЗНАЧЕНИЕМ ПОЛЯ.
 *
 * Привязка к маркеру обязательна: у тем есть СВОИ обработчики в разметке
 * (`<button onmouseover>` у кнопки «поделиться», `<img onerror>` у обложки
 * публикации). Без привязки они читались бы как дыра, тест стал бы шумным и
 * его отключили бы — ровно так гарды и умирают.
 */
export function xssFindings(root, marker) {
  const bad = [];
  const mine = (v) => typeof v === 'string' && v.includes(marker);
  for (const s of root.querySelectorAll('script')) {
    if (mine(s.text)) bad.push('<script> с полезной нагрузкой поля');
  }
  for (const el of root.querySelectorAll('*')) {
    const attrs = el.attributes ?? {};
    for (const [attr, value] of Object.entries(attrs)) {
      if (/^on/i.test(attr) && mine(value)) bad.push(`<${el.rawTagName} ${attr}=…>`);
    }
    const href = attrs.href;
    if (mine(href) && /^\s*javascript:/i.test(href)) bad.push('href="javascript:…"');
    const src = attrs.src;
    if (mine(src) && el.rawTagName?.toLowerCase() === 'img') {
      bad.push('<img src> из значения поля');
    }
  }
  return [...new Set(bad)];
}

export async function collect(theme, { xss = false } = {}) {
  const { parse } = createRequire(import.meta.url)('node-html-parser');
  const byBlock = await runtimeFields(theme);
  const jobs = [];
  const meta = [];
  for (const [block, paths] of Object.entries(byBlock)) {
    const props = { id: `${block}-rt`, ...structuredClone(EXTRA_PROPS[block] ?? {}) };
    const markers = {};
    paths.forEach((p, i) => {
      const m = MARKER(i + 1);
      markers[p] = m;
      setPath(props, p, xss ? xssPayload(m) : formatPayload(m));
    });
    jobs.push({ block, props, live: true, cascade: true });
    meta.push({ block, paths, markers });
  }
  const rendered = renderJobs(theme, jobs);
  const rows = [];
  rendered.forEach((res, idx) => {
    const { block, paths, markers } = meta[idx];
    const root = res.html ? parse(res.html) : null;
    for (const field of paths) {
      const marker = markers[field];
      let status;
      let detail = '';
      if (res.missing) {
        status = 'no-port';
        detail = 'модуль не найден ни в порте темы, ни в пакете темы, ни в theme-base';
      } else if (res.pipelineError) {
        status = 'pipeline';
        detail = res.pipelineError;
      } else if (res.error) {
        status = 'error';
        detail = res.error;
      } else if (xss) {
        const bad = xssFindings(root, marker);
        // Два законных исхода. `inlineFormat` (пять тем) экранирует ВСЁ значение:
        // оно перестало быть чистой обёрткой, и начертание тоже уезжает в текст.
        // `sanitizeInline` (theme-base, allow-list) оставляет разрешённые теги и
        // выбрасывает остальное. Оба безопасны. Недопустимы ровно два исхода:
        // находка (живой скрипт/обработчик/js-ссылка) и «поле молча исчезло» —
        // последнее иначе давало бы дешёвое «безопасно» через выкидывание ввода.
        const kept = classify(root, marker);
        status = bad.length ? 'xss' : kept === 'absent' ? 'dropped' : 'safe';
        detail = bad.join('; ') || (status === 'safe' ? kept : '');
      } else {
        status = classify(root, marker);
      }
      rows.push({ theme, block, field, marker, status, detail });
    }
  });
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const xss = argv.includes('--xss');
  if (argv.includes('--table')) {
    const all = [];
    for (const t of THEMES) all.push(...(await collect(t, { xss })));
    const byKey = new Map();
    for (const r of all) {
      const k = `${r.block}.${r.field}`;
      if (!byKey.has(k)) byKey.set(k, {});
      byKey.get(k)[r.theme] = r.status;
    }
    const W = 38;
    process.stdout.write(
      `${'секция.поле'.padEnd(W)}${THEMES.map((t) => t.padEnd(9)).join('')}\n`,
    );
    for (const [k, v] of [...byKey.entries()].sort()) {
      process.stdout.write(
        `${k.padEnd(W)}${THEMES.map((t) => String(v[t] ?? '—').padEnd(9)).join('')}\n`,
      );
    }
    const bad = all.filter((r) => !['ok', 'safe'].includes(r.status));
    process.stdout.write(`\nвсего ${all.length}, не ok: ${bad.length}\n`);
    for (const r of bad) {
      process.stdout.write(`  ${r.theme}/${r.block}.${r.field}: ${r.status} ${r.detail}\n`);
    }
    return;
  }
  const theme = argv.find((a) => !a.startsWith('--'));
  process.stdout.write(JSON.stringify(await collect(theme, { xss })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err));
    process.exit(1);
  });
}
