#!/usr/bin/env node
/**
 * Матрица «живости» настроек v3 — по всем секциям, РЕАЛЬНО присутствующим на
 * тестовой странице конструктора.
 *
 * ПОЧЕМУ v2 (settings-liveness2.mjs) НЕ ГОДИТСЯ: она сравнивала
 * `render(A) !== render(B)` через `/preview/block` — голый серверный HTML БЕЗ
 * клиентского JS (GSAP/reveal-анимация вообще не загружается в изолированном
 * fetch-запросе). 2026-08-02 из 7 багов, наговорённых владельцем вживую через
 * реальный конструктор, v2 не поймала НИ ОДНОГО: реальный root cause был
 * client-side (`.has-js [data-reveal]{opacity:0}` — GSAP ScrollTrigger,
 * собранный один раз при загрузке, не видит свежие DOM-узлы после
 * hot-replace `update-block`/`el.outerHTML=html` в preview.service.ts — узел
 * навсегда виснет на opacity:0, HTML при этом полностью корректен). v2 видела
 * ТОЛЬКО корректный HTML и не могла в принципе поймать «текст в DOM есть, но
 * невидим» — она ведь не открывала браузер.
 *
 * v3 ИСПРАВЛЯЕТ ЭТО: грузит `/preview?page=X` В РЕАЛЬНОМ Playwright-браузере
 * (тот же URL, что открывает iframe конструктора — авторизация не нужна,
 * эндпоинт публичный) — значит GSAP/reveal-скрипты реально выполняются. Затем
 * шлёт `postMessage({type:'update-block', blockId, props})` НАПРЯМУЮ странице
 * (без обёртки конструктора — `window.parent === window` на top-level
 * странице, `post()` внутри preview.service.ts шлёт `parent.postMessage`,
 * что для top-level = self-postMessage, тот же `window.addEventListener
 * ('message', …)` его ловит). Это ТОЧНО ТОТ ЖЕ путь, что использует
 * PreviewFrame.tsx в реальном конструкторе при правке любого поля — не
 * имитация, а прямой вызов того же клиентского кода.
 *
 * После каждого update-block — ДВА проверяемых сигнала (не один, как в v2):
 *   1. LIVE: normalized HTML блока действительно изменился между вариантами
 *      A/B (сигнал v2, полезен, но недостаточен сам по себе).
 *   2. VISIBLE: ни один [data-reveal]/[data-reveal-group]>* потомок блока не
 *      застрял на computed opacity:"0" — это ИМЕННО тот класс бага, который
 *      v2 была не в состоянии обнаружить.
 * Настройка засчитывается рабочей ТОЛЬКО когда LIVE И VISIBLE одновременно.
 *
 * ДВЕ ЛОВУШКИ, НА КОТОРЫЕ САМ ЭТОТ СКРИПТ НАСТУПИЛ ПРИ ПЕРВОМ ПРОГОНЕ (важно
 * не наступить снова при дальнейшей правке):
 *  1. ScrollTrigger триггерит reveal при start:"top 85%" — секция НИЖЕ 85%
 *     высоты вьюпорта на scrollY=0 ещё не в зоне триггера → opacity:0 ЗАКОННО
 *     (не баг, просто не докрутили). Без scrollIntoView ЛЮБАЯ секция ниже
 *     Hero даёт ложный «зависает невидимым». Инструмент, красящий ВСЁ красным
 *     без разбора — так же бесполезен, как v2, красивший всё зелёным.
 *  2. update-block с ГОЛЫМИ пропами (`{id, [единственное_поле]: значение}`)
 *     без остальных реальных пропов блока — для Hero это роняет блок в
 *     isEmpty-плейсхолдер-ветку (там НЕТ [data-reveal] и позиция/выравнивание
 *     не действуют вовсе) → ложные «не реагирует». Нужны РЕАЛЬНЫЕ текущие
 *     пропы блока (тянем из site_revision в БД), поверх которых меняем ОДНО
 *     поле — как это делает настоящий PreviewFrame.tsx.
 *
 * ⚠️ ГРАНИЦЫ ЭТОГО ИНСТРУМЕНТА (без замалчивания):
 *  - Проверяет ТОЛЬКО блоки, реально присутствующие на загруженной странице
 *    сейчас (обнаруживаются через живой DOM-запрос, не хардкод-список). Блок,
 *    которого на странице нет — не появится в отчёте вообще: update-block
 *    умеет менять ТОЛЬКО существующий в DOM узел; добавление нового блока —
 *    отдельный канал `reconcile`, сюда не входит.
 *  - Проверяет ТОЛЬКО поля с перечислимыми пробными значениями (select/
 *    toggle/slider/alignment/aiText/text) — не массивы (slides/columns/rows),
 *    не colorScheme (схему вешает обёртка компоновщика страницы, не сам блок
 *    — см. v2).
 *  - НЕ проверяет, что конкретное НОВОЕ значение появилось в ОЖИДАЕМОМ месте
 *    DOM — только что HTML блока меняется и остаётся видимым. Ловит «сломано
 *    полностью» (наш случай сегодня), НЕ ловит «работает, но не туда». Смысл
 *    значения — за человеком, как в BUGS-FLUX.md «Как чинить».
 *  - Читает текущие пропы блока НАПРЯМУЮ из БД (docker exec psql) — требует
 *    локальный docker-контейнер `merfy-postgres`. Ничего в БД не пишет
 *    (SELECT только) — postMessage летит мимо конструктора и его autosave,
 *    safe перезапускать.
 *
 *   node flux-baseline/settings-liveness3.mjs [siteId] [page]
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const SITE_ID = process.argv[2] || '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const PAGE = process.argv[3] || 'home';
const API = 'http://localhost:3110/api';
const PREVIEW_URL = `${API}/sites/${SITE_ID}/preview?page=${encodeURIComponent(PAGE)}`;

function currentPageContent() {
  const sql = `select data::jsonb->'pagesData'->'${PAGE}'->'content' from site_revision where id = (select current_revision_id from site where id='${SITE_ID}');`;
  const out = execSync(
    `docker exec merfy-postgres psql -U postgres -d sites_service -tAc "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' },
  ).trim();
  return JSON.parse(out || '[]');
}

function probeValues(field) {
  const t = field?.type;
  if (t === 'select' || t === 'radio') {
    const o = (field.options || []).map((x) => x.value);
    return o.length >= 2 ? [o[0], o[o.length - 1]] : null;
  }
  if (t === 'toggle') return ['true', 'false'];
  if (t === 'slider') {
    const min = field.min ?? 0, max = field.max ?? 100;
    return min !== max ? [min, max] : null;
  }
  if (t === 'alignment') return ['left', 'right'];
  // v3: aiText/text не проверялись в v2 вообще — а именно в heading/subtitle
  // этих полей жили B4/B5/B7.
  if (t === 'aiText' || t === 'text') return ['Проба А значения поля', 'Проба Б значения поля'];
  return null;
}

const norm = (h) =>
  String(h)
    .replace(/astro-[a-z0-9]+/gi, 'astro-X')
    .replace(/data-astro-[^\s">]+/g, '')
    .replace(/\s+/g, ' ');

const cfg = await (await fetch(`${API}/themes/flux/puck-config`)).json();
const content = currentPageContent();
const propsByBlockId = new Map(content.map((b) => [b.props?.id, b.props]));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// КРИТИЧНО (третья ловушка, найдена при отладке пустого 0/39 отчёта): без
// 'init' сообщения `currentSiteId`/`currentThemeId` в preview.service.ts
// остаются пустой строкой (заполняются ТОЛЬКО обработчиком 'init'), а
// update-block-хендлер начинается с `if (!blockId || !currentSiteId) return;`
// — то есть КАЖДЫЙ update-block молча no-op'ится без этого шага. На
// top-level странице (не iframe) `post({type:'ready'})` шлёт себе же
// (parent===window) — эмулируем родителя, отвечая на него сами.
await page.evaluate(({ siteId, themeId, pageId }) => {
  window.postMessage({ type: 'init', siteId, themeId, pageId, data: undefined }, '*');
}, { siteId: SITE_ID, themeId: 'flux', pageId: PAGE });
await page.waitForTimeout(300);

// Обнаружить блоки, реально присутствующие на странице — НЕ хардкод-список.
const present = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[data-puck-component-id]'));
  return els
    .map((el) => el.getAttribute('data-puck-component-id'))
    .filter((id, i, arr) => id && arr.indexOf(id) === i);
});
console.log(`страница "${PAGE}": обнаружено ${present.length} блоков — ${present.join(', ')}\n`);

async function scrollToBlockAndSettle(blockId) {
  await page.evaluate((id) => {
    document.querySelector(`[data-puck-component-id="${id}"]`)?.scrollIntoView({ block: 'center' });
  }, blockId);
  await page.waitForTimeout(900); // 60мс debounce (dispatchAstroNavEventsDebounced) + 600мс GSAP tween + запас
}

async function sendUpdateBlock(blockId, props) {
  await page.evaluate(
    ({ blockId, props }) => {
      window.postMessage({ type: 'update-block', pageId: 'home', blockId, props }, '*');
    },
    { blockId, props },
  );
  await page.waitForTimeout(900); // fetch /preview/block + outerHTML replace + reveal tween
}

async function readBlock(blockId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-puck-component-id="${id}"]`);
    if (!el) return { found: false };
    const reveals = Array.from(el.querySelectorAll('[data-reveal], [data-reveal-group] > *'));
    const stuckInvisible = reveals.some((r) => getComputedStyle(r).opacity === '0');
    return { found: true, html: el.outerHTML, stuckInvisible, revealCount: reveals.length };
  }, blockId);
}

const results = [];
for (const blockId of present) {
  const blockType = blockId.split('-')[0];
  const fields = cfg.components?.[blockType]?.fields ?? {};
  const realProps = propsByBlockId.get(blockId);
  if (!realProps) {
    console.log(`(пропущен ${blockId} — не найден в site_revision.data, вероятно хром вне pagesData)`);
    continue;
  }

  await scrollToBlockAndSettle(blockId);
  const baseline = await readBlock(blockId);
  if (!baseline.found) continue;
  if (baseline.stuckInvisible) {
    console.log(`\n⚠️  ${blockId} УЖЕ невидим ДО каких-либо правок (после scrollIntoView+900мс) — возможен отдельный баг, требует ручной проверки, пропускаю поля этого блока.`);
    continue;
  }

  for (const [name, field] of Object.entries(fields)) {
    if (field?.type === 'hidden') continue;
    if (['colorScheme', 'containerColorScheme', 'copyrightColorScheme', 'menuColorScheme'].includes(name)) continue;
    const vals = probeValues(field);
    if (!vals) continue;

    let r;
    try {
      await sendUpdateBlock(blockId, { ...realProps, [name]: vals[0] });
      const a = await readBlock(blockId);
      await sendUpdateBlock(blockId, { ...realProps, [name]: vals[1] });
      const b = await readBlock(blockId);

      const live = a.found && b.found && norm(a.html) !== norm(b.html);
      const stuckInvisible = (a.found && a.stuckInvisible) || (b.found && b.stuckInvisible);
      r = { blockId, blockType, name, label: field.label || name, live, stuckInvisible, err: !a.found || !b.found };
    } catch (e) {
      r = { blockId, blockType, name, label: field.label || name, live: false, stuckInvisible: false, err: true, errMsg: String(e).slice(0, 120) };
    }
    results.push(r);
    process.stdout.write('.');
  }
  // Восстановить исходный блок реальными пропами (НЕ page.goto reload —
  // дороже и сбрасывает scroll у всех последующих блоков без выгоды: те же
  // realProps уже под рукой).
  await sendUpdateBlock(blockId, realProps);
}
console.log('\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('блок', 20) + pad('настройка', 30) + 'вердикт');
console.log('-'.repeat(70));
const broken = [];
for (const r of results) {
  let verdict;
  if (r.err) verdict = 'ОШИБКА';
  else if (r.stuckInvisible) verdict = '⚠️ ЗАВИСАЕТ НЕВИДИМЫМ (opacity:0)';
  else if (!r.live) verdict = 'НЕ РЕАГИРУЕТ';
  else verdict = 'живая';
  if (verdict !== 'живая') broken.push({ ...r, verdict });
  console.log(pad(r.blockId, 20) + pad(r.label, 30) + verdict);
}
console.log(`\nживых: ${results.length - broken.length}/${results.length}`);
if (broken.length) {
  console.log('\nтребуют внимания:');
  broken.forEach((b) => console.log(`  ${b.blockId}.${b.name} «${b.label}» — ${b.verdict}${b.errMsg ? ' (' + b.errMsg + ')' : ''}`));
}

await browser.close();
process.exit(broken.some((b) => b.verdict.includes('ЗАВИСАЕТ')) ? 1 : 0);
