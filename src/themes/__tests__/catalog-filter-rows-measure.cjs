/**
 * Замер тап-таргетов строк-вариантов в раскрытых панелях фильтров каталога.
 *
 * Не тест и не часть CI — инструмент замера «до/после» на ЖИВЫХ стендах.
 * Лежит в репозитории потому, что прошлые замерные скрипты жили во временном
 * каталоге и исчезали вместе с сессией; проверять числа было нечем.
 *
 * Запуск (адреса стендов — в шапке файла, правьте под свои):
 *   node src/themes/__tests__/catalog-filter-rows-measure.cjs \
 *        <файл-с-правилом.css> [куда-положить.json]
 *
 * «до»    = стенд как задеплоен;
 * «после» = тот же DOM плюс правило из переданного файла, вложенное в
 *           СУЩЕСТВУЮЩИЙ `@layer utilities`. Не unlayered: unlayered победило бы
 *           что угодно и ничего бы не доказало.
 *
 * Три вещи, на которых предыдущие замеры врали:
 *   • опора — КОНСТАНТА 375, а не `window.innerWidth`: под мобильной эмуляцией
 *     он едет вместе с переполнением и прячет баг;
 *   • `scrollWidth` читается, пока панели РАСКРЫТЫ (на закрытых он зелёный
 *     всегда);
 *   • печатается ЧИСЛО найденных узлов: «0 из 0» — это дыра в замере, а не
 *     чистая тема (ровно так каталог flux выглядел «починенным»).
 *
 * Кандидат на строку — самый внутренний узел из p/li/label/button/a/input/
 * select/[role=…] и строк цены; sr-only 1×1 отбрасываются, иначе спрятанное
 * радио перебивает свой же видимый `<label>`.
 *
 * Playwright берётся по абсолютному пути: пакет CommonJS, named-import падает.
 */
const fs = require('node:fs');
const path = require('node:path');
// от корня сервиса, а не от домашнего каталога автора: скрипт живёт и в worktree
const pw = require(path.resolve(__dirname, '..', '..', '..', 'node_modules', 'playwright', 'index.js'));

const NARROW = 375;          // опора замера — константа, не innerWidth
const WIDE = 1280;
const MIN_TAP = 44;

const STANDS = {
  rose: 'https://7b64b7a527d2.merfy.ru',
  vanilla: 'https://5c178ceecc1d.merfy.ru',
  bloom: 'https://f7593c5f8f8f.merfy.ru',
  satin: 'https://8afc7b1ed6ee.merfy.ru',
  flux: 'https://u9fpo33bkmsd.merfy.ru',
};

const CANDIDATE_CSS = fs.readFileSync(process.argv[2], 'utf-8');

/** Сбор и обмер строк. Выполняется в странице. */
const COLLECT = (MIN_TAP) => {
  const bar = document.querySelector('[data-nt="catalog-filters"]');
  if (!bar) return { bar: false, panels: 0, rows: [], scrollWidth: document.documentElement.scrollWidth };

  // раскрыть все видимые фильтры
  const details = Array.from(bar.querySelectorAll('details'));
  const opened = [];
  for (const d of details) {
    if (getComputedStyle(d).display === 'none') continue;
    d.setAttribute('open', '');
    opened.push(d);
  }

  const CAND = [
    'p', 'li', 'label', 'button', 'a', 'input', 'select',
    '[role="option"]', '[role="menuitem"]', '[role="radio"]', '[role="checkbox"]',
    '[data-color-option]', '[data-collection-option]',
    '[data-nt="filter-price-rows"] > div', '[data-nt="catalog-price"] > div',
  ].join(',');

  const panels = [];
  for (const d of opened) {
    const panel = Array.from(d.children).find((c) => c.tagName !== 'SUMMARY');
    if (panel) panels.push({ label: (d.querySelector('summary')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24), panel });
  }

  const rows = [];
  for (const { label, panel } of panels) {
    let cands = Array.from(panel.querySelectorAll(CAND));
    // видимые
    cands = cands.filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false; // sr-only 1x1 — вон
      return true;
    });
    // самый внутренний: предок другого выжившего кандидата не считается
    const inner = cands.filter((el) => !cands.some((o) => o !== el && el.contains(o)));
    for (const el of inner) {
      const r = el.getBoundingClientRect();
      rows.push({
        filter: label,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22) || el.getAttribute('placeholder') || '(поле)',
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
        minSide: Math.round(Math.min(r.width, r.height) * 100) / 100,
      });
    }
  }

  const panelBoxes = panels.map(({ label, panel }) => {
    const r = panel.getBoundingClientRect();
    return { label, x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right) };
  });

  return {
    bar: true,
    panels: panels.length,
    panelBoxes,
    rows,
    bad: rows.filter((r) => r.minSide < MIN_TAP).length,
    worst: rows.length ? Math.min(...rows.map((r) => r.minSide)) : null,
    // контроль переполнения: панели РАСКРЫТЫ
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  };
};

/** Десктоп: у vanilla родная раскладка — сайдбар, top-строка скрыта.
 *  Чтобы контроль «десктоп не поехал» не был «0 из 0», включаем top явно. */
const FORCE_TOP_LAYOUT = () => {
  let n = 0;
  for (const el of document.querySelectorAll('[data-catalog-layout]')) {
    el.setAttribute('data-catalog-layout', 'top');
    n++;
  }
  return n;
};

