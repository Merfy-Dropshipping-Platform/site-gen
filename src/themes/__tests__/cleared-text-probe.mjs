#!/usr/bin/env node
/**
 * Проба «стёртый текст секции остаётся пустым» для одной темы.
 *
 * Для каждой секции темы (кроме шапки/подвала/промо) берём стартовые пропсы —
 * ровно то, что вставляет «Добавить секцию»: дефолты puckConfig + blockDefaults
 * темы (theme-puck-config.controller). Текстовые поля, которые мерчант видит в
 * панели (heading/title/subtitle/text/description/content, в т.ч. `heading.text`
 * и `text.content`), ставим в "" и рендерим живой цепочкой (render-theme-sections
 * `live`). Второй рендер — те же поля с меткой. Слова, которые есть в первом
 * рендере и которых нет во втором (за вычетом метки), — это текст, который
 * секция подставила вместо пустоты. Словарь заглушек не нужен: литерал в порте,
 * легаси-поле и дефолт темы ловятся одинаково.
 *
 * Использование: node cleared-text-probe.mjs <тема>
 * stdout — JSON-массив { block, fields, marks, extra, emptyLeft, error? };
 * emptyLeft — элементы, которые после стирания остались пустыми (тег + класс).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse } from 'node-html-parser';
import { renderJobs } from './render-theme-sections.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);
const { getBlockPuckDefaults } = req(resolve(ROOT, 'dist/src/render/block-defaults.js'));
const { deepMergeBlockProps } = req(resolve(ROOT, 'dist/src/services/preview.service.js'));

const TEXT_KEYS = ['heading', 'title', 'subtitle', 'text', 'description', 'content'];
const TEXT_TYPES = new Set(['text', 'textarea', 'aiText', 'richtext', 'richText', 'wysiwyg']);
const CHROME = new Set(['Header', 'Footer', 'PromoBanner']);
const MARK = 'ZQXMARK';
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'];

async function panelFields(theme, block) {
  for (const pkg of [`theme-${theme}`, 'theme-base']) {
    try {
      const mod = await import(resolve(ROOT, 'dist/astro-blocks', `${pkg}__${block}__index.mjs`));
      const cfg =
        mod[`${block}PuckConfig`] ??
        Object.values(mod).find((v) => v && typeof v === 'object' && 'fields' in v);
      if (cfg?.fields) return cfg.fields;
    } catch {
      // нет пакета темы — пробуем theme-base
    }
  }
  return {};
}

/** Пустышка для текстового слота панели: "" или { text: "" } / { content: "" }. */
function blankFor(field) {
  if (!field || field.type === 'hidden') return undefined;
  if (TEXT_TYPES.has(field.type)) return '';
  if (field.type !== 'object' || !field.objectFields) return undefined;
  const sub = ['text', 'content'].find((k) => TEXT_TYPES.has(field.objectFields[k]?.type));
  return sub ? { [sub]: '' } : undefined;
}

const text = (html) =>
  (html ?? '')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
const VOID_TAGS = new Set(['IMG', 'BR', 'HR', 'INPUT', 'META', 'LINK', 'SOURCE', 'WBR', 'AREA', 'COL', 'EMBED', 'TRACK']);
const VISIBLE = 'img,svg,video,picture,iframe,input,button,textarea,select,canvas';

/**
 * Сколько элементов без текста и без медиа. Сравнивается между рендером «стёрто»
 * и «метка»: прирост — пустой <h2>/<p> или обёртка с отступом, оставшиеся на
 * месте стёртого текста. Пустые в обоих рендерах (декор) взаимно гасятся.
 */
function emptyElements(html) {
  const root = parse(html ?? '');
  return root
    .querySelectorAll('*')
    .filter(
      (el) =>
        !SKIP_TAGS.has(el.tagName) &&
        !VOID_TAGS.has(el.tagName) &&
        !el.closest('script,style,template,noscript,svg') &&
        el.textContent.trim() === '' &&
        !el.querySelector(VISIBLE),
    )
    .map((el) => `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 80)}">`);
}

const isBlankSection = (html) => text(html).length === 0 && !parse(html ?? '').querySelector(VISIBLE);

/** Слова `a`, которых нет в `b` (мультимножество). */
function extraWords(a, b) {
  const left = new Map();
  for (const w of b) left.set(w, (left.get(w) ?? 0) + 1);
  return a.filter((w) => {
    const n = left.get(w) ?? 0;
    left.set(w, n - 1);
    return n <= 0;
  });
}

const withPatch = (base, patch) =>
  Object.fromEntries(
    Object.entries({ ...base, ...patch }).map(([k, v]) => [
      k,
      k in patch && typeof v === 'object' && typeof base[k] === 'object' && base[k] ? { ...base[k], ...v } : v,
    ]),
  );

export async function probeTheme(theme) {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/theme-sections', theme, 'manifest.json'), 'utf-8'));
  const themeJson = JSON.parse(readFileSync(resolve(ROOT, 'packages', `theme-${theme}`, 'theme.json'), 'utf-8'));
  // Секции, которые у темы рисует не свой порт, а пакет темы или theme-base
  // (у rose «Видео», «Публикации»), берём из манифестов соседних тем и рендерим
  // лестницей витрины (`cascade`), иначе они выпали бы из проверки.
  const allSections = new Set(
    THEMES.flatMap((t) => Object.keys(JSON.parse(readFileSync(resolve(ROOT, 'dist/theme-sections', t, 'manifest.json'), 'utf-8')))),
  );
  const cases = [];
  for (const block of [...allSections].filter((b) => !CHROME.has(b))) {
    const fields = await panelFields(theme, block);
    const blanks = Object.fromEntries(
      TEXT_KEYS.map((k) => [k, blankFor(fields[k])]).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(blanks).length === 0) continue;
    const puck = await getBlockPuckDefaults(theme, block);
    const base = { ...deepMergeBlockProps(puck, themeJson.blockDefaults?.[block] ?? {}), id: `${block}-1` };
    const marked = JSON.parse(JSON.stringify(blanks).replace(/""/g, `"${MARK}"`));
    cases.push({
      block,
      fields: Object.keys(blanks),
      cascade: !(block in manifest),
      blank: withPatch(base, blanks),
      marked: withPatch(base, marked),
    });
  }
  const out = await renderJobs(
    theme,
    cases.flatMap((c) => [
      { block: c.block, props: c.blank, live: true, cascade: c.cascade },
      { block: c.block, props: c.marked, live: true, cascade: c.cascade },
    ]),
  );
  return cases.map((c, i) => {
    const [blank, marked] = [out[2 * i], out[2 * i + 1]];
    const error = blank.error ?? blank.pipelineError ?? marked.error ?? marked.pipelineError;
    if (error) return { block: c.block, fields: c.fields, cascade: c.cascade, error: String(error).slice(0, 300) };
    const markedWords = text(marked.html);
    return {
      block: c.block,
      fields: c.fields,
      cascade: c.cascade,
      marks: markedWords.filter((w) => w.includes(MARK)).length,
      extra: extraWords(text(blank.html), text(marked.html.replaceAll(MARK, ' '))),
      // Стёрто всё и секция пуста целиком — остаётся только её корень с отступами
      // (без него секцию не выделить в превью); пустоты считаем, лишь когда рядом
      // осталось что-то видимое и отступ пустого элемента его сдвигает.
      emptyLeft: isBlankSection(blank.html)
        ? []
        : extraWords(emptyElements(blank.html), emptyElements(marked.html)),
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await probeTheme(process.argv[2]);
  process.stdout.write('\n' + JSON.stringify(result) + '\n');
}