const CLOSE_ALL = () => {
  const bar = document.querySelector('[data-nt="catalog-filters"]');
  if (!bar) return;
  for (const d of bar.querySelectorAll('details')) d.removeAttribute('open');
};

async function run(browser, theme, base, { width, mobile }) {
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 812 : 1400 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    ...(mobile
      ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : {}),
  });
  const page = await ctx.newPage();
  const out = { theme, width, mobile };
  try {
    await page.goto(base + '/catalog', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    // стиль-кандидат: в документ, но выключен
    await page.evaluate((css) => {
      const el = document.createElement('style');
      el.id = 'b12-candidate';
      el.textContent = css;
      document.head.appendChild(el);
      el.disabled = true;
    }, CANDIDATE_CSS);

    if (!mobile) out.forcedTop = await page.evaluate(FORCE_TOP_LAYOUT);
    out.before = await page.evaluate(COLLECT, MIN_TAP);
    await page.evaluate(CLOSE_ALL);
    await page.evaluate(() => { document.getElementById('b12-candidate').disabled = false; });
    await page.waitForTimeout(250);
    out.after = await page.evaluate(COLLECT, MIN_TAP);
  } catch (e) {
    out.error = e.message.slice(0, 200);
  }
  await ctx.close();
  return out;
}

(async () => {
  const browser = await pw.chromium.launch();
  const results = [];
  for (const [theme, base] of Object.entries(STANDS)) {
    results.push(await run(browser, theme, base, { width: NARROW, mobile: true }));
    results.push(await run(browser, theme, base, { width: WIDE, mobile: false }));
  }
  await browser.close();

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n╔══ МОБИЛЬНЫЙ ЗАМЕР ${NARROW}px (isMobile+hasTouch), норма ${MIN_TAP}px ══`);
  console.log('║ ' + pad('тема', 9) + pad('панелей', 9) + pad('найдено', 9) + pad('<44 ДО', 9) + pad('худш.ДО', 9) + pad('<44 ПОСЛЕ', 11) + pad('худш.ПОСЛЕ', 11) + 'scrollWidth(раскрыто) до→после');
  for (const r of results.filter((x) => x.mobile)) {
    if (r.error) { console.log('║ ' + pad(r.theme, 9) + 'ОШИБКА: ' + r.error); continue; }
    const b = r.before, a = r.after;
    console.log('║ ' + pad(r.theme, 9) + pad(b.panels, 9) + pad(b.rows.length, 9) + pad(b.bad, 9) + pad(b.worst ?? '—', 9) + pad(a.bad, 11) + pad(a.worst ?? '—', 11) + `${b.scrollWidth} → ${a.scrollWidth}`);
  }
  console.log(`\n╔══ КОНТРОЛЬ ${WIDE}px (мышь): десктоп не должен поехать ══`);
  console.log('║ ' + pad('тема', 9) + pad('найдено', 9) + pad('высоты ДО', 30) + 'высоты ПОСЛЕ');
  for (const r of results.filter((x) => !x.mobile)) {
    if (r.error) { console.log('║ ' + pad(r.theme, 9) + 'ОШИБКА: ' + r.error); continue; }
    const hb = [...new Set(r.before.rows.map((x) => x.h))].sort((a, b) => a - b);
    const ha = [...new Set(r.after.rows.map((x) => x.h))].sort((a, b) => a - b);
    const same = JSON.stringify(hb) === JSON.stringify(ha);
    console.log('║ ' + pad(r.theme, 9) + pad(r.before.rows.length, 9) + pad(hb.join(','), 30) + ha.join(',') + (same ? '   ✓ без изменений' : '   ✗ ПОЕХАЛ'));
  }

  console.log(`\n╔══ КОНТРОЛЬ: панели не выходят за ${NARROW}px и не меняют ширину ══`);
  console.log('║ ' + pad('тема', 9) + 'панель: ширина ДО→ПОСЛЕ, правый край ДО→ПОСЛЕ');
  for (const r of results.filter((x) => x.mobile && !x.error)) {
    for (let i = 0; i < r.before.panelBoxes.length; i++) {
      const b = r.before.panelBoxes[i], a = r.after.panelBoxes[i];
      const okW = b.w === a.w ? '✓' : '✗ ШИРИНА ПОЕХАЛА';
      const okR = a.right <= NARROW ? '✓' : '✗ ЗА ЭКРАН';
      console.log('║ ' + pad(r.theme, 9) + pad(b.label, 20) + pad(`w ${b.w}→${a.w} ${okW}`, 26) + `right ${b.right}→${a.right} ${okR}`);
    }
  }

  console.log('\n── подробности «до» (мобильный) ──');
  for (const r of results.filter((x) => x.mobile && !x.error)) {
    console.log(`\n[${r.theme}] найдено ${r.before.rows.length} узлов:`);
    for (let i = 0; i < r.before.rows.length; i++) {
      const b = r.before.rows[i];
      const a = r.after.rows[i];
      console.log(`   ${pad(b.filter, 18)} ${pad(b.tag, 7)} ${pad(b.text, 24)} ${pad(b.w + '×' + b.h, 16)} min=${pad(b.minSide, 7)} → ${a ? a.w + '×' + a.h + ' min=' + a.minSide : '?'}`);
    }
  }

  fs.writeFileSync(process.argv[3] || '/tmp/b12-measure.json', JSON.stringify(results, null, 1));
})();
